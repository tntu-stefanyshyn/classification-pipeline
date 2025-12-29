import json
import os
import sys
import tempfile
import urllib.request
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import boto3
import numpy as np
import pandas as pd
from sklearn.decomposition import FastICA, PCA
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC


def _emit(event: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(event, ensure_ascii=True) + "\n")
    sys.stdout.flush()


def _emit_progress(progress: int, message: str) -> None:
    _emit({"type": "progress", "progress": progress, "message": message})


def _timestamp() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _load_payload() -> Dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        raw = os.getenv("COMPUTE_PAYLOAD_JSON", "")
    if not raw.strip():
        raise ValueError("Не передано дані для обчислення")
    return json.loads(raw)


def _store_result(payload: Dict[str, Any], data: Dict[str, Any]) -> None:
    if not isinstance(payload, dict):
        return
    bucket = payload.get("result_s3_bucket") or os.getenv("COMPUTE_RESULT_S3_BUCKET", "")
    key = payload.get("result_s3_key") or os.getenv("COMPUTE_RESULT_S3_KEY", "")
    if not bucket or not key:
        return

    body = json.dumps(data, ensure_ascii=True)
    boto3.client("s3").put_object(
        Bucket=bucket,
        Key=key,
        Body=body.encode("utf-8"),
        ContentType="application/json",
    )


def _graphql_request(
    url: str, query: str, variables: Optional[Dict[str, Any]] = None, token: Optional[str] = None
) -> Dict[str, Any]:
    payload = {"query": query, "variables": variables or {}}
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    request = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"), headers=headers
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        raw = response.read().decode("utf-8")
    data = json.loads(raw or "{}")
    if data.get("errors"):
        message = data["errors"][0].get("message") or "GraphQL request failed"
        raise ValueError(message)
    if "data" not in data:
        raise ValueError("GraphQL response is empty")
    return data["data"]


def _fetch_path_from_backend(
    backend_url: str, run_id: str, token: Optional[str] = None
) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    run_query = """
      query ExperimentRun($runId: ID!) {
        experimentRun(runId: $runId) {
          experimentId
          pathNodeIds
        }
      }
    """
    run_payload = _graphql_request(backend_url, run_query, {"runId": run_id}, token)
    run = run_payload.get("experimentRun")
    if not run:
        raise ValueError("Run not found")

    experiment_id = run.get("experimentId")
    path_node_ids = run.get("pathNodeIds") or []
    if not experiment_id:
        raise ValueError("Experiment id is missing for run")

    experiment_query = """
      query ExperimentForRun($id: ID!) {
        experiment(_id: $id) {
          _id
          fileId
          graph {
            nodes {
              _id
              stage
              technology
              settings {
                key
                value
              }
            }
          }
        }
      }
    """
    experiment_payload = _graphql_request(
        backend_url, experiment_query, {"id": experiment_id}, token
    )
    experiment = experiment_payload.get("experiment")
    if not experiment:
        raise ValueError("Experiment not found")

    nodes = (experiment.get("graph") or {}).get("nodes") or []
    node_map = {node.get("_id"): node for node in nodes}
    path_nodes = []
    for node_id in path_node_ids:
        node = node_map.get(node_id)
        if not node:
            raise ValueError("Graph path nodes are missing")
        path_nodes.append(node)

    file_id = experiment.get("fileId")
    return path_nodes, file_id


def _fetch_signed_download_url(
    backend_url: str, file_id: str, token: Optional[str] = None
) -> str:
    query = """
      query SignedDownloadUrl($fileId: ID!) {
        signedDownloadUrl(fileId: $fileId) {
          url
        }
      }
    """
    payload = _graphql_request(backend_url, query, {"fileId": file_id}, token)
    url = (payload.get("signedDownloadUrl") or {}).get("url")
    if not url:
        raise ValueError("Не вдалося отримати посилання на файл")
    return url


def _download_s3_to_temp(bucket: str, key: str) -> str:
    client = boto3.client("s3")
    tmp = tempfile.NamedTemporaryFile(prefix="eeg-", suffix=".csv", delete=False)
    try:
        client.download_fileobj(bucket, key, tmp)
        return tmp.name
    finally:
        tmp.close()


def _load_dataframe(payload: Dict[str, Any], backend_url: Optional[str]) -> pd.DataFrame:
    file_url = payload.get("file_url") or ""
    file_path = payload.get("file_path") or ""
    temp_path = ""

    if not file_url and not file_path:
        bucket = payload.get("file_s3_bucket") or ""
        key = payload.get("file_s3_key") or ""
        if bucket and key:
            temp_path = _download_s3_to_temp(bucket, key)
            file_path = temp_path
        elif backend_url and payload.get("file_id"):
            file_url = _fetch_signed_download_url(backend_url, payload.get("file_id"))

    if not file_url and not file_path:
        raise ValueError("Не вдалося отримати шлях до EEG файлу")

    try:
        df = pd.read_csv(file_url or file_path)
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                pass

    if df.empty:
        raise ValueError("EEG файл порожній")
    return df


def _settings_to_dict(settings: List[Dict[str, Any]]) -> Dict[str, str]:
    result: Dict[str, str] = {}
    for entry in settings or []:
        key = str(entry.get("key") or "").strip()
        if not key:
            continue
        value = entry.get("value")
        result[key] = str(value) if value is not None else ""
    return result


def _to_float(value: Any, default: Optional[float] = None) -> Optional[float]:
    if isinstance(value, (int, float)) and np.isfinite(value):
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            return float(value)
        except ValueError:
            return default
    return default


def _to_int(value: Any, default: Optional[int] = None) -> Optional[int]:
    if isinstance(value, int):
        return value
    if isinstance(value, float) and np.isfinite(value):
        return int(value)
    if isinstance(value, str) and value.strip():
        try:
            return int(float(value))
        except ValueError:
            return default
    return default


def _to_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y"}
    return default


def _resolve_target_column(
    df: pd.DataFrame, payload: Dict[str, Any], path: List[Dict[str, Any]]
) -> str:
    candidate = payload.get("target_column")
    if candidate and candidate in df.columns:
        return candidate

    for node in path:
        settings = _settings_to_dict(node.get("settings") or [])
        candidate = settings.get("target_column") or settings.get("label_column")
        if candidate and candidate in df.columns:
            return candidate

    for fallback in ("label", "target", "class"):
        if fallback in df.columns:
            return fallback

    return df.columns[-1]


def _prepare_features(df: pd.DataFrame, target_column: str) -> Tuple[pd.DataFrame, pd.Series]:
    if target_column not in df.columns:
        raise ValueError("Target column is missing in EEG data")

    y = df[target_column]
    X = df.drop(columns=[target_column])
    X = pd.get_dummies(X)
    X = X.replace([np.inf, -np.inf], np.nan)
    means = X.mean(numeric_only=True)
    X = X.fillna(means).fillna(0)

    if X.empty:
        raise ValueError("EEG файл не містить ознак для класифікації")

    return X, y


def _apply_preprocessing(X: pd.DataFrame, settings: Dict[str, str]) -> pd.DataFrame:
    values = X.values.astype(float)
    if _to_bool(settings.get("log")):
        values = np.sign(values) * np.log1p(np.abs(values))

    scaler = StandardScaler()
    values = scaler.fit_transform(values)
    return pd.DataFrame(values, columns=X.columns)


def _apply_artifact_suppression(X: pd.DataFrame, settings: Dict[str, str]) -> pd.DataFrame:
    threshold = _to_float(settings.get("threshold"), 3.0) or 3.0
    method = (settings.get("method") or "median").lower()
    values = X.values.astype(float)

    if method == "mean":
        center = np.nanmean(values, axis=0)
    else:
        center = np.nanmedian(values, axis=0)
    spread = np.nanstd(values, axis=0)

    lower = center - threshold * spread
    upper = center + threshold * spread

    for idx in range(values.shape[1]):
        if not np.isfinite(spread[idx]) or spread[idx] == 0:
            continue
        if method == "winsor":
            values[:, idx] = np.clip(values[:, idx], lower[idx], upper[idx])
        else:
            mask = np.abs(values[:, idx] - center[idx]) > threshold * spread[idx]
            values[mask, idx] = center[idx]

    return pd.DataFrame(values, columns=X.columns)


def _apply_ica(X: pd.DataFrame, settings: Dict[str, str]) -> pd.DataFrame:
    n_components = _to_int(settings.get("n_components")) or min(20, X.shape[1])
    algorithm = (settings.get("algorithm") or "parallel").lower()
    whiten = (settings.get("whiten") or "unit-variance").lower()
    fun = (settings.get("fun") or "logcosh").lower()
    max_iter = _to_int(settings.get("max_iter"), 200) or 200
    tol = _to_float(settings.get("tol"), 0.0001) or 0.0001
    random_state = _to_int(settings.get("random_state"), 42)

    whiten_value: Any = whiten
    if whiten in {"false", "none", "0"}:
        whiten_value = False

    transformer = FastICA(
        n_components=n_components,
        algorithm=algorithm,
        whiten=whiten_value,
        fun=fun,
        max_iter=max_iter,
        tol=tol,
        random_state=random_state,
    )
    values = transformer.fit_transform(X.values.astype(float))
    columns = [f"ica_{idx}" for idx in range(values.shape[1])]
    return pd.DataFrame(values, columns=columns)


def _parse_pca_components(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        raw = value.strip().lower()
        if not raw:
            return None
        if raw == "mle":
            return "mle"
        try:
            numeric = float(raw)
        except ValueError:
            return None
        if numeric.is_integer() and "." not in raw:
            return int(numeric)
        return numeric
    return None


def _apply_pca(X: pd.DataFrame, settings: Dict[str, str]) -> pd.DataFrame:
    n_components = _parse_pca_components(settings.get("n_components"))
    svd_solver = (settings.get("svd_solver") or "auto").lower()
    whiten = _to_bool(settings.get("whiten"), False)
    iterated_power = settings.get("iterated_power") or "auto"
    random_state = _to_int(settings.get("random_state"), 42)
    tol = _to_float(settings.get("tol"), 0.0) or 0.0

    transformer = PCA(
        n_components=n_components,
        svd_solver=svd_solver,
        whiten=whiten,
        iterated_power=iterated_power,
        random_state=random_state,
        tol=tol,
    )
    values = transformer.fit_transform(X.values.astype(float))
    columns = [f"pca_{idx}" for idx in range(values.shape[1])]
    return pd.DataFrame(values, columns=columns)


def _build_classifier(technology: str, settings: Dict[str, str]):
    normalized = technology.strip().lower()

    if normalized == "svm":
        c_value = _to_float(settings.get("c"), 1.0) or 1.0
        kernel = (settings.get("kernel") or "rbf").lower()
        degree = _to_int(settings.get("degree"), 3) or 3
        gamma = settings.get("gamma") or "scale"
        try:
            gamma_value: Any = float(gamma)
        except (TypeError, ValueError):
            gamma_value = gamma
        coef0 = _to_float(settings.get("coef0"), 0.0) or 0.0
        shrinking = _to_bool(settings.get("shrinking"), True)
        probability = _to_bool(settings.get("probability"), False)
        tol = _to_float(settings.get("tol"), 0.001) or 0.001
        max_iter = _to_int(settings.get("max_iter"), -1) or -1
        class_weight_raw = (settings.get("class_weight") or "none").lower()
        class_weight = "balanced" if class_weight_raw == "balanced" else None

        return SVC(
            C=c_value,
            kernel=kernel,
            degree=degree,
            gamma=gamma_value,
            coef0=coef0,
            shrinking=shrinking,
            probability=probability,
            tol=tol,
            max_iter=max_iter,
            class_weight=class_weight,
        )

    if normalized == "cnn":
        epochs = _to_int(settings.get("epochs"), 30) or 30
        batch_size = _to_int(settings.get("batch_size"), 32) or 32
        learning_rate = _to_float(settings.get("learning_rate"), 0.001) or 0.001
        optimizer = (settings.get("optimizer") or "adam").lower()
        solver = "sgd" if optimizer == "sgd" else "adam"
        random_state = _to_int(settings.get("random_state"), 42)

        return MLPClassifier(
            hidden_layer_sizes=(128, 64),
            solver=solver,
            batch_size=batch_size,
            learning_rate_init=learning_rate,
            max_iter=epochs,
            random_state=random_state,
        )

    return LogisticRegression(max_iter=1000)


def _run_classifier(
    X: pd.DataFrame, y: pd.Series, technology: str, settings: Dict[str, str]
) -> Dict[str, Any]:
    test_size = _to_float(settings.get("test_size"), 0.2) or 0.2
    random_state = _to_int(settings.get("random_state"), 42)

    try:
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=test_size, random_state=random_state, stratify=y
        )
    except ValueError:
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=test_size, random_state=random_state, stratify=None
        )

    model = _build_classifier(technology, settings)
    model.fit(X_train, y_train)
    y_pred = model.predict(X_val)

    return classification_report(y_val, y_pred, output_dict=True, zero_division=0)


def run_compute(payload: Dict[str, Any]) -> Dict[str, Any]:
    backend_url = payload.get("backend_url") or os.getenv("COMPUTE_BACKEND_URL", "")
    token = payload.get("backend_token") or os.getenv("COMPUTE_BACKEND_TOKEN")

    path = payload.get("path") or []
    if backend_url and payload.get("run_id"):
        path, file_id = _fetch_path_from_backend(backend_url, payload.get("run_id"), token)
        payload["path"] = path
        if file_id and not payload.get("file_id"):
            payload["file_id"] = file_id

    _emit_progress(0, "Запуск обчислення")

    if not path:
        _emit_progress(100, "Немає кроків для обчислення")
        return {"path_length": 0, "nodes": [], "completed_at": _timestamp()}

    _emit_progress(5, "Зчитування EEG файлу")
    df = _load_dataframe(payload, backend_url or None)
    _emit_progress(10, "EEG файл зчитано")

    target_column = _resolve_target_column(df, payload, path)
    X, y = _prepare_features(df, target_column)

    report: Optional[Dict[str, Any]] = None
    total = len(path)
    for index, node in enumerate(path, start=1):
        stage = str(node.get("stage") or "").upper()
        technology = str(node.get("technology") or "").strip()
        settings = _settings_to_dict(node.get("settings") or [])
        label = technology or stage or f"крок {index}"
        progress = 10 + int((index / total) * 80)
        _emit_progress(progress, f"Крок {index}/{total}: {label}")

        if stage == "PREPROCESSING":
            X = _apply_preprocessing(X, settings)
        elif stage == "DATA_ENHANCEMENT":
            X = _apply_artifact_suppression(X, settings)
        elif stage == "FEATURE_EXTRACTION":
            X = _apply_ica(X, settings)
        elif stage == "DIMENSIONALITY_REDUCTION":
            X = _apply_pca(X, settings)
        elif stage == "CLASSIFICATION":
            report = _run_classifier(X, y, technology or "svm", settings)
            break

    if report is None:
        raise ValueError("Не знайдено етап класифікації")

    report["path_length"] = total
    report["nodes"] = [node.get("technology") or node.get("stage") for node in path]
    report["completed_at"] = _timestamp()

    _emit_progress(100, "Обчислення завершено")
    return report


def main() -> None:
    payload: Dict[str, Any] = {}
    try:
        payload = _load_payload()
        result = run_compute(payload)
        _store_result(
            payload,
            {"status": "completed", "result": result, "completed_at": _timestamp()},
        )
        _emit({"type": "result", "result": result})
    except Exception as exc:  # noqa: BLE001
        try:
            _store_result(
                payload if isinstance(payload, dict) else {},
                {"status": "failed", "error": str(exc), "failed_at": _timestamp()},
            )
        except Exception:
            pass
        _emit({"type": "error", "message": str(exc)})
        sys.exit(1)


if __name__ == "__main__":
    main()

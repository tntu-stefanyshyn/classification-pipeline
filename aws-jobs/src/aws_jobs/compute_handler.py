import json
import os
import sys
import tempfile
import time
from typing import Any, Dict, List, Optional, Tuple

import boto3 # type: ignore
import numpy as np # type: ignore
import pandas as pd
from sklearn.decomposition import FastICA, PCA
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
  accuracy_score,
  confusion_matrix,
  f1_score,
  roc_auc_score,
)
from sklearn.model_selection import KFold, StratifiedKFold
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from graphql.completePipeline import completePipeline 
from graphql.graphqlRequest import graphqlRequest 
from graphql.updatePipelineProgress import updatePipelineProgress 


def _emit(
  backend_url: str,
  pipelineId: str,
  message: Optional[str] = None,
  progress: Optional[float] = None,
  token: Optional[str] = None,
) -> None:
  updatePipelineProgress(
    backend_url=backend_url,
    pipelineId=pipelineId,
    token=token,
    message=message,
    progress=progress
  )

def _load_payload() -> Dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        raw = os.getenv("COMPUTE_PAYLOAD_JSON", "")
    if not raw.strip():
        raise ValueError("PAYLOAD_NOT_FOUND", raw)
    return json.loads(raw)

     


def _fetch_path_from_backend(
    backend_url: str, pipelineId: str, token: Optional[str] = None
):
    run_query = """
      query Pipeline($pipelineId: ID!) {
        pipeline(pipelineId: $pipelineId) {
          experimentId
          pathNodeIds
        }
      }
    """
    run_payload = graphqlRequest(backend_url, run_query, {"pipelineId": pipelineId}, token)
    run = run_payload.get("pipeline")
    if not run:
        raise ValueError("PIPELINE_NOT_FOUND")

    experiment_id = run.get("experimentId")
    path_node_ids = run.get("pathNodeIds") or []
    if not experiment_id:
        raise ValueError("EXPERIMENT_NOT_FOUND")

    experiment_query = """
      query ExperimentForRun($id: ID!) {
        experiment(_id: $id) {
          _id
          fileId
          graph {
            settings {
              folds
            }
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
    experiment_payload = graphqlRequest(
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
    return path_nodes, file_id, experiment.get("graph").get('settings')


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
    payload = graphqlRequest(backend_url, query, {"fileId": file_id}, token)
    url = (payload.get("signedDownloadUrl") or {}).get("url")
    if not url:
        raise ValueError("FILE_URL_NOT_FOUND")
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
            file_url = _fetch_signed_download_url(backend_url, payload.get("file_id")) # type: ignore

    if not file_url and not file_path:
        raise ValueError("FILE_URL_NOT_FOUND")

    try:
        df = pd.read_csv(file_url or file_path)
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                pass

    if df.empty:
        raise ValueError("EEG_FILE_EMPTY")
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

    return df.columns[-1] # type: ignore


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
        raise ValueError("TARGET_COLUMN_MISSING ")

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
        algorithm=algorithm, # type: ignore
        whiten=whiten_value,
        fun=fun,# type: ignore
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
        svd_solver=svd_solver,# type: ignore
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
            kernel=kernel,# type: ignore
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
    X: pd.DataFrame,
    y: pd.Series,
    technology: str,
    settings: Dict[str, str],
    graphStructureSettings: Dict[str, str],
    progress_for_one_step: float,
    backend_url: str,
    pipelineId: str,
):
    test_size = _to_float(settings.get("test_size"), 0.2) or 0.2
    random_state = _to_int(settings.get("random_state"), 42)
    folds =_to_int(graphStructureSettings.get('folds'))

    labels = np.unique(y)
    folds = _to_int(graphStructureSettings.get('folds')) 
    try:
        splitter = StratifiedKFold(
            n_splits=folds, shuffle=True, random_state=random_state
        )
        splits = splitter.split(X, y)
    except Exception:
        splitter = KFold(n_splits=folds, shuffle=True, random_state=random_state)
        splits = splitter.split(X)

    all_true: List[Any] = []
    all_pred: List[Any] = []
    accuracyScores: List[float] = []
    f1Scores: List[float] = []
    rocAucScores: List[Optional[float]] = []
    confusionMatrixes: List[List[float]] = []

    for fold_index, (train_idx, val_idx) in enumerate(splits, start=1):
        progress = (progress_for_one_step * 0.5) * (fold_index)
        _emit(backend_url, pipelineId, message=f"Start cross-validations: step {fold_index}/{folds}", progress=progress)
        X_train = X.iloc[train_idx]
        y_train = y.iloc[train_idx]
        X_val = X.iloc[val_idx]
        y_val = y.iloc[val_idx]

        model = _build_classifier(technology, settings)
        model.fit(X_train, y_train)
        y_pred = model.predict(X_val)

        accuracyScores.append(float(accuracy_score(y_val, y_pred)))
        f1Scores.append(float(f1_score(y_val, y_pred, average="weighted")))
        rocAucScores.append(_compute_roc_auc(model, X_val, y_val))

        all_true.extend(list(y_val))
        all_pred.extend(list(y_pred))
        matrix = confusion_matrix(y_val, y_pred, labels=labels)
        confusionMatrixes.append(matrix.tolist())
        progress = (progress_for_one_step) * (fold_index)
        _emit(backend_url, pipelineId, message=f"End cross-validations: step {fold_index}/{folds}", progress=progress)

    channelNames =  [str(label) for label in labels]
    return accuracyScores, f1Scores, rocAucScores, confusionMatrixes, channelNames


def _compute_roc_auc(model: Any, X_val: pd.DataFrame, y_val: pd.Series) -> Optional[float]:
    scores: Any = None
    if hasattr(model, "predict_proba"):
        try:
            scores = model.predict_proba(X_val)
        except Exception:
            scores = None
    if scores is None and hasattr(model, "decision_function"):
        try:
            scores = model.decision_function(X_val)
        except Exception:
            scores = None
    if scores is None:
        return None
    try:
        scores_array = np.asarray(scores)
        if scores_array.ndim == 1:
            return float(roc_auc_score(y_val, scores_array))
        if scores_array.shape[1] == 2:
            return float(roc_auc_score(y_val, scores_array[:, 1]))
        return float(
            roc_auc_score(y_val, scores_array, multi_class="ovr", average="macro")
        )
    except Exception:
        return None


def run_compute(payload: Dict[str, Any]) -> Dict[str, Any]:
    backend_url = os.getenv("COMPUTE_BACKEND_URL", "")
    pipelineId =  payload.get("pipelineId")
    token = payload.get("backend_token") or os.getenv("COMPUTE_BACKEND_TOKEN")
    started_at = time.time()

    if backend_url is None or pipelineId is None:
        raise ValueError("MISSING_PARAMS")
    
    path = []
    if backend_url and pipelineId:
        path, file_id, graphStructureSettings = _fetch_path_from_backend(backend_url, payload.get("pipelineId"), token)# type: ignore
        payload["path"] = path
        if file_id and not payload.get("file_id"):
            payload["file_id"] = file_id

    _emit(backend_url, pipelineId, message="Start computing", progress=1)

   

    _emit(backend_url, pipelineId, message="Read EEG file", progress=3)
    df = _load_dataframe(payload, backend_url or None)
    _emit(backend_url, pipelineId, message="EEG file read", progress=5)

    target_column = _resolve_target_column(df, payload, path)
    X, y = _prepare_features(df, target_column)

    report: Optional[Dict[str, Any]] = {}
   
    total = len(path)
    progress_for_one_step = 90/ total

    for index, node in enumerate(path, start=1):
        stage = str(node.get("stage") or "").upper()
        technology = str(node.get("technology") or "").strip()
        settings = _settings_to_dict(node.get("settings") or [])
        label = technology or stage or f"step {index}"

        progress = (progress_for_one_step * 0.5) * (index)

        _emit(backend_url, pipelineId, message=f"Step start: {label}, {stage}", progress=progress)

        if stage == "PREPROCESSING":
            X = _apply_preprocessing(X, settings)
        elif stage == "DATA_ENHANCEMENT":
            X = _apply_artifact_suppression(X, settings)
        elif stage == "FEATURE_EXTRACTION":
            X = _apply_ica(X, settings)
        elif stage == "DIMENSIONALITY_REDUCTION":
            X = _apply_pca(X, settings)
        elif stage == "CLASSIFICATION":
            accuracyScores, f1Scores, rocAucScores, confusionMatrixes, channelNames = _run_classifier(
                X,
                y,
                technology or "svm",
                settings,
                graphStructureSettings,
                progress_for_one_step,
                backend_url,
                pipelineId
            )
            report["accuracyScores"] = accuracyScores
            report["f1Scores"] = f1Scores
            report["rocAucScores"] = rocAucScores
            report["confusionMatrixes"] = confusionMatrixes
            report["channelNames"] = channelNames
            break
        progress = (progress_for_one_step) * (index)
        _emit(backend_url, pipelineId, message=f"Step end: {label}, {stage}", progress=progress)


    duration = max(time.time() - started_at, 0.0)
    sampleCount = max(int(len(df)), 1)
    report["sampleCount"] = sampleCount
    report["duration"] = duration

    _emit(backend_url, pipelineId, message="Computing end", progress=100)
    return report


def main() -> None:
    payload: Dict[str, Any] = {}
    payload = _load_payload()
    
    token = payload.get("backend_token")
    backend_url = os.getenv("COMPUTE_BACKEND_URL", "")
    pipelineId = payload.get("pipelineId")
    
    print(token,backend_url,pipelineId)
    
    if backend_url is None or pipelineId is None:
        raise ValueError("MISSING_PARAMS")
    
    result = run_compute(payload)
    
    completePipeline(
        backend_url=backend_url,
        payload=result,
        pipelineId=pipelineId,
        token=token
    )
    print((json.dumps(result, indent=2)))

if __name__ == "__main__":
    main()

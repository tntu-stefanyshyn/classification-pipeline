import json
import math
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
from sklearn.model_selection import ShuffleSplit, StratifiedShuffleSplit
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from graphql.completePipeline import completePipeline 
from graphql.graphqlRequest import graphqlRequest 
from graphql.updatePipelineProgress import updatePipelineProgress 

STAGE_LABELS_UA: Dict[str, str] = {
    "PREPROCESSING": "Попередня обробка",
    "DATA_ENHANCEMENT": "Покращення даних",
    "FEATURE_EXTRACTION": "Видобування ознак",
    "DIMENSIONALITY_REDUCTION": "Зниження розмірності",
    "CLASSIFICATION": "Класифікація",
}

MAX_FOLDS = 20


def _vector_length(values: List[float]) -> float:
    return math.sqrt(sum(value * value for value in values))


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


def _format_step_log(action: str, technology: str, stage: str) -> str:
    stage_ua = STAGE_LABELS_UA.get(stage, stage) or "Невідомий етап"
    technology_label = technology.strip() or stage_ua or "Невідомий крок"
    return f'{action} "{technology_label}", етап {stage_ua}'

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
              predictDataPercent
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
    graph_settings = (experiment.get("graph") or {}).get("settings") or {}
    return path_nodes, file_id, graph_settings


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
        df = pd.read_csv(file_url or file_path, sep=";")
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
        if value is None:
            continue
        normalized_value = str(value).strip()
        if not normalized_value:
            continue
        result[key] = normalized_value
    return result


def _get_setting(settings: Dict[str, str], key: str) -> Optional[str]:
    value = settings.get(key)
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


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


INVALID_FILE_ERROR = "Невалідний файл"


def _validate_eeg_dataframe(df: pd.DataFrame) -> None:
    if df.shape[1] < 3:
        raise ValueError(INVALID_FILE_ERROR)

    missing_mask = np.asarray(df.isna())
    if missing_mask.any():
        raise ValueError(INVALID_FILE_ERROR)

    feature_frame = df.iloc[:, 1:]
    feature_columns = feature_frame.columns
    for column_name in feature_columns:
        column = feature_frame[column_name]
        if not pd.api.types.is_numeric_dtype(column):
            raise ValueError(INVALID_FILE_ERROR)

    values = np.asarray(feature_frame, dtype=float)
    if not np.isfinite(values).all():
        raise ValueError(INVALID_FILE_ERROR)


def _prepare_features(df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series]:
    _validate_eeg_dataframe(df)

    y = df.iloc[:, 0].astype(str).str.strip()
    X = df.iloc[:, 1:]
    if X.empty:
        raise ValueError(INVALID_FILE_ERROR)

    return X, y


def _apply_preprocessing(X: pd.DataFrame, settings: Dict[str, str]) -> pd.DataFrame:
    values = X.values.astype(float)
    log_setting = _get_setting(settings, "log")
    if log_setting is not None and _to_bool(log_setting):
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
    transformer_kwargs: Dict[str, Any] = {}
    n_components = _to_int(_get_setting(settings, "n_components"))
    if n_components is not None:
        transformer_kwargs["n_components"] = n_components

    algorithm = _get_setting(settings, "algorithm")
    if algorithm is not None:
        transformer_kwargs["algorithm"] = algorithm.lower()

    whiten = _get_setting(settings, "whiten")
    if whiten is not None:
        whiten_value: Any = whiten.lower()
        if whiten_value in {"false", "none", "0"}:
            whiten_value = False
        transformer_kwargs["whiten"] = whiten_value

    fun = _get_setting(settings, "fun")
    if fun is not None:
        transformer_kwargs["fun"] = fun.lower()

    max_iter = _to_int(_get_setting(settings, "max_iter"))
    if max_iter is not None and max_iter > 0:
        transformer_kwargs["max_iter"] = max_iter

    tol = _to_float(_get_setting(settings, "tol"))
    if tol is not None:
        transformer_kwargs["tol"] = tol

    random_state = _to_int(_get_setting(settings, "random_state"))
    if random_state is not None:
        transformer_kwargs["random_state"] = random_state

    transformer = FastICA(**transformer_kwargs)
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
    transformer_kwargs: Dict[str, Any] = {}
    n_components = _parse_pca_components(_get_setting(settings, "n_components"))
    if n_components is not None:
        transformer_kwargs["n_components"] = n_components

    svd_solver = _get_setting(settings, "svd_solver")
    if svd_solver is not None:
        transformer_kwargs["svd_solver"] = svd_solver.lower()

    whiten_raw = _get_setting(settings, "whiten")
    if whiten_raw is not None:
        transformer_kwargs["whiten"] = _to_bool(whiten_raw, False)

    iterated_power = _get_setting(settings, "iterated_power")
    if iterated_power is not None:
        transformer_kwargs["iterated_power"] = iterated_power

    random_state = _to_int(_get_setting(settings, "random_state"))
    if random_state is not None:
        transformer_kwargs["random_state"] = random_state

    tol = _to_float(_get_setting(settings, "tol"))
    if tol is not None:
        transformer_kwargs["tol"] = tol

    transformer = PCA(**transformer_kwargs)
    values = transformer.fit_transform(X.values.astype(float))
    columns = [f"pca_{idx}" for idx in range(values.shape[1])]
    return pd.DataFrame(values, columns=columns)


def _build_classifier(technology: str, settings: Dict[str, str]):
    normalized = technology.strip().lower()

    if normalized == "svm":
        classifier_kwargs: Dict[str, Any] = {}
        c_value = _to_float(_get_setting(settings, "c"))
        if c_value is not None:
            classifier_kwargs["C"] = c_value

        kernel = _get_setting(settings, "kernel")
        if kernel is not None:
            classifier_kwargs["kernel"] = kernel.lower()

        degree = _to_int(_get_setting(settings, "degree"))
        if degree is not None:
            classifier_kwargs["degree"] = degree

        gamma = _get_setting(settings, "gamma")
        if gamma is not None:
            try:
                classifier_kwargs["gamma"] = float(gamma)
            except (TypeError, ValueError):
                classifier_kwargs["gamma"] = gamma

        coef0 = _to_float(_get_setting(settings, "coef0"))
        if coef0 is not None:
            classifier_kwargs["coef0"] = coef0

        shrinking = _get_setting(settings, "shrinking")
        if shrinking is not None:
            classifier_kwargs["shrinking"] = _to_bool(shrinking, True)

        probability = _get_setting(settings, "probability")
        if probability is not None:
            classifier_kwargs["probability"] = _to_bool(probability, False)

        tol = _to_float(_get_setting(settings, "tol"))
        if tol is not None:
            classifier_kwargs["tol"] = tol

        max_iter = _to_int(_get_setting(settings, "max_iter"))
        if max_iter is not None:
            classifier_kwargs["max_iter"] = max_iter

        class_weight_raw = _get_setting(settings, "class_weight")
        if class_weight_raw is not None and class_weight_raw.lower() == "balanced":
            classifier_kwargs["class_weight"] = "balanced"

        return SVC(**classifier_kwargs)

    if normalized == "cnn":
        classifier_kwargs: Dict[str, Any] = {"hidden_layer_sizes": (128, 64)}
        epochs = _to_int(_get_setting(settings, "epochs"))
        if epochs is not None and epochs > 0:
            classifier_kwargs["max_iter"] = epochs

        batch_size = _to_int(_get_setting(settings, "batch_size"))
        if batch_size is not None and batch_size > 0:
            classifier_kwargs["batch_size"] = batch_size

        learning_rate = _to_float(_get_setting(settings, "learning_rate"))
        if learning_rate is not None:
            classifier_kwargs["learning_rate_init"] = learning_rate

        optimizer = _get_setting(settings, "optimizer")
        if optimizer is not None:
            classifier_kwargs["solver"] = "sgd" if optimizer.lower() == "sgd" else "adam"

        random_state = _to_int(_get_setting(settings, "random_state"))
        if random_state is not None:
            classifier_kwargs["random_state"] = random_state

        return MLPClassifier(**classifier_kwargs)

    return LogisticRegression()


def _compute_roc_auc(model: Any, X_val: pd.DataFrame, y_val: pd.Series) -> float:
    scores: Any = None
    try:
        if hasattr(model, "predict_proba"):
            scores = model.predict_proba(X_val)
    except Exception:
        scores = None

    if scores is None:
        try:
            if hasattr(model, "decision_function"):
                scores = model.decision_function(X_val)
        except Exception:
            scores = None

    if scores is None:
        return 0.0

    try:
        scores_array = np.asarray(scores)
        unique_labels = pd.Series(y_val).nunique(dropna=True)
        if unique_labels <= 2:
            if scores_array.ndim == 2 and scores_array.shape[1] > 1:
                positive_scores = scores_array[:, 1]
            else:
                positive_scores = scores_array.ravel()
            return float(roc_auc_score(y_val, positive_scores))
        return float(roc_auc_score(y_val, scores_array, multi_class="ovr", average="macro"))
    except Exception:
        return 0.0


def _run_classifier(
    X: pd.DataFrame,
    y: pd.Series,
    technology: str,
    settings: Dict[str, str],
    graphStructureSettings: Dict[str, Any],
    progress_for_one_step: float,
    backend_url: str,
    pipelineId: str,
):
    random_state = _to_int(_get_setting(settings, "random_state"))
    raw_folds = _to_int(graphStructureSettings.get("folds"))
    splitter_kwargs: Dict[str, Any] = {}

    if raw_folds is not None and raw_folds > 0:
        folds = min(raw_folds, MAX_FOLDS)
        if raw_folds > MAX_FOLDS:
            _emit(
                backend_url,
                pipelineId,
                message=f"Кількість кроків CV обмежено до {MAX_FOLDS} для стабільного виконання.",
            )
        splitter_kwargs["n_splits"] = folds

    predict_percent = _to_float(graphStructureSettings.get("predictDataPercent"))
    if predict_percent is None:
        predict_percent = _to_float(_get_setting(settings, "predict_percent"))
    if predict_percent is not None and 0 < predict_percent < 100:
        splitter_kwargs["test_size"] = predict_percent / 100.0

    if random_state is not None:
        splitter_kwargs["random_state"] = random_state

    labels = np.unique(y)
    try:
        splitter = StratifiedShuffleSplit(**splitter_kwargs)
        splits = splitter.split(X, y)
    except Exception:
        splitter = ShuffleSplit(**splitter_kwargs)
        splits = splitter.split(X)
    folds = int(getattr(splitter, "n_splits", 1) or 1)

    all_true: List[Any] = []
    all_pred: List[Any] = []
    accuracyScores: List[float] = []
    f1Scores: List[float] = []
    rocAucScores: List[float] = []
    optimizationIntermediateScores: List[float] = []
    confusionMatrixes: List[List[float]] = []
    predictionSampleCounts: List[int] = []
    predictionSampleCount: Optional[int] = None

    for fold_index, (train_idx, val_idx) in enumerate(splits, start=1):
        prediction_rows = len(val_idx)
        predictionSampleCounts.append(prediction_rows)
        if predictionSampleCount is None:
            predictionSampleCount = prediction_rows
        fold_fraction = fold_index / folds
        progress = (progress_for_one_step * 0.5) * fold_fraction
        _emit(
            backend_url,
            pipelineId,
            message=f"Початок перехресної валідації: крок {fold_index}/{folds}",
            progress=progress
        )
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
        optimizationIntermediateScores.append(
            float(
                _vector_length(
                    [
                        accuracyScores[-1],
                        f1Scores[-1],
                        rocAucScores[-1],
                    ]
                )
            )
        )

        all_true.extend(list(y_val))
        all_pred.extend(list(y_pred))
        matrix = confusion_matrix(y_val, y_pred, labels=labels)
        confusionMatrixes.append(matrix.tolist())
        progress = progress_for_one_step * fold_fraction
        _emit(
            backend_url,
            pipelineId,
            message=f"Завершення перехресної валідації: крок {fold_index}/{folds}",
            progress=progress
        )

    channelNames = [str(label) for label in labels]
    return (
        accuracyScores,
        f1Scores,
        rocAucScores,
        optimizationIntermediateScores,
        confusionMatrixes,
        channelNames,
        predictionSampleCount or 0,
        predictionSampleCounts,
        predict_percent,
    )


def run_compute(payload: Dict[str, Any]) -> Dict[str, Any]:
    backend_url = os.getenv("COMPUTE_BACKEND_URL", "")
    pipelineId = payload.get("pipelineId")
    token = payload.get("backend_token") or os.getenv("COMPUTE_BACKEND_TOKEN")
    started_at = time.time()

    if not backend_url or not pipelineId:
        raise ValueError("MISSING_PARAMS")
    
    path = []
    if backend_url and pipelineId:
        path, file_id, graphStructureSettings = _fetch_path_from_backend(
            backend_url, pipelineId, token
        )
        payload["path"] = path
        if file_id and not payload.get("file_id"):
            payload["file_id"] = file_id

    _emit(backend_url, pipelineId, message="Початок обчислення", progress=1)

   

    _emit(backend_url, pipelineId, message="Зчитування файлу ЕЕГ", progress=3)
    df = _load_dataframe(payload, backend_url or None)
    _emit(backend_url, pipelineId, message="Файл ЕЕГ зчитано", progress=5)

    X, y = _prepare_features(df)

    report: Optional[Dict[str, Any]] = {}
   
    total = len(path)
    progress_for_one_step = 90/ total

    for index, node in enumerate(path, start=1):
        stage = str(node.get("stage") or "").upper()
        technology = str(node.get("technology") or "").strip()
        settings = _settings_to_dict(node.get("settings") or [])

        progress = (progress_for_one_step * 0.5) * (index)

        _emit(
            backend_url,
            pipelineId,
            message=_format_step_log("Початок кроку", technology, stage),
            progress=progress
        )

        if stage == "PREPROCESSING":
            X = _apply_preprocessing(X, settings)
        elif stage == "DATA_ENHANCEMENT":
            X = _apply_artifact_suppression(X, settings)
        elif stage == "FEATURE_EXTRACTION":
            X = _apply_ica(X, settings)
        elif stage == "DIMENSIONALITY_REDUCTION":
            X = _apply_pca(X, settings)
        elif stage == "CLASSIFICATION":
            (
                accuracyScores,
                f1Scores,
                rocAucScores,
                optimizationIntermediateScores,
                confusionMatrixes,
                channelNames,
                predictionSampleCount,
                predictionSampleCounts,
                predictPercent,
            ) = _run_classifier(
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
            report["optimizationIntermediateScores"] = optimizationIntermediateScores
            report["confusionMatrixes"] = confusionMatrixes
            report["channelNames"] = channelNames
            report["predictionSampleCount"] = predictionSampleCount
            report["predictionSampleCounts"] = predictionSampleCounts
            report["predictionDataPercent"] = predictPercent
            break
        progress = (progress_for_one_step) * (index)
        _emit(
            backend_url,
            pipelineId,
            message=_format_step_log("Завершення кроку", technology, stage),
            progress=progress
        )


    duration = max(time.time() - started_at, 0.0)
    sampleCount = max(int(len(df)), 1)
    report["sampleCount"] = sampleCount
    report["duration"] = duration

    _emit(backend_url, pipelineId, message="Обчислення завершено", progress=100)
    return report


def main() -> None:
    payload: Dict[str, Any] = {}
    try:
        payload = _load_payload()

        token = payload.get("backend_token")
        backend_url = os.getenv("COMPUTE_BACKEND_URL", "")
        pipelineId = payload.get("pipelineId")

        if not backend_url or not pipelineId:
            raise ValueError("MISSING_PARAMS")

        result = run_compute(payload)

        completePipeline(
            backend_url=backend_url,
            payload=result,
            pipelineId=pipelineId,
            token=token
        )
        print((json.dumps(result, indent=2)))
    except Exception as exc:
        backend_url = os.getenv("COMPUTE_BACKEND_URL", "")
        token = payload.get("backend_token")
        pipelineId = payload.get("pipelineId")
        message = f"{type(exc).__name__}: {exc}"

        if backend_url and pipelineId:
            try:
                _emit(backend_url, pipelineId, message=message, token=token)
            except Exception:
                pass
        raise

if __name__ == "__main__":
    main()

import json
import math
import os
import sys
from typing import Any, Dict, List, Optional
from graphql.graphqlRequest import graphqlRequest
from graphql.updateExperimentProgress import updateExperimentProgress
from graphql.updateExperimentOptimizationResult import updateExperimentOptimizationResult
from graphql.updatePipelineOptimizationResult import updatePipelineOptimizationResult

def _emit(
  backend_url: str,
  experimentId: str,
  message: Optional[str] = None,
  progress: Optional[float] = None,
  status: Optional[str] = None,
  token: Optional[str] = None,
) -> None:
  if not backend_url or not experimentId:
    return
  updateExperimentProgress(
    backend_url=backend_url,
    experimentId=experimentId,
    token=token,
    message=message,
    progress=progress,
    status=status,
  )


def _update_pipeline_optimization(
  backend_url: str,
  pipelineId: str,
  score: float,
  token: Optional[str] = None,
) -> None:
  if not backend_url or not pipelineId:
    return
  updatePipelineOptimizationResult(
    backend_url=backend_url,
    pipelineId=pipelineId,
    score=score,
    token=token,
  )


def _update_experiment_optimization(
  backend_url: str,
  experimentId: str,
  bestPipelineId: str,
  score: float,
  token: Optional[str] = None,
) -> None:
  if not backend_url or not experimentId or not bestPipelineId:
    return
  updateExperimentOptimizationResult(
    backend_url=backend_url,
    experimentId=experimentId,
    bestPipelineId=bestPipelineId,
    score=score,
    token=token,
  )


def _load_payload() -> Dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        raw = os.getenv("OPTIMIZATION_PAYLOAD_JSON", "")
    if not raw.strip():
        raise ValueError("Optimization payload is missing")
    payload = json.loads(raw)
    backend_url = str(payload.get("backend_url") or "").strip()
    experimentId = str(payload.get("experimentId") or "").strip()
    backend_token = str(payload.get("backend_token") or "").strip()
    raw_hyper_minutes = payload.get("hyper_optimization_minutes_per_pipeline")
    try:
        hyper_minutes = int(raw_hyper_minutes)
    except (TypeError, ValueError):
        hyper_minutes = 30
    if hyper_minutes < 1:
        hyper_minutes = 30
    if not backend_url or not experimentId:
        raise ValueError("MISSING_PARAMS")
    return {
        "backend_url": backend_url,
        "experimentId": experimentId,
        "backend_token": backend_token,
        "hyper_optimization_minutes_per_pipeline": hyper_minutes,
    }


def _to_number(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            numeric = float(value)
        except ValueError:
            return None
        return numeric if math.isfinite(numeric) else None
    return None


def _flatten_numeric(value: Any) -> List[float]:
    if value is None:
        return []
    if isinstance(value, dict):
        for key in ("values", "folds", "scores"):
            entry = value.get(key)
            if isinstance(entry, (list, tuple)):
                return _flatten_numeric(entry)
        values: List[float] = []
        for item in value.values():
            values.extend(_flatten_numeric(item))
        return values
    if isinstance(value, (list, tuple)):
        values: List[float] = []
        for item in value:
            values.extend(_flatten_numeric(item))
        return values
    numeric = _to_number(value)
    return [numeric] if numeric is not None else []

def vector_length(v: List[float]) -> float:
    return math.sqrt(sum(x * x for x in v))

def _min_max_normalize(values: List[float]) -> List[float]:
    if not values:
        return []
    min_value = min(values)
    max_value = max(values)
    if not math.isfinite(min_value) or not math.isfinite(max_value):
        return [0.0 for _ in values]
    if max_value == min_value:
        return [0.0 for _ in values]
    return [(value - min_value) / (max_value - min_value) for value in values]


def optimize(payload: Dict[str, Any]):
    backend_url = str(payload.get("backend_url") or "")
    experimentId = str(payload.get("experimentId") or "")
    token = str(payload.get("backend_token") or "")
    hyper_minutes = int(payload.get("hyper_optimization_minutes_per_pipeline") or 30)

    if not backend_url or not experimentId:
        raise ValueError("MISSING_PARAMS")

    _emit(
        backend_url,
        experimentId,
        message=f"Оптимізацію розпочато (бюджет {hyper_minutes} хв/конвеєр)",
        progress=0,
        status="optimizing",
        token=token,
    )

    experiment_query = """
      query ExperimentForOptimization($id: ID!) {
        experiment(_id: $id) {
          _id
          graph {
            settings {
              metrics {
                accuracy
                f1
                rocAuc
                ntps
              }
            }
          }
        }
      }
    """
    pipeline_query = """
      query PipelinesForOptimization($experimentId: ID!) {
        pipelines(experimentId: $experimentId) {
          _id
          status
          pathNodeIds
          computingResult {
            accuracyScores
            f1Scores
            rocAucScores
            sampleCount
            duration
          }
        }
      }
    """

    experiment_resp = graphqlRequest(
        backend_url,
        experiment_query,
        {"id": experimentId},
        token,
    )
    experiment = experiment_resp.get("experiment") if isinstance(experiment_resp, dict) else None
    metrics = (
        ((experiment or {}).get("graph") or {})
        .get("settings", {})
        .get("metrics", {})
        if isinstance(experiment, dict)
        else {}
    )
    if not metrics:
        raise ValueError("Graph metrics are not configured.")

    pipelines_resp = graphqlRequest(
        backend_url,
        pipeline_query,
        {"experimentId": experimentId},
        token,
    )
    pipelines = pipelines_resp.get("pipelines") if isinstance(pipelines_resp, dict) else []

    weights = metrics or {}
    accuracy_weight = float(weights.get("accuracy", 0) or 0)
    f1_weight = float(weights.get("f1", 0)or 0)
    roc_weight = float(weights.get("rocAuc", 0)or 0)
    ntps_weight = float(weights.get("ntps", 0)or 0)

    _emit(
        backend_url,
        experimentId,
        message="Отримання конвеєрів для оптимізації",
        progress=5,
        token=token,
    )

    parsedPipelines: List[Dict[str, Any]] = []

    for pipeline in pipelines or []:
        if str(pipeline.get("status") or "").lower() != "completed":
            continue

        computingResult = pipeline.get("computingResult") or {}
        accuracy_values = _flatten_numeric(computingResult.get("accuracyScores"))
        f1_values = _flatten_numeric(computingResult.get("f1Scores"))
        roc_auc_values = _flatten_numeric(computingResult.get("rocAucScores"))
        duration = _to_number(computingResult.get("duration"))
        sample_count = _to_number(computingResult.get("sampleCount"))

        if (
            not accuracy_values
            or not f1_values
            or not roc_auc_values
            or duration is None
            or sample_count is None
            or sample_count <= 0
        ):
            continue

        metrics = {
          "accuracy":  vector_length(accuracy_values),
          "f1": vector_length(f1_values),
          "rocAuc": vector_length(roc_auc_values),
          "ntps": duration / sample_count
        }
        parsedPipelines.append({
            "pipelineId": pipeline["_id"],
            "metrics": metrics,
        })

    if not parsedPipelines:
        raise ValueError("Немає завершених конвеєрів з валідними результатами для оптимізації.")

    metric_names = ["accuracy", "f1", "rocAuc", "ntps"]
    normalized = {
      metric: _min_max_normalize(
        [item["metrics"][metric] for item in parsedPipelines]
      )
      for metric in metric_names
    }

    best: Optional[Dict[str, Any]] = None
    total_pipelines = len(parsedPipelines)
    progress_base = 10.0
    progress_span = 70.0 if total_pipelines > 0 else 0.0
    progress_step = progress_span / total_pipelines if total_pipelines > 0 else 0.0

    _emit(
        backend_url,
        experimentId,
        message="Лінійну оптимізацію розпочато",
        progress=progress_base,
        token=token,
    )
    for idx, parsedPipeline in enumerate(parsedPipelines):
        start_progress = progress_base + (progress_step * idx)
        end_progress = progress_base + (progress_step * (idx + 1))
        _emit(
            backend_url,
            experimentId,
            message=f"Початок оптимізації конвеєра: {parsedPipeline['pipelineId']}",
            progress=start_progress,
            token=token,
        )
        acc_norm = normalized["accuracy"][idx]
        f1_norm = normalized["f1"][idx]
        roc_norm = normalized["rocAuc"][idx]
        ntps_norm = normalized["ntps"][idx]

        acc_min = 1.0 - acc_norm
        f1_min = 1.0 - f1_norm
        roc_min = 1.0 - roc_norm

        score = (
            accuracy_weight * acc_min
            + f1_weight * f1_min
            + roc_weight * roc_min
            + ntps_weight * ntps_norm
        )

        entry = {
            "pipelineId": parsedPipeline["pipelineId"],
            "score": score
        }
        if best is None or score < best["score"]:
            best = entry
        _update_pipeline_optimization(
            backend_url,
            parsedPipeline["pipelineId"],
            score,
            token=token,
        )
        _emit(
            backend_url,
            experimentId,
            message=f"Завершення оптимізації конвеєра: {parsedPipeline['pipelineId']}",
            progress=end_progress,
            token=token,
        )

    if best is None:
        raise ValueError("Failed to select best conveyor")

    _emit(
        backend_url,
        experimentId,
        message="Лінійну оптимізацію завершено",
        progress=90,
        token=token,
    )
    _emit(
        backend_url,
        experimentId,
        message=f"Обрано найкращий конвеєр: {best['pipelineId']}",
        progress=95,
        token=token,
    )
    _update_experiment_optimization(
        backend_url,
        experimentId,
        best["pipelineId"],
        best["score"],
        token=token,
    )
    _emit(
        backend_url,
        experimentId,
        message="Оптимізацію завершено",
        progress=100,
        status="completed",
        token=token,
    )


def main() -> None:
    payload: Dict[str, Any] = {}
    try:
        payload = _load_payload()
        optimize(payload)
    except Exception as exc:  # noqa: BLE001
        backend_url = str(
            payload.get("backend_url")
            if isinstance(payload, dict)
            else ""
        )
        experimentId = str(
            payload.get("experimentId")
            if isinstance(payload, dict)
            else ""
        )
        token = (
            payload.get("backend_token")
            if isinstance(payload, dict)
            else None
        ) or ""
        _emit(
            backend_url,
            experimentId,
            message=f"Оптимізація завершилася з помилкою: {exc}",
            status="failed",
            token=token,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()

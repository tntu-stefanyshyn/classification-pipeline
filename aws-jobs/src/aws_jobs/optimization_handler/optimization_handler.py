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


def _load_payload() -> Dict[str, str]:
    raw = sys.stdin.read()
    if not raw.strip():
        raw = os.getenv("OPTIMIZATION_PAYLOAD_JSON", "")
    if not raw.strip():
        raise ValueError("Optimization payload is missing")
    payload = json.loads(raw)
    backend_url = str(payload.get("backend_url") or "").strip()
    experimentId = str(payload.get("experimentId") or "").strip()
    backend_token = str(payload.get("backend_token") or "").strip()
    if not backend_url or not experimentId:
        raise ValueError("MISSING_PARAMS")
    return {
        "backend_url": backend_url,
        "experimentId": experimentId,
        "backend_token": backend_token,
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


def _vector_length(value: Any) -> Optional[float]:
    values = _flatten_numeric(value)
    if not values:
        return None
    total = sum(item * item for item in values)
    return math.sqrt(total)


def _extract_metric(payload: Dict[str, Any], name: str) -> Any:
    if not isinstance(payload, dict):
        return None

    if name == "accuracy":
        return payload.get("accuracyScores")

    if name == "rocAuc":
        return payload.get("rocAucScores")

    if name == "ntps":
        # Lower is better: duration per sample derived from duration / sampleCount
        duration = payload.get("duration")
        sample_count = payload.get("sampleCount")
        if isinstance(duration, (int, float)) and isinstance(sample_count, (int, float)) and sample_count:
            return duration / sample_count
        return payload.get("ntps")

    if name == "f1":
        return payload.get("f1Scores")

    return None


def _min_max_normalize(values: List[float]) -> List[float]:
    if not values:
        return []
    min_value = min(values)
    max_value = max(values)
    if math.isclose(min_value, max_value):
        return [0.0 for _ in values]
    return [(value - min_value) / (max_value - min_value) for value in values]


def optimize(payload: Dict[str, Any]) -> Dict[str, Any]:
    backend_url = str(payload.get("backend_url") or "")
    experimentId = str(payload.get("experimentId") or "")
    token = str(payload.get("backend_token") or "")

    if not backend_url or not experimentId:
        raise ValueError("MISSING_PARAMS")

    _emit(
        backend_url,
        experimentId,
        message="Optimization started",
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

    conveyors = []
    for pipeline in pipelines or []:
        if not isinstance(pipeline, dict):
            continue
        if pipeline.get("status") != "completed":
            continue
        computing_result = pipeline.get("computingResult") or {}
        if not computing_result:
            continue
        path_node_ids = [str(item) for item in pipeline.get("pathNodeIds") or [] if str(item).strip()]
        if not path_node_ids:
            continue
        conveyors.append(
            {
                "pipelineId": str(pipeline.get("_id") or "").strip(),
                "path_node_ids": path_node_ids,
                "payload": computing_result,
            }
        )

    if not conveyors:
        raise ValueError("No completed paths available for optimization.")

    _emit(
        backend_url,
        experimentId,
        message="Fetching pipelines for optimization",
        progress=5,
        token=token,
    )

    metrics_by_key: Dict[str, List[float]] = {
        "accuracy": [],
        "f1": [],
        "rocAuc": [],
        "ntps": [],
    }
    parsed_rows: List[Dict[str, Any]] = []

    for row in conveyors:
        payload_data = row["payload"]
        metrics: Dict[str, Optional[float]] = {}
        for key in ("accuracy", "f1", "rocAuc", "ntps"):
            raw_value = _extract_metric(payload_data, key)
            metrics[key] = _vector_length(raw_value)

        if accuracy_weight > 0 and metrics["accuracy"] is None:
            raise ValueError(f"Missing accuracy metric for run {row['pipelineId']}")
        if f1_weight > 0 and metrics["f1"] is None:
            raise ValueError(f"Missing f1 metric for run {row['pipelineId']}")
        if roc_weight > 0 and metrics["rocAuc"] is None:
            raise ValueError(f"Missing rocAuc metric for run {row['pipelineId']}")
        if ntps_weight > 0 and metrics["ntps"] is None:
            raise ValueError(f"Missing ntps metric for run {row['pipelineId']}")

        metrics_by_key["accuracy"].append(metrics["accuracy"] or 0.0)
        metrics_by_key["f1"].append(metrics["f1"] or 0.0)
        metrics_by_key["rocAuc"].append(metrics["rocAuc"] or 0.0)
        metrics_by_key["ntps"].append(metrics["ntps"] or 0.0)

        parsed_rows.append(
            {
                "pipelineId": row["pipelineId"],
                "path_node_ids": row["path_node_ids"],
                "metrics": metrics,
            }
        )

    normalized = {
        key: _min_max_normalize(values) for key, values in metrics_by_key.items()
    }

    scores: List[Dict[str, Any]] = []
    best: Optional[Dict[str, Any]] = None
    total_rows = len(parsed_rows)
    progress_base = 10.0
    progress_span = 70.0 if total_rows > 0 else 0.0
    progress_step = progress_span / total_rows if total_rows > 0 else 0.0

    _emit(
        backend_url,
        experimentId,
        message="Linear optimization started",
        progress=progress_base,
        token=token,
    )
    for idx, row in enumerate(parsed_rows):
        start_progress = progress_base + (progress_step * idx)
        end_progress = progress_base + (progress_step * (idx + 1))
        _emit(
            backend_url,
            experimentId,
            message=f"Start pipeline optimization: {row['pipelineId']}",
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
            "pipelineId": row["pipelineId"],
            "path_node_ids": row["path_node_ids"],
            "score": score,
            "normalized": {
                "accuracy": acc_norm,
                "f1": f1_norm,
                "rocAuc": roc_norm,
                "ntps": ntps_norm,
            },
        }
        scores.append(entry)
        if best is None or score < best["score"]:
            best = entry
        _update_pipeline_optimization(
            backend_url,
            row["pipelineId"],
            score,
            token=token,
        )
        _emit(
            backend_url,
            experimentId,
            message=f"End pipeline optimization: {row['pipelineId']}",
            progress=end_progress,
            token=token,
        )

    if best is None:
        raise ValueError("Failed to select best conveyor")

    _emit(
        backend_url,
        experimentId,
        message="Linear optimization completed",
        progress=90,
        token=token,
    )
    _emit(
        backend_url,
        experimentId,
        message=f"Best pipeline selected: {best['pipelineId']}",
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
        message="Optimization completed",
        progress=100,
        status="completed",
        token=token,
    )

    return {"best": best, "scores": scores}


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
            message=f"Optimization failed: {exc}",
            status="failed",
            token=token,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()

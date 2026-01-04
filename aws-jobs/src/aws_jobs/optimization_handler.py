import json
import math
import os
import sys
from typing import Any, Dict, List, Optional, Tuple


def _emit(event: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(event, ensure_ascii=True) + "\n")
    sys.stdout.flush()


def _load_payload() -> Dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        raw = os.getenv("OPTIMIZATION_PAYLOAD_JSON", "")
    if not raw.strip():
        raise ValueError("Optimization payload is missing")
    return json.loads(raw)


def _normalize_key(value: str) -> str:
    return value.strip().lower().replace("-", "").replace("_", "").replace(" ", "")


def _lookup(raw: Dict[str, Any], keys: List[str]) -> Any:
    if not isinstance(raw, dict):
        return None
    normalized = {_normalize_key(key): value for key, value in raw.items()}
    for key in keys:
        normalized_key = _normalize_key(key)
        if normalized_key in normalized:
            return normalized[normalized_key]
    return None


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
        return _lookup(payload, ["accuracy", "acc"])

    if name == "rocAuc":
        return _lookup(payload, ["roc_auc", "rocauc", "roc-auc", "rocAuc", "auc"])

    if name == "ntps":
        return _lookup(
            payload,
            [
                "ntps",
                "time_per_sample",
                "timePerSample",
                "time_per_unit",
                "timePerUnit",
                "duration_per_sample",
                "durationPerSample",
            ],
        )

    if name == "f1":
        direct = _lookup(payload, ["f1", "f1_score", "f1-score", "f1Score"])
        if direct is not None:
            return direct

        macro = _lookup(payload, ["macro avg", "macro_avg", "macroavg", "macroAvg"])
        if isinstance(macro, dict):
            value = _lookup(macro, ["f1-score", "f1_score", "f1Score"])
            if value is not None:
                return value

        weighted = _lookup(
            payload, ["weighted avg", "weighted_avg", "weightedavg", "weightedAvg"]
        )
        if isinstance(weighted, dict):
            value = _lookup(weighted, ["f1-score", "f1_score", "f1Score"])
            if value is not None:
                return value

        return None

    return None


def _parse_entry(entry: Dict[str, Any]) -> Tuple[str, List[str], Dict[str, Any]]:
    pipelineId = str(entry.get("pipelineId") or entry.get("runId") or "").strip()
    if not pipelineId:
        raise ValueError("Conveyor pipelineId is missing")

    path_ids = entry.get("path_node_ids") or entry.get("pathNodeIds") or []
    path_node_ids = [str(item) for item in path_ids if str(item).strip()]
    if not path_node_ids:
        raise ValueError(f"Conveyor path_node_ids are missing for run {pipelineId}")

    payload = entry.get("payload")
    if isinstance(payload, str) and payload.strip():
        payload = json.loads(payload)
    if not isinstance(payload, dict):
        payload_json = entry.get("payload_json") or entry.get("payloadJson") or ""
        if isinstance(payload_json, str) and payload_json.strip():
            payload = json.loads(payload_json)
    if not isinstance(payload, dict):
        payload = {}

    return pipelineId, path_node_ids, payload


def _min_max_normalize(values: List[float]) -> List[float]:
    if not values:
        return []
    min_value = min(values)
    max_value = max(values)
    if math.isclose(min_value, max_value):
        return [0.0 for _ in values]
    return [(value - min_value) / (max_value - min_value) for value in values]


def optimize(payload: Dict[str, Any]) -> Dict[str, Any]:
    weights = payload.get("weights") or {}
    accuracy_weight = float(weights.get("accuracy", 0))
    f1_weight = float(weights.get("f1", 0))
    roc_weight = float(weights.get("rocAuc", weights.get("roc_auc", 0)))
    ntps_weight = float(weights.get("ntps", 0))

    conveyors = payload.get("conveyors") or payload.get("results") or []
    if not isinstance(conveyors, list) or not conveyors:
        raise ValueError("No conveyors provided for optimization")

    raw_rows: List[Dict[str, Any]] = []
    for entry in conveyors:
        if not isinstance(entry, dict):
            continue
        pipelineId, path_node_ids, data = _parse_entry(entry)
        raw_rows.append({"pipelineId": pipelineId, "path_node_ids": path_node_ids, "payload": data})

    if not raw_rows:
        raise ValueError("No valid conveyors to optimize")

    metrics_by_key: Dict[str, List[float]] = {
        "accuracy": [],
        "f1": [],
        "rocAuc": [],
        "ntps": [],
    }
    parsed_rows: List[Dict[str, Any]] = []

    for row in raw_rows:
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
    for idx, row in enumerate(parsed_rows):
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

    if best is None:
        raise ValueError("Failed to select best conveyor")

    return {"best": best, "scores": scores}


def main() -> None:
    try:
        payload = _load_payload()
        result = optimize(payload)
        _emit({"type": "result", "result": result})
    except Exception as exc:  # noqa: BLE001
        _emit({"type": "error", "message": str(exc)})
        sys.exit(1)


if __name__ == "__main__":
    main()

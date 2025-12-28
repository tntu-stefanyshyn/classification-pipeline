import json
import os
import sys
import time
from datetime import datetime

import boto3


def _emit(event):
    sys.stdout.write(json.dumps(event, ensure_ascii=True) + "\n")
    sys.stdout.flush()


def _load_payload():
    raw = sys.stdin.read()
    if not raw.strip():
        raw = os.getenv("COMPUTE_PAYLOAD_JSON", "")
    if not raw.strip():
        raise ValueError("Не передано дані для обчислення")
    return json.loads(raw)


def _store_result(payload, data):
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


def run_compute(payload):
    path = payload.get("path") or []
    total = len(path)
    delay = float(payload.get("step_delay_seconds", 0.3))

    _emit({"type": "progress", "progress": 0, "message": "Запуск обчислення"})

    if total == 0:
        _emit({"type": "progress", "progress": 100, "message": "Немає кроків для обчислення"})
        return {"path_length": 0, "nodes": [], "completed_at": _timestamp()}

    for index, node in enumerate(path, start=1):
        label = node.get("technology") or node.get("stage") or f"крок {index}"
        progress = int((index / total) * 90)
        _emit(
            {
                "type": "progress",
                "progress": progress,
                "message": f"Крок {index}/{total}: {label}",
            }
        )
        time.sleep(delay)

    result = {
        "path_length": total,
        "nodes": [node.get("technology") for node in path],
        "completed_at": _timestamp(),
    }
    _emit({"type": "progress", "progress": 100, "message": "Обчислення завершено"})
    return result


def _timestamp():
    return datetime.utcnow().isoformat() + "Z"


def main():
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
                payload if "payload" in locals() else {},
                {"status": "failed", "error": str(exc), "failed_at": _timestamp()},
            )
        except Exception:
            pass
        _emit({"type": "error", "message": str(exc)})
        sys.exit(1)


if __name__ == "__main__":
    main()

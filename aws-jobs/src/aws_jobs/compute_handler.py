import json
import sys
import time
from datetime import datetime


def _emit(event):
    sys.stdout.write(json.dumps(event, ensure_ascii=True) + "\n")
    sys.stdout.flush()


def _load_payload():
    raw = sys.stdin.read()
    if not raw.strip():
        raise ValueError("Не передано дані для обчислення")
    return json.loads(raw)


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
        _emit({"type": "result", "result": result})
    except Exception as exc:  # noqa: BLE001
        _emit({"type": "error", "message": str(exc)})
        sys.exit(1)


if __name__ == "__main__":
    main()

# aws-jobs Docker instructions

Build the image and run the worker service with Docker Compose:

```bash
docker-compose build aws-jobs
docker-compose up -d aws-jobs
```

Run in the foreground (logs):

```bash
docker-compose up aws-jobs
```

Notes:

- The compose file forwards `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION` from your host environment. Export them before running, or provide a `.env` file in the repo root.
- The service mounts the local `aws-jobs/` folder into the container at `/app` so code changes are immediate.
- If you prefer an immutable image (no mounts), remove the `volumes` section in `docker-compose.yml`.

# AWS jobs (Python)

Міні-воркспейс для ML задач класифікації, сумісний з AWS оточенням.

## Швидкий старт

1. Створити віртуальне оточення у каталозі `aws-jobs` (наприклад, `python -m venv .venv && source .venv/bin/activate`).
2. Встановити залежності: `pip install -e .[dev]`.
3. Використати `aws_jobs.classification_job.TabularClassifier` для тренування моделі.

### Приклад

```python
import pandas as pd
from pathlib import Path
from aws_jobs.classification_job import ClassificationJobConfig, TabularClassifier

df = pd.read_csv("data.csv")
cfg = ClassificationJobConfig(target_column="label", output_dir=Path("artifacts"))
report = TabularClassifier(cfg).train(df)
print(report)
```

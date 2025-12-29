# Інструкція для AWS Jobs (Batch)

## 1. Підготуйте контейнер з обчисленнями

- Зберіть Docker-образ, який містить пакет `aws-jobs` (папка `aws-jobs/`).
- Команда запуску контейнера має викликати:
  - `python -m aws_jobs.compute_handler`
- Образ опублікуйте в ECR (або іншому реєстрі).

## 2. Створіть AWS Batch ресурси

- Compute Environment (кероване або Fargate).
- Job Queue.
- Job Definition:
  - Образ з попереднього кроку.
  - Command: `python -m aws_jobs.compute_handler`.
  - IAM Role з доступом на запис у S3 bucket для результатів.

## 3. Налаштуйте змінні оточення бекенду

Додайте в `.env`:

```
AWS_BATCH_JOB_QUEUE=...
AWS_BATCH_JOB_DEFINITION=...
AWS_BATCH_JOB_NAME_PREFIX=experiment-run
CLOUD_WORKER_POLL_MS=5000
AWS_COMPUTATION_RESULTS_BUCKET=your-results-bucket
AWS_COMPUTATION_RESULTS_PREFIX=computations
AWS_COMPUTATION_RESULTS_REGION=...
AWS_REGION=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

## 4. Формат обміну

- Бекенд надсилає payload у змінну `COMPUTE_PAYLOAD_JSON`.
- Обчислення зберігають результат у S3 як:
  - `s3://<AWS_COMPUTATION_RESULTS_BUCKET>/<AWS_COMPUTATION_RESULTS_PREFIX>/<runId>.json`
- Бекенд опитує S3 та оновлює статус запуску (completed/failed).
- Формат файлу результату:
  - `{"status":"completed","result":{...}}` або `{"status":"failed","error":"..."}`.

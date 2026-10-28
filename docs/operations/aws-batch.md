# Інструкція для AWS Jobs (Batch)

## Швидкий setup для попередження про вимкнений cloud worker

Повідомлення
`Хмарний воркер вимкнено: AWS Batch або bucket для результатів не налаштовано.`
з'являється під час старту бекенду, коли `BACKEND_CLOUD_WORKER_ENABLED` увімкнений,
але бракує хоча б одного обов'язкового параметра:

- `AWS_BATCH_JOB_QUEUE`
- `AWS_BATCH_JOB_DEFINITION`
- `AWS_COMPUTATION_RESULTS_BUCKET` або fallback `AWS_S3_BUCKET`

Якщо AWS Batch не потрібен у поточному середовищі, але backend має сам виконувати
запуски з `cloud` черги через локальний Docker image, вимкни AWS Batch worker,
увімкни backend Docker worker і перезапусти бекенд:

```dotenv
BACKEND_CLOUD_WORKER_ENABLED=false
BACKEND_LOCAL_WORKER_ENABLED=true
```

Якщо cloud compute потрібен, мінімальний setup такий:

1. Створи або вибери S3 bucket для вхідних файлів експериментів.
   Його назва йде в `AWS_S3_BUCKET`.
2. Створи або вибери S3 bucket для результатів cloud-запусків.
   Його назва йде в `AWS_COMPUTATION_RESULTS_BUCKET`. Для dev можна використати той самий bucket, що й `AWS_S3_BUCKET`.
3. Опублікуй Docker image з `aws-jobs/` в ECR, як описано нижче в секції 2.
4. Створи AWS Batch `Compute Environment`, `Job Queue` і compute `Job Definition`, як описано нижче в секції 3.
5. Додай мінімальні змінні в `backend/.env`:

```dotenv
BACKEND_CLOUD_WORKER_ENABLED=true
BACKEND_LOCAL_WORKER_ENABLED=true

AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

AWS_S3_BUCKET=your-input-bucket
AWS_COMPUTATION_RESULTS_BUCKET=your-results-bucket
AWS_COMPUTATION_RESULTS_PREFIX=computations
AWS_COMPUTATION_RESULTS_REGION=eu-central-1

AWS_BATCH_JOB_QUEUE=your-batch-job-queue
AWS_BATCH_JOB_DEFINITION=compute-job-definition:1
AWS_BATCH_JOB_NAME_PREFIX=experiment-run
CLOUD_WORKER_POLL_MS=5000
```

6. У compute `Job Definition` додай змінні контейнера:

```dotenv
COMPUTE_BACKEND_URL=https://<backend-host>/graphql
COMPUTE_BACKEND_TOKEN=<service-token>
```

`COMPUTE_BACKEND_TOKEN` потрібен тільки якщо GraphQL endpoint захищений service-token-ом.
Для AWS не використовуй `host.docker.internal`, бо Batch контейнер не побачить локальний backend.

7. Перевір права доступу:

- credentials бекенду мають мати `batch:SubmitJob` для job queue/job definition і `s3:GetObject` для results bucket;
- Batch job role має мати `s3:GetObject` для `AWS_S3_BUCKET`;
- якщо використовується S3-based result flow, Batch job role також має мати `s3:PutObject` у `AWS_COMPUTATION_RESULTS_BUCKET/AWS_COMPUTATION_RESULTS_PREFIX/*`.

Після зміни `.env` перезапусти backend. Попередження має зникнути, а cloud-запуски з UI
будуть відправлятись у `AWS_BATCH_JOB_QUEUE`.

## 1. Які скрипти треба публікувати в AWS

У репозиторії є два окремі entrypoint-и всередині `aws-jobs/`:

- Обчислення конвеєра:
  - `aws-jobs/src/aws_jobs/compute_handler.py`
- Оптимізація експерименту:
  - `aws-jobs/src/aws_jobs/optimization_handler/optimization_handler.py`

Обидва скрипти можна запускати з одного й того ж Docker-образу, який збирається з `aws-jobs/Dockerfile`.
Різниця між ними лише в команді запуску або в `AWS Batch Job Definition`.

## 2. Збірка та пуш образу в ECR

Приклад нижче використовує один ECR repository і два теги: один для compute, другий для optimization.

```bash
export AWS_REGION=eu-central-1
export AWS_ACCOUNT_ID=123456789012
export ECR_REPOSITORY=aws-jobs
export ECR_URI=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}
```

Створити repository, якщо його ще немає:

```bash
aws ecr describe-repositories \
  --repository-names "$ECR_REPOSITORY" \
  --region "$AWS_REGION" >/dev/null 2>&1 || \
aws ecr create-repository \
  --repository-name "$ECR_REPOSITORY" \
  --region "$AWS_REGION"
```

Увійти в ECR:

```bash
aws ecr get-login-password --region "$AWS_REGION" | \
docker login --username AWS --password-stdin \
  "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
```

Зібрати образ і запушити два теги:

```bash
docker build -t aws-jobs:latest aws-jobs

docker tag aws-jobs:latest "${ECR_URI}:compute-latest"
docker tag aws-jobs:latest "${ECR_URI}:optimization-latest"

docker push "${ECR_URI}:compute-latest"
docker push "${ECR_URI}:optimization-latest"
```

Нотатки:

- Якщо змінили `requirements.txt`, `Dockerfile` або Python-код у `aws-jobs/src/`, образ треба перебудувати і знову запушити.
- Якщо потрібен жорстко версіонований rollout, використовуй теги на кшталт `compute-2026-04-13-1` замість `latest`.

## 3. AWS Batch ресурси

Мінімально потрібні:

- `Compute Environment`
- `Job Queue`
- окремі `Job Definition` для compute і optimization

### 3.1 Job Definition для compute

Рекомендована конфігурація:

- Image: `${ECR_URI}:compute-latest`
- Command:
  - `python -u src/aws_jobs/compute_handler.py`
- Environment:
  - `COMPUTE_BACKEND_URL=https://<backend-host>/graphql`
  - `COMPUTE_BACKEND_TOKEN=<service-token>` якщо GraphQL endpoint захищений токеном

Права контейнера:

- читання з `AWS_S3_BUCKET`, якщо датасети лежать у S3
- мережевий доступ до backend GraphQL URL

Важливо:

- Для AWS не можна залишати `host.docker.internal` як backend URL. Потрібен реальний URL, доступний з VPC або з публічної мережі.
- `compute_handler.py` очікує `COMPUTE_BACKEND_URL` навіть тоді, коли payload приходить через `COMPUTE_PAYLOAD_JSON`.

### 3.2 Job Definition для optimization

Рекомендована конфігурація:

- Image: `${ECR_URI}:optimization-latest`
- Command:
  - `python -u src/aws_jobs/optimization_handler/optimization_handler.py`

Права контейнера:

- мережевий доступ до backend GraphQL URL

Важливо:

- Основний payload для optimization передається через `OPTIMIZATION_PAYLOAD_JSON`.
- Окремий `COMPUTE_BACKEND_URL` для цього handler не потрібен, бо `backend_url` вже входить у payload.

## 4. Змінні оточення бекенду для cloud compute

Додай у `.env` бекенду:

```dotenv
AWS_BATCH_JOB_QUEUE=...
AWS_BATCH_JOB_DEFINITION=compute-job-definition:1
AWS_BATCH_JOB_NAME_PREFIX=experiment-run
CLOUD_WORKER_POLL_MS=5000

AWS_S3_BUCKET=your-input-bucket
AWS_COMPUTATION_RESULTS_BUCKET=your-results-bucket
AWS_COMPUTATION_RESULTS_PREFIX=computations
AWS_COMPUTATION_RESULTS_REGION=...

AWS_REGION=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

BACKEND_CLOUD_WORKER_ENABLED=true
BACKEND_LOCAL_WORKER_ENABLED=true
BACKEND_LOCAL_DOCKER_IMAGE=aws-jobs
OPTIMIZATION_DOCKER_IMAGE=aws-jobs-optimization
```

Пояснення:

- `AWS_BATCH_JOB_DEFINITION` має вказувати саме на compute job definition.
- `BACKEND_CLOUD_WORKER_ENABLED=true` вмикає відправку запусків з черги `cloud` в AWS Batch.
- `BACKEND_LOCAL_WORKER_ENABLED=true` вмикає backend Docker worker, який бере запуски з черги `cloud` і виконує їх через `BACKEND_LOCAL_DOCKER_IMAGE`.
- Черга `local` призначена для desktop local worker.
- `BACKEND_LOCAL_DOCKER_IMAGE` задає Docker image для backend-виконання cloud-запусків без AWS Batch.
- `OPTIMIZATION_DOCKER_IMAGE` використовується локальним `OptimizationRunner`, а не AWS Batch.

## 5. Ручний запуск job-ів у AWS Batch

### 5.1 Compute

Для smoke test достатньо передати `pipelineId`, а сам шлях конвеєра handler дочитає з бекенду через `COMPUTE_BACKEND_URL`.

```bash
export COMPUTE_PAYLOAD_JSON='{
  "pipelineId": "PIPELINE_ID",
  "file_s3_bucket": "your-input-bucket",
  "file_s3_key": "uploads/dataset.csv"
}'

aws batch submit-job \
  --region "$AWS_REGION" \
  --job-name "manual-compute-$(date +%s)" \
  --job-queue "$AWS_BATCH_JOB_QUEUE" \
  --job-definition "compute-job-definition:1" \
  --container-overrides "environment=[{name=COMPUTE_PAYLOAD_JSON,value=$COMPUTE_PAYLOAD_JSON}]"
```

### 5.2 Optimization

```bash
export OPTIMIZATION_PAYLOAD_JSON='{
  "experimentId": "EXPERIMENT_ID",
  "backend_url": "https://backend.example.com/graphql",
  "backend_token": "SERVICE_TOKEN",
  "hyper_optimization_minutes_per_pipeline": 30
}'

aws batch submit-job \
  --region "$AWS_REGION" \
  --job-name "manual-optimization-$(date +%s)" \
  --job-queue "optimization-job-queue" \
  --job-definition "optimization-job-definition:1" \
  --container-overrides "environment=[{name=OPTIMIZATION_PAYLOAD_JSON,value=$OPTIMIZATION_PAYLOAD_JSON}]"
```

Якщо command уже зафіксований у job definition, `container-overrides` достатньо лише для environment variables.

## 6. Поточні обмеження реалізації

На рівні поточного коду важливо не змішувати два різні сценарії:

- Бекенд автоматично відправляє в AWS тільки compute jobs через `CloudComputationWorker`.
- Оптимізація зараз запускається локально через Docker у `OptimizationRunner` і використовує `OPTIMIZATION_DOCKER_IMAGE`.
- Тобто публікація optimization image в ECR робить optimization runnable в AWS, але бекенд сам по собі ще не почне відправляти її в AWS Batch без окремої доробки.

Окрема технічна примітка:

- `CloudComputationWorker` уже резервує `result_s3_bucket` і `result_s3_key` у payload для cloud-запусків.
- Водночас поточний `compute_handler.py` завершує pipeline через GraphQL callback-и і потребує `COMPUTE_BACKEND_URL`.
- Якщо хочеш повністю S3-based completion flow, це треба окремо доробити в Python handler або в механізмі reconciliation на бекенді.

## 7. Вибір середовища в UI

- У налаштуваннях графа ввімкни потрібні черги: `Локально` або `У хмарі`.
- У картці обчислень доступний перемикач середовища запуску.
- Якщо ввімкнені обидві черги, той самий шлях можна запускати або локально, або через AWS Batch.

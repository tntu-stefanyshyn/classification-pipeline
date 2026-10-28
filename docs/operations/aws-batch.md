# AWS Jobs (AWS Batch)

This guide covers running computations in AWS Batch. For local development you do not need it:
see the [setup guide](../../SETUP.md), which runs compute containers on your machine.

## Quick setup for the "cloud worker disabled" warning

The backend logs this warning (in Ukrainian) at startup:
`Хмарний воркер вимкнено: AWS Batch або bucket для результатів не налаштовано.`
("Cloud worker is disabled: AWS Batch or the results bucket is not configured.")
It appears when `BACKEND_CLOUD_WORKER_ENABLED` is on (the default in code is `true`) but at least one
required setting is missing:

- `AWS_BATCH_JOB_QUEUE`
- `AWS_BATCH_JOB_DEFINITION`
- `AWS_COMPUTATION_RESULTS_BUCKET`, or the fallback `AWS_S3_BUCKET`

If you do not need AWS Batch in your environment but want the backend to run `cloud` queue runs itself
through a local Docker image, disable the AWS Batch worker, enable the backend Docker worker and
restart the backend:

```dotenv
BACKEND_CLOUD_WORKER_ENABLED=false
BACKEND_LOCAL_WORKER_ENABLED=true
```

If you need cloud compute, the minimal setup is:

1. Create or choose an S3 bucket for the experiment input files. Its name goes into `AWS_S3_BUCKET`.
2. Create or choose an S3 bucket for the cloud run results. Its name goes into `AWS_COMPUTATION_RESULTS_BUCKET`. For development you can use the same bucket as `AWS_S3_BUCKET`.
3. Publish the Docker image from `aws-jobs/` to ECR, as described in section 2.
4. Create an AWS Batch compute environment, job queue and compute job definition, as described in section 3.
5. Add the minimal variables to `backend/.env`:

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

6. Add the container variables to the compute job definition:

```dotenv
COMPUTE_BACKEND_URL=https://<backend-host>/graphql
COMPUTE_BACKEND_TOKEN=<service-token>
```

`COMPUTE_BACKEND_TOKEN` is needed when the GraphQL endpoint requires the service token.
Do not use `host.docker.internal` for AWS: a Batch container cannot reach your local backend.

7. Check the permissions:

- the backend credentials need `batch:SubmitJob` for the job queue and job definition, and `s3:GetObject` for the results bucket;
- the Batch job role needs `s3:GetObject` for `AWS_S3_BUCKET`;
- when you use the S3-based result flow, the Batch job role also needs `s3:PutObject` for `AWS_COMPUTATION_RESULTS_BUCKET/AWS_COMPUTATION_RESULTS_PREFIX/*`.

After changing `.env`, restart the backend. The warning disappears and cloud runs started from the UI
are submitted to `AWS_BATCH_JOB_QUEUE`.

## 1. Which scripts to publish to AWS

The repository has two separate entrypoints inside `aws-jobs/`:

- Pipeline computation: `aws-jobs/src/aws_jobs/compute_handler.py`
- Experiment optimization: `aws-jobs/src/aws_jobs/optimization_handler/optimization_handler.py`

Both can run from the same Docker image, built from `aws-jobs/Dockerfile`. The only difference is the
command, set on the container or in the AWS Batch job definition. The Dockerfile's default command is
the compute handler.

## 2. Build and push the image to ECR

The example below uses one ECR repository and two tags: one for compute and one for optimization.

```bash
export AWS_REGION=eu-central-1
export AWS_ACCOUNT_ID=123456789012
export ECR_REPOSITORY=aws-jobs
export ECR_URI=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}
```

Create the repository if it does not exist:

```bash
aws ecr describe-repositories \
  --repository-names "$ECR_REPOSITORY" \
  --region "$AWS_REGION" >/dev/null 2>&1 || \
aws ecr create-repository \
  --repository-name "$ECR_REPOSITORY" \
  --region "$AWS_REGION"
```

Log in to ECR:

```bash
aws ecr get-login-password --region "$AWS_REGION" | \
docker login --username AWS --password-stdin \
  "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
```

Build the image and push both tags:

```bash
docker build -t aws-jobs:latest aws-jobs

docker tag aws-jobs:latest "${ECR_URI}:compute-latest"
docker tag aws-jobs:latest "${ECR_URI}:optimization-latest"

docker push "${ECR_URI}:compute-latest"
docker push "${ECR_URI}:optimization-latest"
```

Notes:

- If you change `requirements.txt`, the `Dockerfile` or the Python code in `aws-jobs/src/`, rebuild and push the image again.
- For a strictly versioned rollout, use tags such as `compute-2026-04-13-1` instead of `latest`.

## 3. AWS Batch resources

The minimum you need:

- a compute environment
- a job queue
- separate job definitions for compute and optimization

### 3.1 Compute job definition

Recommended configuration:

- Image: `${ECR_URI}:compute-latest`
- Command: `python -u src/aws_jobs/compute_handler.py`
- Environment:
  - `COMPUTE_BACKEND_URL=https://<backend-host>/graphql`
  - `COMPUTE_BACKEND_TOKEN=<service-token>` when the GraphQL endpoint requires a token

Container permissions:

- read access to `AWS_S3_BUCKET` when datasets are stored in S3
- network access to the backend GraphQL URL

Important:

- Do not leave `host.docker.internal` as the backend URL for AWS. Use a real URL reachable from your VPC or the public network.
- `compute_handler.py` requires `COMPUTE_BACKEND_URL` even when the payload arrives through `COMPUTE_PAYLOAD_JSON`.

### 3.2 Optimization job definition

Recommended configuration:

- Image: `${ECR_URI}:optimization-latest`
- Command: `python -u src/aws_jobs/optimization_handler/optimization_handler.py`

Container permissions:

- network access to the backend GraphQL URL

Important:

- The main optimization payload is passed through `OPTIMIZATION_PAYLOAD_JSON`.
- This handler does not need a separate `COMPUTE_BACKEND_URL`, because `backend_url` is part of the payload.

## 4. Backend environment variables for cloud compute

Add to the backend `.env`:

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

Notes:

- `AWS_BATCH_JOB_DEFINITION` must point to the compute job definition.
- `BACKEND_CLOUD_WORKER_ENABLED=true` submits runs from the `cloud` queue to AWS Batch.
- `BACKEND_LOCAL_WORKER_ENABLED=true` enables the backend Docker worker, which takes runs from the `cloud` queue and runs them with `BACKEND_LOCAL_DOCKER_IMAGE`.
- The `local` queue is served by the desktop local worker.
- `BACKEND_LOCAL_DOCKER_IMAGE` sets the Docker image for running `cloud` queue runs on the backend host without AWS Batch (default `aws-jobs`).
- `OPTIMIZATION_DOCKER_IMAGE` is used by the local `OptimizationRunner`, not by AWS Batch (default `aws-jobs-optimization`).
- With Docker Compose the `aws-jobs` and `aws-jobs-optimization` images are built by the one-shot services of the same names in `docker-compose.yml`.

## 5. Manually running jobs in AWS Batch

### 5.1 Compute

For a smoke test it is enough to pass `pipelineId`; the handler reads the pipeline path from the
backend through `COMPUTE_BACKEND_URL`.

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

If the command is already fixed in the job definition, `container-overrides` only needs the environment variables.

## 6. Current limitations

Do not mix up the two scenarios:

- The backend automatically submits only compute jobs to AWS, through `CloudComputationWorker`.
- Optimization currently runs locally through Docker in `OptimizationRunner` and uses `OPTIMIZATION_DOCKER_IMAGE`.
- Publishing the optimization image to ECR makes optimization runnable in AWS, but the backend does not submit it to AWS Batch without further development.

Technical note:

- `CloudComputationWorker` already reserves `result_s3_bucket` and `result_s3_key` in the payload of cloud runs.
- However, the current `compute_handler.py` completes the pipeline through GraphQL callbacks and requires `COMPUTE_BACKEND_URL`.
- A fully S3-based completion flow needs separate work in the Python handler or in a reconciliation mechanism on the backend.

## 7. Choosing the environment in the UI

- In the graph settings, enable the queues you need: **Local** or **Cloud** (the labels follow the UI language).
- The computation card has a switch for the execution environment.
- If both queues are enabled, the same path can be run either locally or through AWS Batch.

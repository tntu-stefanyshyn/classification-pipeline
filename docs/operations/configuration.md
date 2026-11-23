# Configuration reference

Every environment variable that the backend, the desktop app, the `aws-jobs` containers and Docker Compose read. For a first setup follow the [setup guide](../../SETUP.md); this page lists every variable, its default and where it is used.

How each part gets its values:

| Part                  | Where the values come from                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend               | The process environment and `backend/.env` (loaded by `dotenv`; a variable that is already set wins). `backend/.env.example` is the template.             |
| Desktop main process  | The process environment and, in development only, `desktop/.env` (`desktop/.env.example`). A packaged app reads only the environment; nothing is bundled. |
| Desktop renderer      | `VITE_*` variables, replaced by Vite at build time.                                                                                                       |
| `aws-jobs` containers | The environment the starting worker passes to the container (`docker run --env`, an AWS Batch job definition) and a JSON payload.                         |
| Docker Compose        | `docker-compose.yml`: it reads `backend/.env` for the backend service and overrides two variables.                                                        |

In the **Required** column, "Production" means the backend refuses to start with `NODE_ENV=production` unless the value is set to a non-default one.

## Backend

### Startup validation

`assertValidConfig` (`backend/src/config/validateConfig.ts`) checks the environment first thing in `bootstrap()`, before MongoDB is opened or a worker starts. It prints every problem at once and exits with code 1, so a misconfigured backend stops at startup instead of failing on a request later:

```text
Invalid backend configuration (2 problems):
  - MONGODB_URI is required, for example mongodb://localhost:27017/app. Without it the backend would start without a database.
  - LOCAL_WORKER_POLL_MS must be a whole number of milliseconds from 1 to 2147483647 (got "fast").
Fix the values in backend/.env or the environment; see docs/operations/configuration.md.
```

It **fails** when:

- `MONGODB_URI` is missing, blank, or not a connection string that the MongoDB driver can parse: it needs the `mongodb://` or `mongodb+srv://` scheme and at least one host, so `mongodb:///app` is rejected (the value is parsed, never connected to);
- `NODE_ENV=production` and `JWT_SECRET` is missing or one of the default values `dev-secret` or `change-me`;
- `NODE_ENV=production` and `BACKEND_SERVICE_TOKEN` is a placeholder from the example files (`change-me`, `change-me-service-token`);
- a poll interval (`LOCAL_WORKER_POLL_MS`, `CLOUD_WORKER_POLL_MS`) is not a whole number from 1 to 2147483647 (the longest delay a Node.js timer accepts; a longer one would fire after 1 ms and make the worker poll the database continuously);
- `AWS_S3_PRESIGN_EXPIRES` is not a whole number of seconds from 1 to 604800 (the seven days that S3 allows);
- `ACCESS_TOKEN_TTL` or `REFRESH_TOKEN_TTL` is not a duration (a number of seconds, or a number with `s`, `m`, `h` or `d`), or is so long that the expiry date would be beyond the last date JavaScript supports (about 100 million days; the session could not be saved);
- a switch (`BACKEND_LOCAL_WORKER_ENABLED`, `BACKEND_CLOUD_WORKER_ENABLED`, `BACKEND_HYPER_OPTIMIZATION_ENABLED`) is not one of `1`, `true`, `yes`, `0`, `false`, `no`;
- `BACKEND_GRAPHQL_URL` is not an `http://` or `https://` URL.

It only **warns** (the line starts with `[config]`) when the backend can run but a setting is probably unintended: a missing or default `JWT_SECRET` outside production, a missing or placeholder `BACKEND_SERVICE_TOKEN` (worker operations then stay closed), and a missing `AWS_S3_BUCKET` or `AWS_REGION` (file uploads and downloads fail).

The port is not configurable: the backend always listens on port 4000.

### Core and authentication

| Variable                | Default                                    | Required     | Meaning                                                                                                                                                                                     | Used by                                                           |
| ----------------------- | ------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `NODE_ENV`              | `development`                              | Optional     | `production` switches on the production checks above. In `development` the backend rewrites `backend/schema.gql` at startup.                                                                | `config.ts`, `validateConfig.ts`                                  |
| `MONGODB_URI`           | none                                       | **Required** | MongoDB connection string. Docker Compose overrides it with `mongodb://mongo:27017/app`.                                                                                                    | `index.ts`                                                        |
| `JWT_SECRET`            | `dev-secret`                               | Production   | Secret that signs the access tokens (JWT) and the HMAC signatures of refresh tokens and upload keys. Changing it signs every user out.                                                      | `AuthFlow`, `SessionStore`, `uploadKeys`                          |
| `ACCESS_TOKEN_TTL`      | `15m`                                      | Optional     | Lifetime of the access token (JWT): seconds, or a number with `s`, `m`, `h` or `d`.                                                                                                         | `auth/constants/token.ts`                                         |
| `REFRESH_TOKEN_TTL`     | `30d`                                      | Optional     | Lifetime of each refresh token; every refresh starts a new period. Same format.                                                                                                             | `auth/constants/token.ts`                                         |
| `BACKEND_SERVICE_TOKEN` | empty                                      | For workers  | Token that workers and compute containers send. Empty matches nothing, so worker operations stay closed. See [Authentication](../api/authentication.md#where-the-service-token-comes-from). | `AuthFlow`, `LocalBackendComputationWorker`, `ComputationManager` |
| `BACKEND_GRAPHQL_URL`   | `http://host.docker.internal:4000/graphql` | Optional     | URL by which containers that the backend starts reach it. `localhost` is replaced by `host.docker.internal`. Compose sets the same value.                                                   | `LocalBackendComputationWorker`, optimization                     |

### S3 (dataset files)

| Variable                 | Default | Required | Meaning                                                                                                                                     | Used by                                   |
| ------------------------ | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `AWS_S3_BUCKET`          | empty   | Uploads  | Bucket for the CSV files (keys `uploads/<user id>/...`). Without it uploads fail (`S3 bucket and region must be configured`).               | `StorageClient`                           |
| `AWS_REGION`             | empty   | Uploads  | Region of that bucket; also the region of the AWS Batch client.                                                                             | `StorageClient`, `CloudComputationWorker` |
| `AWS_ACCESS_KEY_ID`      | empty   | Optional | Credentials for S3 and AWS Batch. When both key variables are empty the AWS SDK default credential chain is used (for example an IAM role). | `StorageClient`, `CloudComputationWorker` |
| `AWS_SECRET_ACCESS_KEY`  | empty   | Optional | Secret of the key above.                                                                                                                    | same                                      |
| `AWS_S3_PRESIGN_EXPIRES` | `900`   | Optional | Lifetime of presigned upload and download URLs, in seconds (1 to 604800).                                                                   | `StorageClient`                           |

### Workers and containers

| Variable                       | Default                 | Required | Meaning                                                                                                                                                                               | Used by                         |
| ------------------------------ | ----------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `BACKEND_LOCAL_WORKER_ENABLED` | `true`                  | Optional | Starts the backend Docker worker, which runs the `cloud` queue in containers on the backend host.                                                                                     | `index.ts`, `PipelineManager`   |
| `BACKEND_CLOUD_WORKER_ENABLED` | `true`                  | Optional | Starts the AWS Batch worker for the `cloud` queue. The default is `true`, so set `false` when you do not use AWS Batch; otherwise the backend logs that the cloud worker is disabled. | `index.ts`, `PipelineManager`   |
| `BACKEND_LOCAL_DOCKER_IMAGE`   | `aws-jobs`              | Optional | Docker image of the compute container started by the backend Docker worker.                                                                                                           | `LocalBackendComputationWorker` |
| `OPTIMIZATION_DOCKER_IMAGE`    | `aws-jobs-optimization` | Optional | Docker image of the optimization container.                                                                                                                                           | `OptimizationRunner`            |
| `LOCAL_WORKER_POLL_MS`         | `3000`                  | Optional | How often the backend Docker worker looks for a queued run, in milliseconds. The desktop worker reads a variable of the same name (see below).                                        | `LocalBackendComputationWorker` |
| `CLOUD_WORKER_POLL_MS`         | `5000`                  | Optional | How often the AWS Batch worker polls, in milliseconds.                                                                                                                                | `CloudComputationWorker`        |
| `AWS_JOBS_DIR`                 | auto-detected           | Optional | Path of the `aws-jobs` directory used to build the image when it is missing. By default `../aws-jobs` or `aws-jobs` relative to the working directory is tried.                       | `LocalBackendComputationWorker` |

### AWS Batch

Only needed for `BACKEND_CLOUD_WORKER_ENABLED=true`. See [AWS Jobs (AWS Batch)](aws-batch.md).

| Variable                         | Default                  | Required       | Meaning                                                                    | Used by                  |
| -------------------------------- | ------------------------ | -------------- | -------------------------------------------------------------------------- | ------------------------ |
| `AWS_BATCH_JOB_QUEUE`            | empty                    | With AWS Batch | Name of the job queue.                                                     | `CloudComputationWorker` |
| `AWS_BATCH_JOB_DEFINITION`       | empty                    | With AWS Batch | Job definition of the compute job, for example `compute-job-definition:1`. | `CloudComputationWorker` |
| `AWS_BATCH_JOB_NAME_PREFIX`      | `experiment-run`         | Optional       | Prefix of the submitted job names (`<prefix>-<run id>`).                   | `CloudComputationWorker` |
| `AWS_COMPUTATION_RESULTS_BUCKET` | value of `AWS_S3_BUCKET` | With AWS Batch | Bucket where result files are expected.                                    | `CloudComputationWorker` |
| `AWS_COMPUTATION_RESULTS_PREFIX` | `computations`           | Optional       | Key prefix of result files.                                                | `CloudComputationWorker` |
| `AWS_COMPUTATION_RESULTS_REGION` | `AWS_REGION`             | Optional       | Region of the results bucket.                                              | `CloudComputationWorker` |

### Read but not used

`config.ts` reads these variables, but no code uses the values, so setting them has no effect:

| Variable                             | Default                         |
| ------------------------------------ | ------------------------------- |
| `PYTHON_BIN`                         | `python3`                       |
| `COMPUTE_HANDLER_MODULE`             | `aws_jobs.compute_handler`      |
| `OPTIMIZATION_HANDLER_MODULE`        | `aws_jobs.optimization_handler` |
| `BACKEND_HYPER_OPTIMIZATION_ENABLED` | `false`                         |

`SKIP_OPTIMIZATION_BUILD` no longer exists. It belonged to `backend/scripts/build-optimization-container.sh`, which was removed when Docker Compose took over building the images (`docker compose build aws-jobs aws-jobs-optimization`). Setting it has no effect.

## Desktop

| Variable                      | Default                                               | Required         | Meaning                                                                                                                   | Used by                        |
| ----------------------------- | ----------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `BACKEND_SERVICE_TOKEN`       | none                                                  | For `local` runs | Must equal the backend value. Without it the desktop worker logs a warning and stays off, and `local` runs stay `queued`. | `LocalComputationWorker`       |
| `LOCAL_WORKER_ENABLED`        | on                                                    | Optional         | Set to `false` to start the desktop without its worker. Any other value leaves the worker on.                             | `main.ts`                      |
| `LOCAL_WORKER_POLL_MS`        | `3000`                                                | Optional         | How often the desktop worker looks for a queued `local` run, in milliseconds.                                             | `LocalComputationWorker`       |
| `LOCAL_WORKER_STATUS_POLL_MS` | `3000`                                                | Optional         | How often the worker checks that the run it executes is still its own (stop or pause), in milliseconds.                   | `LocalComputationWorker`       |
| `LOCAL_WORKER_REBUILD_IMAGE`  | `true` when `NODE_ENV=development`, otherwise `false` | Optional         | `1` or `true` rebuild the `aws-jobs` image on every start; `0` or `false` build it only when it is missing.               | `pythonRunner.ts`              |
| `AWS_JOBS_DIR`                | auto-detected                                         | Optional         | Path of the `aws-jobs` directory used to build the image.                                                                 | `pythonRunner.ts`              |
| `VITE_GRAPHQL_ENDPOINT`       | `http://localhost:4000/graphql`                       | Optional         | GraphQL URL of the renderer. Fixed when the app is built.                                                                 | `desktop/src/config/config.ts` |

## aws-jobs containers

The workers start the containers; you normally set these only for a manual run or in an AWS Batch job definition.

| Variable                                                        | Default | Required                       | Meaning                                                                                                                  | Used by                   |
| --------------------------------------------------------------- | ------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| `COMPUTE_BACKEND_URL`                                           | none    | **Required** (compute)         | GraphQL URL of the backend. Not `host.docker.internal` in AWS.                                                           | `compute_handler.py`      |
| `COMPUTE_BACKEND_TOKEN`                                         | none    | With the service token enabled | Service token; a `backend_token` in the payload takes precedence.                                                        | `compute_handler.py`      |
| `COMPUTE_PAYLOAD_JSON`                                          | none    | One of stdin or this           | The run payload (`pipelineId`, `executionId`, ...) when the container gets none on stdin.                                | `compute_handler.py`      |
| `OPTIMIZATION_PAYLOAD_JSON`                                     | none    | One of stdin or this           | The optimization payload (`experimentId`, `backend_url`, `backend_token`, ...) when the container gets none on stdin.    | `optimization_handler.py` |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, ... | none    | Optional                       | Standard AWS variables read by `boto3` when the dataset is downloaded from S3 (an AWS Batch job normally uses its role). | `compute_handler.py`      |

## Docker Compose

`docker-compose.yml` has no `${VARIABLE}` substitutions. It sets:

| Service                             | Setting                                                                                                                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend`                           | `env_file: backend/.env`; `MONGODB_URI=mongodb://mongo:27017/app` and `BACKEND_GRAPHQL_URL=http://host.docker.internal:4000/graphql` override the file; port `4000:4000`; the Docker socket is mounted so the backend can start containers. |
| `mongo`                             | Image `mongo:7` with the volume `mongo-data`.                                                                                                                                                                                               |
| `aws-jobs`, `aws-jobs-optimization` | Build-only services that produce the two images and exit.                                                                                                                                                                                   |

## Tests and CI

| Variable                    | Where                                         | Meaning                                                                                            |
| --------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `MONGODB_TEST_URI`          | `Dockerfile.ci` (`mongodb://127.0.0.1:27017`) | Enables the claim concurrency test against a real MongoDB; the test is skipped when it is not set. |
| `PUPPETEER_SKIP_DOWNLOAD`   | `backend/Dockerfile`, `Dockerfile.ci`, CI     | Skips downloading Chromium during `npm ci`.                                                        |
| `PUPPETEER_EXECUTABLE_PATH` | `backend/Dockerfile`                          | Path of the system Chromium (`/usr/bin/chromium`) that renders the PDF report.                     |

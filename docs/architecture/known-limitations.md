# Known limitations

This page describes how the system behaves today where that behavior is not ideal. Every item was checked against the code. The page describes the behavior only; fixes are tracked separately in the issue tracker, and an item should be removed here when its fix is merged.

## Run reliability

### There is no `failed` pipeline status

- **Components:** `PipelineStatus`, `ComputationManager.failRun`, the desktop UI.
- **Behavior:** `PipelineStatus` has the values `idle`, `queued`, `running` and `completed`. A run that fails, is stopped, or is paused returns to `idle`. The reason is kept only as the status message and in the pipeline history.
- **Consequence:** the UI shows a failed run, a stopped run and a run that never started the same way, as `idle`. Optimization stays blocked until every pipeline is `completed`.

### A run whose worker disappears stays `running`

- **Components:** `ComputationManager`, the desktop worker, the backend workers, the `workflows` unique index.
- **Behavior:** nothing checks that a worker is alive: there is no heartbeat, run timeout or recovery of `running` pipelines at startup. A worker reports the end of a run itself (`completePipeline` or `failExperimentRun`). A graceful stop of the backend Docker worker fails its active runs, but a crash of the desktop app, of the backend or of a container host does not.
- **Consequence:** the run stays `running` until the user stops it. For `local` runs the unique index allows only one running run per machine hostname, so that machine cannot claim another `local` run until the stuck run is stopped.

### AWS Batch jobs have no failure path

- **Components:** `CloudComputationWorker`, `aws-jobs/compute_handler.py`.
- **Behavior:** the worker submits a job and then reads a result file from S3 (`result_s3_key`) to finish the run, but the handler never writes that file; it finishes the run only through the `completePipeline` callback. The backend never asks AWS Batch for the state of a job.
- **Consequence:** if a Batch job fails before the callback (for example it is killed or cannot reach the backend), the run stays `running` until the user stops it.

### Optimization runs inside one GraphQL request

- **Components:** `optimizeExperimentRuns`, `ComputationManager.optimize`, `OptimizationRunner`.
- **Behavior:** the query starts the container and waits for it to finish. The time limit is the minutes per pipeline multiplied by the number of paths, so it can be long.
- **Consequence:** a client or proxy timeout does not stop the job. If the backend restarts during optimization, the experiment can stay in `optimization` with the optimization status `optimizing`, and then a new call is refused with "already running".

## Security

### The PDF report endpoint is not authenticated

- **Components:** `GET /experiments/:experimentId/report` in `backend/src/index.ts`.
- **Behavior:** the endpoint checks only that the id is valid and that the experiment exists. There is no token check and no ownership check. The server also allows every origin (`cors()`).
- **Consequence:** anyone who can reach the backend and knows an experiment id can download its report, which contains the experiment name, description, graph, file details and results.

### One shared service token

- **Components:** `AuthFlow.isService`, `BACKEND_SERVICE_TOKEN`, the workers and containers.
- **Behavior:** all workers and containers use the same token, and the desktop worker needs it too. A worker operation is allowed for any run of any user (`claimExperimentRun` takes the next queued run of any user). The example file ships a placeholder value (`change-me-service-token`), and the backend accepts any non-empty value.
- **Consequence:** whoever knows the token can read and change every experiment, and a desktop installation that holds it can claim other users' runs. See [Authentication](../api/authentication.md).

## Data and performance

- **Unused collection.** `computation_results` has a model but no code uses it; results live in `pipelines.computingResult`.
- **No index on `workflows.instanceId`.** Every status read filters by it. Aggregations such as claiming and pausing join `workflows` and `pipelines` with `$lookup`.
- **Status and side effect are not atomic.** The side effect of a transition runs after the status is written, so a failing side effect leaves the new status (see [ADR 0002](decisions/0002-mongo-backed-workflows.md)).
- **Polling.** The desktop polls the backend every 5 seconds for statuses, and workers poll for runs (`LOCAL_WORKER_POLL_MS`, `CLOUD_WORKER_POLL_MS`); there are no subscriptions. A status change can take several seconds to show.

## Behavior of the compute handler and messages

- **One dataset format.** `compute_handler.py` reads the CSV with `;` as the separator, takes the first column as the class label and requires at least two more columns, all numeric and without missing values. Any other file fails with the message "Невалідний файл".
- **Backend messages are Ukrainian.** Status messages, validation errors and log lines produced by the backend and `aws-jobs` are written in Ukrainian and are not localized. Only the desktop UI has English and Ukrainian texts.

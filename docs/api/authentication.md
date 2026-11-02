# Authentication

Every GraphQL request is identified by its `Authorization: Bearer <token>` header. The backend accepts two kinds of token.

| Token         | Who sends it                                                                  | How it is verified                                                         |
| ------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| User JWT      | The desktop UI, after `login` or `register`                                   | `AuthFlow.me` verifies the signature with `JWT_SECRET` and loads the user  |
| Service token | Compute workers and their containers (desktop worker, Docker jobs, AWS Batch) | `AuthFlow.isService` compares it with `BACKEND_SERVICE_TOKEN` (fixed time) |

An empty `BACKEND_SERVICE_TOKEN` matches nothing, so worker operations stay closed when it is not configured.

## Who can call what

| Operation                                                                                                                                                          | User JWT                | Service token |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ------------- |
| `enqueueExperimentRuns`, `stopExperimentRun`, `pauseExperimentRuns`, `resumeExperimentRuns`, `optimizeExperimentRuns`                                              | Owner of the experiment | Rejected      |
| `claimExperimentRun`, `completePipeline`, `updatePipelineProgress`, `updatePipelineOptimization`, `updateExperimentProgress`, `updateExperimentOptimizationResult` | Rejected                | Allowed       |
| `pipeline`, `pipelines`, `changePipelineStatus`, `experiment`                                                                                                      | Owner of the experiment | Allowed       |
| `signedDownloadUrl`                                                                                                                                                | Uploader of the file    | Allowed       |

The owner is the user whose id is stored in the `createdById` field of the experiment. A pipeline belongs to the owner of its experiment.

Resolvers authenticate the request (`AuthFlow.me` for user operations, `AuthFlow.authenticate` where the service token is also allowed) and pass the user id or the principal to `ExperimentAccess`. It holds the ownership rules and does not depend on HTTP.

## Errors

- A request without a token gets `Not authenticated`.
- A worker operation called with anything other than the service token gets `Not authenticated`.
- An invalid or expired JWT gets the verification error, for example `jwt malformed`.
- A valid user who does not own the experiment or the pipeline gets the same "not found" error as for an id that does not exist, so the response does not reveal whether the id exists. The `experiment` query returns `null` in both cases.

## Where the service token comes from

Set the same value in every place. Any long random string works; do not keep the `change-me` value from the example files, because whoever knows the token can read and change every experiment.

| Component                                | Source of the token                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Backend                                  | `BACKEND_SERVICE_TOKEN` in `backend/.env`                                                         |
| Containers started by the backend        | `COMPUTE_BACKEND_TOKEN`, set by `LocalBackendComputationWorker`                                   |
| Optimization container                   | `backend_token` in the stdin payload, set by `OptimizationRunner`                                 |
| Desktop worker (`local` queue)           | `BACKEND_SERVICE_TOKEN` in the Electron main process: the shell, or `desktop/.env` in development |
| Containers started by the desktop worker | `COMPUTE_BACKEND_TOKEN`, set by `pythonRunner`                                                    |
| AWS Batch jobs                           | `COMPUTE_BACKEND_TOKEN` in the [job definition](../operations/aws-batch.md)                       |

## Desktop worker

The desktop worker uses the service token, not the JWT of the signed-in user. The worker runs in the Electron main process, which cannot read the `localStorage` of the renderer, and it has to keep reporting after the JWT expires or the user signs out. The operations it calls are worker operations in any case.

The token is read at runtime and is never bundled, so a packaged app does not contain it. Without the token the worker logs a warning and stays off, and `local` runs remain `queued`.

`claimExperimentRun` is not limited to one user: a worker takes the next queued run of any user. Give the service token only to machines you trust to run everyone's computations, and do not distribute it with the desktop app to end users.

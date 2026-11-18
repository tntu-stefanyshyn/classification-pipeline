# Runs and pipelines

A **pipeline** (also called a run) is the computation of one graph path in one queue. These operations queue, stop and read runs, start the optimization, and let workers claim runs and report results. Statuses and their transitions are in [Lifecycle](../../architecture/lifecycle.md), the full flow in [Run execution](../../architecture/run-execution.md).

| Operation                    | Kind     | Access          | Purpose                                                         |
| ---------------------------- | -------- | --------------- | --------------------------------------------------------------- |
| `enqueueExperimentRuns`      | Mutation | Owner           | Queues idle pipelines.                                          |
| `stopExperimentRun`          | Mutation | Owner           | Stops a running pipeline.                                       |
| `pauseExperimentRuns`        | Mutation | Owner           | Returns all queued and running pipelines to `idle`.             |
| `resumeExperimentRuns`       | Mutation | Owner           | Queues the idle pipelines again.                                |
| `optimizeExperimentRuns`     | Query    | Owner           | Runs the optimization and returns the best pipeline.            |
| `pipelines`                  | Query    | Owner or worker | The pipelines of an experiment.                                 |
| `pipeline`                   | Query    | Owner or worker | One pipeline.                                                   |
| `changePipelineStatus`       | Mutation | Owner or worker | Queues an idle pipeline or takes a queued one out of the queue. |
| `claimExperimentRun`         | Mutation | Worker          | Takes the next queued pipeline of a queue.                      |
| `updatePipelineProgress`     | Mutation | Worker          | Reports progress and messages of a running pipeline.            |
| `completePipeline`           | Mutation | Worker          | Stores the result and completes the run.                        |
| `failExperimentRun`          | Mutation | Worker          | Ends a run as failed (back to `idle`).                          |
| `updatePipelineOptimization` | Mutation | Worker          | Stores the optimization score of a pipeline.                    |

## The `Pipeline` type

| Field                    | Type                     | Meaning                                                                    |
| ------------------------ | ------------------------ | -------------------------------------------------------------------------- |
| `_id`                    | ID!                      | Id of the pipeline.                                                        |
| `experimentId`           | ID!                      | The experiment.                                                            |
| `graphStructureId`       | ID!                      | The graph the path was taken from.                                         |
| `queue`                  | ComputationQueue!        | `local` or `cloud`.                                                        |
| `status`                 | PipelineStatus!          | `idle`, `queued`, `running` or `completed`.                                |
| `pathNodeIds`            | [ID!]!                   | The nodes of the path, in order. `pathNodes` returns the nodes themselves. |
| `progress`               | Float                    | Progress of the current run, 0 to 100.                                     |
| `statusMessage`          | String                   | Last message, for example the error that ended a run.                      |
| `history`                | [PipelineHistoryItem!]!  | Status changes and progress messages: `message`, `status`, `createdAt`.    |
| `machineInfo`            | PipelineMachineInfo      | The machine that runs or ran the pipeline.                                 |
| `computingResult`        | ComputationResultPayload | The result of a completed run.                                             |
| `optimizationScores`     | [Float!]                 | Scores from the optimization.                                              |
| `executionId`            | ID                       | Number of the current execution; see [Executions](#executions).            |
| `createdAt`, `updatedAt` | Date!                    | Times.                                                                     |

The result has one value per cross-validation fold: `accuracyScores`, `f1Scores`, `rocAucScores`, `optimizationIntermediateScores`, `confusionMatrixes`, `predictionSampleCounts`, plus `sampleCount`, `duration` (seconds), `channelNames` (the class labels) and `predictionDataPercent`.

## Executions

A pipeline can be stopped, queued again and claimed by another worker while the first worker is still running. Every claim therefore starts a numbered **execution**, and every worker report names it with `executionId`. The backend ignores a report of an execution that is no longer current: `completePipeline` returns `false`, and a progress report or a failure changes nothing. See [Execution identity](../../domain/experiments.md#execution-identity).

## `enqueueExperimentRuns`

`enqueueExperimentRuns(input: EnqueueExperimentRunsInput!): Boolean!`

| Input field    | Type              | Meaning                                                                                |
| -------------- | ----------------- | -------------------------------------------------------------------------------------- |
| `experimentId` | ID!               | The experiment.                                                                        |
| `queue`        | ComputationQueue! | `local` or `cloud`. It must be allowed by the graph settings and the computation mode. |
| `pipelineId`   | ID                | Queue only this pipeline.                                                              |
| `runAll`       | Boolean           | Queue every pipeline of the experiment.                                                |
| `rerun`        | Boolean           | Reserved: the backend does not read it.                                                |

Send either `pipelineId` or `runAll`. Only pipelines in `idle` are queued; the others are left as they are. Errors:

| Message                                                                      | Meaning                                         |
| ---------------------------------------------------------------------------- | ----------------------------------------------- |
| `Provide either runAll or pathNodeIds, not both.`                            | Both `pipelineId` and `runAll` were sent.       |
| `Path node ids are required for a single run.`                               | Neither was sent.                               |
| `Спочатку заповніть налаштування графа.`                                     | The graph settings are missing.                 |
| `Оберіть хоча б один тип обчислень у налаштуваннях графа.`                   | No queue is selected in the settings.           |
| `Обраний тип обчислень не дозволений у налаштуваннях графа.`                 | The queue is not among the selected queues.     |
| `Цей граф дозволяє лише локальні обчислення.` / `...лише хмарні обчислення.` | The computation mode forbids the queue.         |
| `Налаштування ваг метрик некоректні. Перевірте значення.`                    | The metric weights do not sum to 1.             |
| `Усі конвеєри мають містити етап класифікації.`                              | A path has no classification stage.             |
| `Конвеєр не знайдено`                                                        | The pipeline does not belong to the experiment. |

```graphql
mutation Enqueue($input: EnqueueExperimentRunsInput!) {
  enqueueExperimentRuns(input: $input)
}
```

```json
{ "input": { "experimentId": "6740f0c2a1b2c3d4e5f6071a", "queue": "cloud", "runAll": true } }
```

## `stopExperimentRun`, `pauseExperimentRuns`, `resumeExperimentRuns`

- `stopExperimentRun(input: { runId: ID! }): Pipeline!` stops a `running` pipeline and returns it to `idle` with the message "Зупинено користувачем" ("Stopped by the user"). Any other status is returned unchanged. A cloud job is cancelled first.
- `pauseExperimentRuns(experimentId: ID!): [Pipeline!]!` returns all `queued` and `running` pipelines of the experiment to `idle` and returns them.
- `resumeExperimentRuns(experimentId: ID!): [Pipeline!]!` queues the `idle` pipelines again.

```graphql
mutation Stop($input: StopExperimentRunInput!) {
  stopExperimentRun(input: $input) {
    _id
    status
    statusMessage
  }
}
```

```json
{ "input": { "runId": "6740f0c2a1b2c3d4e5f60901" } }
```

## `optimizeExperimentRuns`

`optimizeExperimentRuns(experimentId: ID!): OptimizationResult!`

Runs the optimization (the `aws-jobs-optimization` container) and returns when it has finished, so the call can take a long time (see [Known limitations](../../architecture/known-limitations.md)). It is a query by declaration, but it changes the experiment status. The result is `{ runId, pathNodeIds, score }` of the best pipeline (lower is better).

Allowed when the experiment is `computing` or `completed` and **every** pipeline is `completed`. It is also accepted as a **retry** when the experiment is already in `optimization` but `optimization.status` is no longer `optimizing`, for example `failed` after the container reported an error: the experiment does not move to `optimization` again, the container runs again, and the experiment moves to `completed` when it succeeds (see [Run execution](../../architecture/run-execution.md#optimization)). Errors:

| Message                                                                      | Meaning                                                                                                                                 |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Оптимізація вже виконується.`                                               | The experiment is in `optimization` and `optimization.status` is `optimizing`; wait for it, or retry once it is no longer `optimizing`. |
| `Оптимізацію можна запускати лише зі статусів "Обчислення" або "Завершено".` | The experiment is in another status (`creating` or `configuring`).                                                                      |
| `There are uncomuted pipelines.`                                             | Some pipeline is not `completed`.                                                                                                       |
| `Graph metrics are not configured.` / `Graph has no paths for optimization.` | The graph is incomplete.                                                                                                                |

```graphql
query Optimize($id: ID!) {
  optimizeExperimentRuns(experimentId: $id) {
    runId
    pathNodeIds
    score
  }
}
```

## `pipelines` and `pipeline`

- `pipelines(experimentId: ID!, queue: ComputationQueue): [Pipeline!]!`: the pipelines of the experiment, optionally only one queue.
- `pipeline(pipelineId: ID!): Pipeline`: one pipeline.

A user who does not own the pipeline gets `Конвеєр не знайдено` ("Pipeline not found") from `pipeline`, and an experiment that is not theirs is reported as not found by `pipelines`, the same as for a missing id.

```graphql
query Pipelines($experimentId: ID!) {
  pipelines(experimentId: $experimentId) {
    _id
    queue
    status
    progress
    statusMessage
    computingResult {
      accuracyScores
      f1Scores
      duration
    }
  }
}
```

## `changePipelineStatus`

`changePipelineStatus(input: ChangePipelineStatusInput!): Boolean!` with `pipelineId`, `status` and an optional `message`.

It can only queue an `idle` pipeline or take a `queued` one out of the queue. It cannot start a run (`Запуск можна почати лише через claimExperimentRun`, "A run can only be started through claimExperimentRun") or end a running one (`TRANSITION_NOT_FOUND`): stop with `stopExperimentRun`; workers end a run with `completePipeline` or `failExperimentRun`.

## Worker operations

These are called with the service token by the desktop worker, the backend workers and the compute and optimization containers. A user gets `Not authenticated`. See [Authentication](../authentication.md#who-can-call-what).

### `claimExperimentRun`

`claimExperimentRun(queue: ComputationQueue!, machineInfo: PipelineMachineInfoInput): Pipeline`

Takes the next queued pipeline of the queue (highest `priority`, oldest first) and moves it to `running` in one atomic step, starting a new execution. It returns `null` when nothing is queued. A `local` claim must send `machineInfo.hostname`, and only one `local` run can be running per host name; a second claim from the same host returns `null`. Without a host name: `Для локальних запусків потрібна назва машини (machineInfo.hostname)` ("A machine name is required for local runs").

```graphql
mutation Claim($queue: ComputationQueue!, $machineInfo: PipelineMachineInfoInput) {
  claimExperimentRun(queue: $queue, machineInfo: $machineInfo) {
    _id
    experimentId
    pathNodeIds
    executionId
  }
}
```

```json
{
  "queue": "local",
  "machineInfo": {
    "hostname": "lab-pc-3",
    "platform": "win32",
    "arch": "x64",
    "cores": 8,
    "memoryGb": 16
  }
}
```

### `updatePipelineProgress`

`updatePipelineProgress(input: UpdatePipelineProgressInput!): Pipeline!` with `pipelineId`, `executionId`, and optional `progress` (0 to 100) and `message`. Both `pipelineId` and `executionId` are required in every report, also when reporting an error. The message is stored in the history with the run's current status.

```json
{
  "input": {
    "pipelineId": "6740f0c2a1b2c3d4e5f60901",
    "executionId": "3",
    "progress": 45,
    "message": "Cross-validation fold 2/5"
  }
}
```

### `completePipeline`

`completePipeline(input: CompletePipelineInput!): Boolean!` with `pipelineId`, `executionId` and the result `payload` (`ComputationResultPayloadInput`). The result is saved first and then the run moves to `completed`. Returns `false` when the execution is no longer current.

```json
{
  "input": {
    "pipelineId": "6740f0c2a1b2c3d4e5f60901",
    "executionId": "3",
    "payload": {
      "accuracyScores": [0.91, 0.93],
      "f1Scores": [0.9, 0.92],
      "rocAucScores": [0.95, 0.96],
      "optimizationIntermediateScores": [1.6, 1.62],
      "sampleCount": 1200,
      "duration": 84.2,
      "confusionMatrixes": [
        [
          [40, 2],
          [3, 55]
        ],
        [
          [41, 1],
          [2, 56]
        ]
      ],
      "channelNames": ["0", "1"]
    }
  }
}
```

### `failExperimentRun`

`failExperimentRun(input: FailExperimentRunInput!): Pipeline!` with `runId`, `executionId` and an optional `statusMessage`. Moves the run from `running` back to `idle` with the reason, if the execution is still current.

### `updatePipelineOptimization`

`updatePipelineOptimization(input: UpdatePipelineOptimizationInput!): Boolean!` with `pipelineId` and `score`. Stores the integral score of one pipeline during the optimization.

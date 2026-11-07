# Experiments and computations

This page collects the rules for experiments, graphs and runs. It covers both the backend rules and
how the desktop constructor and the experiment details page apply them.

## Terms

- **Experiment**: a dataset (an uploaded CSV file) plus a graph of stages.
- **Graph**: nodes (technologies) connected by edges; each node belongs to a **stage**.
- **Stage**: one of `PREPROCESSING`, `DATA_ENHANCEMENT`, `FEATURE_EXTRACTION`, `DIMENSIONALITY_REDUCTION`, `CLASSIFICATION`, in this order.
- **Path**: a chain of nodes from a root node to a leaf.
- **Pipeline** (run): the computation of one path in one queue. One pipeline is generated for every combination of path and selected queue when the experiment moves to `computing`. With both `local` and `cloud` selected there are two pipelines per path.
- **Queue**: where a pipeline is executed: `local` (the desktop worker) or `cloud` (the backend Docker worker or AWS Batch).
- **Fold**: the number of cross-validation folds, set in the graph settings.

## Experiment status lifecycle

| Status         | Meaning                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------- |
| `creating`     | Default state after creation.                                                             |
| `configuring`  | Set when graph nodes, graph settings or the computation mode are updated.                 |
| `computing`    | Set when computations are started. One pipeline is generated per path and selected queue. |
| `optimization` | Set while the optimization job runs, after the pipelines are computed.                    |
| `completed`    | Set when optimization has finished.                                                       |

Allowed transitions: `creating → configuring → computing → optimization → completed`, and
`completed → optimization` (optimization can be run again). The diagram and what each transition
does are in [Lifecycle](../architecture/lifecycle.md#experiment).
An experiment cannot enter `computing` without an attached, available CSV file.

## Pipeline status lifecycle

| Status      | Meaning                                                                            |
| ----------- | ---------------------------------------------------------------------------------- |
| `idle`      | No active run. Initial status, and the status a run returns to when it is stopped. |
| `queued`    | Waiting in a queue for a worker.                                                   |
| `running`   | Claimed by a worker and being computed.                                            |
| `completed` | Finished successfully.                                                             |

Allowed transitions: `idle → queued`, `queued → running`, `queued → idle` (when computations are
paused), `running → completed`, `running → idle` (when the run is stopped).

There is no `stopped` or `failed` status: stopping a run returns the pipeline to `idle` with the
status message "Зупинено користувачем". The pipeline history records every status change. The diagram
and the side effects are in [Lifecycle](../architecture/lifecycle.md#pipeline).

## Graph and paths

- **Generation.** `generateExperimentGraph` builds the graph from the technologies the user selects for each stage (`GraphManager.generateGraphFromSelections`). At least one `CLASSIFICATION` technology is required, and each technology must belong to the stage it is selected for. Every selected technology gets a node under each node of the previous stages, and a stage without a selection is skipped.
- **Optional stages.** A stage before classification does not have to be on every path: the nodes of later stages are attached to the nodes of the stage and also to the nodes that came before it. For example, 2 preprocessing technologies and 3 classification technologies give 2 + 9 nodes and 9 paths (6 with a preprocessing step and 3 without).
- **Paths.** `buildGraphPaths` takes every node without a parent (or whose parent is not in the graph) as a root and walks the graph depth first. A path is the list of node ids from a root to a leaf; a node that is already on the current path is not visited again, so a cycle cannot loop forever. Each path becomes one pipeline per selected queue.
- **Node rules** (checked when the graph is saved): node ids are unique, a node cannot be its own parent, the parent must exist, and the stage must come after the stage of the parent. Node settings start from the defaults of the technology.

## Validations

- The stage order of a graph is enforced: a child node must belong to a later stage than its parent.
- Computations can start only if **every** graph path contains a classification stage.
- Graph settings require the four metric weights (`accuracy`, `f1`, `rocAuc`, `ntps`) to be in the range 0..1 and to sum to 1.
- Graph settings require at least one allowed computation queue, and a run is accepted only for an allowed queue.
- The computation mode of the graph (`local`, `cloud`, `both`) restricts which queue can be used.
- Experiment updates and graph changes are blocked after computations start (statuses `computing`, `optimization` and `completed`).
- Optimization can be started only from the `computing` or `completed` status, and only one optimization can run at a time. All pipelines, in every selected queue, must be `completed`.

## GraphQL behavior

- Only the owner of an experiment can start, stop, pause, resume, optimize or read its runs; workers report with the service token. See [Authentication](../api/authentication.md).
- `enqueueExperimentRuns` checks the graph settings and the classification stage coverage, then moves `idle` pipelines to `queued`.
- `stopExperimentRun(input: { runId })` stops a `running` pipeline and returns it to `idle`; for any other status it returns the pipeline unchanged. A cloud job is cancelled first when one exists.
- `PipelineStatus.idle` is also what the UI shows for a path that has no runs.

## Claiming runs

Workers take queued runs with `claimExperimentRun(queue, machineInfo)` (`ComputationManager.claimNextRun`):

- Candidates are queued runs of the requested queue, ordered by `priority` (descending) and `updatedAt` (ascending).
- The `queued` -> `running` change is atomic: `WorkflowManager.changeStatus` updates the workflow only if its status is still the one it read, and throws `WorkflowTransitionConflictError` otherwise. Each run is therefore taken by exactly one worker.
- A worker that loses a run to another worker immediately tries the next candidate in the same call instead of waiting for its next poll.
- `local` runs are limited to one at a time **per machine**, and a `local` claim must send `machineInfo.hostname` (the desktop app sends `os.hostname()`). The claim writes the hostname to the run's workflow (`machineHostname`) in the same update that sets `running`. A unique partial index on `workflows` (`machineHostname`, only for `PIPELINE` workflows in `running`) rejects a second running run with the same hostname, and the worker then returns no run. The run leaves the index in the same update that moves it out of `running`, so there is no separate lock to release or expire, and a delayed side effect of an older execution cannot free the machine. The backend awaits `WorkflowModel.init()` on startup, so it fails if the index cannot be built.
- The concurrency test `ClaimConcurrency.mongo.test.ts` runs against a real MongoDB when `MONGODB_TEST_URI` is set (the CI test container sets it) and is skipped otherwise.

## Execution identity

A run (pipeline) can be stopped or paused, queued again and claimed by a new execution while the old worker is still running. Every claim therefore starts a numbered execution, and every report from a worker names the execution it belongs to.

- `executionId` is a per-pipeline counter. The claim reads the queued workflow's `executionId` (n), raises the pipeline's execution fence (`pipeline.executionId`) to n + 1 with a conditional update, and then moves the workflow to `running` with `executionId: n + 1` only if it still has `executionId: n`. A retry or reclaim always gets a new number; of parallel claims, only one gets it.
- `claimExperimentRun` returns the run with `executionId`, and the `Pipeline` type exposes it (as `ID`). The claim also clears any result an earlier execution left on the pipeline.
- Execution reports must carry `executionId`, and a report with a missing or invalid one is rejected: `completePipeline`, `failExperimentRun` (replaces the generic `changePipelineStatus` for worker failures), `updatePipelineProgress`, and the backend workers' `completeRun`/`failRun`. They are applied by conditional updates:
  - completion and failure change the status only if the workflow is `running` with that `executionId`;
  - completion first saves the result, only if the pipeline's execution fence equals `executionId` and no result is saved yet, and then moves the run to `completed`. A completed run therefore always has its result: if the write fails, the run stays `running` and the report can be retried. A repeated report of the execution that completed the run returns `true` and keeps the first result. A report that lost to a Stop or a failure removes the result it saved and returns `false`, and a stale report returns `false` without saving anything;
  - a progress message is stored in the pipeline history with the run's current workflow status, because workers send only the message;
  - progress is written only if the pipeline's execution fence equals `executionId`. The fence is raised before the claim's status change, so an older execution's progress cannot reach a newer one.
- The cleanup side effects of `running -> idle` / `running -> completed` and the `queued -> running` reset are filtered by the execution that made the transition, so a delayed cleanup cannot change a newer execution.
- Workers abort when the run is no longer `running` **or** its `executionId` changed (desktop `isCurrentExecution`, `LocalBackendComputationWorker.startStatusWatcher`).
- Cloud results are read from `<prefix>/<runId>/<executionId>.json`, the key the backend passes to the job as `result_s3_key`, and a result that names another `executionId` is ignored. Contract: the writer stores `{ status: 'completed', result }` or `{ status: 'failed', error }` (optionally with `executionId`) at exactly `result_s3_key`. No component in this repository writes it today: `aws-jobs` wrote it from the payload key until `_store_result` was removed (commit `8645569`) and now reports only through `completePipeline` (see [AWS Jobs](../operations/aws-batch.md)). A restored or external writer must use `result_s3_key` from the payload, not build its own key. The Batch role's `s3:PutObject` on `<prefix>/*` also covers the nested key. Result files are not deleted.
- User actions (`stopExperimentRun`, `pauseExperimentRuns`, `resumeExperimentRuns`) are not execution reports and need no `executionId`. Stop and Pause end the execution they read (a run that finished or restarted meanwhile is left as it is, without an error). Before the status change they mark the execution on the pipeline (`stoppedExecutionId`) and take the `cloudJobId` it recorded, in one update, and end that job with `TerminateJob` (`CancelJob` reports success without stopping a job that is already running), so a requeue or a new claim cannot hide it. The cancellation comes first because a write can fail after the status change, and a repeated Stop would then find the run already `idle`; if the status change itself fails, the run stays `running` and Stop can be repeated. Cancelling the job of a run that completed meanwhile changes nothing. `CloudComputationWorker.submitRun` records a job id only for an execution that is not marked, in one conditional update, and cancels the job itself otherwise, so every submitted job is cancelled by exactly one side.
- Worker reports (`completePipeline`, `failExperimentRun`, `completeRun`, `failRun`) end only a `running` execution: a run that was stopped and queued again keeps its `executionId` until the next claim, and a late report must not take it out of the queue.
- `changePipelineStatus` carries no execution identity, so it cannot move a run out of `running` (`TRANSITION_NOT_FOUND`): the user stops a running run with `stopExperimentRun` (the desktop Stop button), and workers end one with `failExperimentRun`/`completePipeline`. Otherwise a request meant for an earlier execution would end a newer one of the same run. It still queues an idle run and takes a queued run out of the queue.

## Graph constructor (desktop)

- The stage order is fixed: preprocessing → data enhancement → feature extraction → dimensionality reduction → classification.
- Adding a node allows only the stages that come after the parent stage.
- Editing a node cannot change its stage to an earlier one if a parent stage exists.
- The classification stage has no button for adding a child node.

## Graph settings (desktop)

- The metrics `accuracy`, `f1`, `rocAuc` and `ntps` are stored in the range 0..1.
- The UI takes the weights as percentages (0-100); the sum must be 100% (1 in the data).
- The computation types are a multi-select (local and cloud). A run cannot start without a selection.
- Limits checked by the backend (`GraphManager.normalizeGraphSettings`): `folds` is an integer from 1 to 20 (default 5), `hyperOptimizationMinutesPerPipeline` is at least 1 (default 30), `predictDataPercent` is an integer from 1 to 99 (default 20), and the queues are unique with at least one selected.

## Running computations (`ExperimentDetailsPage`)

- The **computation card** shows a table of paths and their actions (start, stop, restart).
- The graph color reflects the path status:
  - `queued`: blue
  - `running`: yellow
  - `completed`: green
  - `idle`: light gray (no runs)
- Computations are blocked if at least one path has no classification stage.
- The `info` button opens a modal with the details of the latest run of the path.
- Editing the experiment, graph settings and graph stages is disabled once computations have started.

## PDF report

- The **Download PDF** button appears only when the experiment status is `completed`.
- The REST endpoint is `GET {API_BASE}/experiments/:experimentId/report`, where `API_BASE` is the GraphQL URL without `/graphql`. See [REST report](../api/index.md#rest-report).

# Experiments and computations

## Experiment status lifecycle

- `creating` — default state after creation.
- `configuring` — set when graph nodes or graph settings are updated.
- `computing` — set when runs are enqueued.
- `completed` — set when there are no active runs (`queued`/`running`).

## Validations

- Graph stage order is enforced (child stage must come after parent stage).
- Computation runs are allowed only if **all** graph paths include a classification stage.
- Graph settings require metric weights 0..1 with a sum of 1.
- Graph settings require at least one allowed computation queue.
- Experiment updates and graph changes are blocked after computations start (statuses `computing`/`completed`).

## GraphQL

- `stopExperimentRun(input: { runId })` sets status to `stopped` and returns the run.
- `enqueueExperimentRuns` checks graph settings and classification stage coverage.
- `PipelineStatus.idle` is reserved for UI path status with no runs (runs should not be stored as `idle`).

## Claiming runs

Workers take queued runs with `claimExperimentRun(queue, machineInfo)` (`ComputationManager.claimNextRun`):

- Candidates are queued runs of the requested queue, ordered by `priority` (descending) and `updatedAt` (ascending).
- The `queued` -> `running` change is atomic: `WorkflowManager.changeStatus` updates the workflow only if its status is still the one it read, and throws `WorkflowTransitionConflictError` otherwise. Each run is therefore taken by exactly one worker.
- A worker that loses a run to another worker immediately tries the next candidate in the same call instead of waiting for its next poll.
- `local` runs are limited to one at a time **per machine**, and a `local` claim must send `machineInfo.hostname` (the desktop app sends `os.hostname()`). The claim writes the hostname to the run's workflow (`machineHostname`) in the same update that sets `running`. A unique partial index on `workflows` (`machineHostname`, only for `PIPELINE` workflows in `running`) rejects a second running run with the same hostname, and the worker then returns no run. The run leaves the index in the same update that moves it out of `running`, so there is no separate lock to release or expire, and a delayed side effect of an older execution cannot free the machine. The backend awaits `WorkflowModel.init()` on startup, so it fails if the index cannot be built.
- Local runs that were already `running` before this index existed get their `machineHostname` from `pipeline.machineInfo.hostname` through the startup migration `local-run-machine-hostname`. Runs without a stored hostname cannot be backfilled and do not block their machine.
- The concurrency test `ClaimConcurrency.mongo.test.ts` runs against a real MongoDB when `MONGODB_TEST_URI` is set (the CI test container sets it) and is skipped otherwise.

## Execution identity

A run (pipeline) can be stopped or paused, queued again and claimed by a new execution while the old worker is still running. Every claim therefore starts a numbered execution, and every report from a worker names the execution it belongs to.

- `executionId` is a per-pipeline counter. The claim reads the queued workflow's `executionId` (n), raises the pipeline's execution fence (`pipeline.executionId`) to n + 1 with a conditional update, and then moves the workflow to `running` with `executionId: n + 1` only if it still has `executionId: n`. A retry or reclaim always gets a new number; of parallel claims, only one gets it.
- `claimExperimentRun` returns the run with `executionId`, and the `Pipeline` type exposes it (as `ID`). The claim also clears any result an earlier execution left on the pipeline.
- Execution reports must carry `executionId`, and a report with a missing or invalid one is rejected: `completePipeline`, `failExperimentRun` (replaces the generic `changePipelineStatus` for worker failures), `updatePipelineProgress`, and the backend workers' `completeRun`/`failRun`. They are applied by conditional updates:
  - completion and failure change the status only if the workflow is `running` with that `executionId`;
  - completion first saves the result, only if the pipeline's execution fence equals `executionId` and no result is saved yet, and then moves the run to `completed`. A completed run therefore always has its result: if the write fails, the run stays `running` and the report can be retried. A repeated report of the execution that completed the run returns `true` and keeps the first result. A report that lost to a Stop or a failure removes the result it saved and returns `false`, and a stale report returns `false` without saving anything;
  - progress is written only if the pipeline's execution fence equals `executionId`. The fence is raised before the claim's status change, so an older execution's progress cannot reach a newer one.
- The cleanup side effects of `running -> idle` / `running -> completed` and the `queued -> running` reset are filtered by the execution that made the transition, so a delayed cleanup cannot change a newer execution.
- Workers abort when the run is no longer `running` **or** its `executionId` changed (desktop `isCurrentExecution`, `LocalBackendComputationWorker.startStatusWatcher`).
- Cloud results are read from `<prefix>/<runId>/<executionId>.json`, the key the backend passes to the job as `result_s3_key`, and a result that names another `executionId` is ignored. Contract: the writer stores `{ status: 'completed', result }` or `{ status: 'failed', error }` (optionally with `executionId`) at exactly `result_s3_key`. No component in this repository writes it today: `aws-jobs` wrote it from the payload key until `_store_result` was removed (commit `8645569`) and now reports only through `completePipeline` (see `AWS_JOBS.md`). A restored or external writer must use `result_s3_key` from the payload, not build its own key. The Batch role's `s3:PutObject` on `<prefix>/*` also covers the nested key. Result files are not deleted.
- User actions (`stopExperimentRun`, `pauseExperimentRuns`, `resumeExperimentRuns`) are not execution reports and need no `executionId`. Stop and Pause end the execution they read (a run that finished or restarted meanwhile is left as it is, without an error). Before the status change they mark the execution on the pipeline (`stoppedExecutionId`) and take the `cloudJobId` it recorded, in one update; after the change they cancel that job, so a requeue or a new claim in between cannot hide it. `CloudComputationWorker.submitRun` records a job id only for an execution that is not marked, in one conditional update, and cancels the job itself otherwise, so every submitted job is cancelled by exactly one side.
- Worker reports (`completePipeline`, `failExperimentRun`, `completeRun`, `failRun`) end only a `running` execution: a run that was stopped and queued again keeps its `executionId` until the next claim, and a late report must not take it out of the queue.
- `changePipelineStatus` carries no execution identity, so it cannot move a run out of `running` (`TRANSITION_NOT_FOUND`): the user stops a running run with `stopExperimentRun` (the desktop Stop button), and workers end one with `failExperimentRun`/`completePipeline`. Otherwise a request meant for an earlier execution would end a newer one of the same run. It still queues an idle run and takes a queued run out of the queue.

## REST report

- `GET /experiments/:experimentId/report` returns a PDF with graph paths.
- The PDF is generated with `puppeteer` and currently lists the path chains.

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
- `local` runs are limited to one at a time **per machine**: a worker is skipped while a `local` run with the same `machineInfo.hostname` is running. Runs on other machines do not block it. A worker that sends no hostname keeps the old global limit (any running `local` run blocks it).
- The concurrency test `ClaimConcurrency.mongo.test.ts` runs against a real MongoDB when `MONGODB_TEST_URI` is set (the CI test container sets it) and is skipped otherwise.

## REST report

- `GET /experiments/:experimentId/report` returns a PDF with graph paths.
- The PDF is generated with `puppeteer` and currently lists the path chains.

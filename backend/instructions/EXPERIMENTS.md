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

## REST report

- `GET /experiments/:experimentId/report` returns a PDF with graph paths.
- The PDF is generated with `puppeteer` and currently lists the path chains.

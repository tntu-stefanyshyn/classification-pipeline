# Experiments and computations

This page collects the rules for experiments, graphs and runs. It covers both the backend rules and
how the desktop constructor and the experiment details page apply them. The Ukrainian equivalents
of the terms are listed in the [glossary](../index.md#glossary).

## Terms

- **Experiment**: a dataset (an uploaded CSV file) plus a graph of stages.
- **Graph**: nodes (technologies) connected by edges; each node belongs to a **stage**.
- **Stage**: one of `PREPROCESSING`, `DATA_ENHANCEMENT`, `FEATURE_EXTRACTION`, `DIMENSIONALITY_REDUCTION`, `CLASSIFICATION`, in this order.
- **Path**: a chain of nodes from a root node to a leaf.
- **Pipeline** (run): the computation of one path in one queue. One pipeline is generated for every combination of path and selected queue when the experiment moves to `computing`. With both `local` and `cloud` selected there are two pipelines per path.
- **Queue**: where a pipeline is executed: `local` (the desktop worker) or `cloud` (the backend Docker worker or AWS Batch).
- **Fold**: the number of cross-validation folds, set in the graph settings.

## Experiment status lifecycle

| Status          | Meaning                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `creating`      | Default state after creation.                                                                        |
| `configuring`   | Set when graph nodes, graph settings or the computation mode are updated.                            |
| `computing`     | Set when computations are started. One pipeline is generated per path and selected queue.             |
| `optimization`  | Set while the optimization job runs, after the pipelines are computed.                               |
| `completed`     | Set when optimization has finished.                                                                  |

Allowed transitions: `creating → configuring → computing → optimization → completed`, and
`completed → optimization` (optimization can be run again).
An experiment cannot enter `computing` without an attached, available CSV file.

## Pipeline status lifecycle

| Status      | Meaning                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------- |
| `idle`      | No active run. Initial status, and the status a run returns to when it is stopped.        |
| `queued`    | Waiting in a queue for a worker.                                                          |
| `running`   | Claimed by a worker and being computed.                                                   |
| `completed` | Finished successfully.                                                                    |

Allowed transitions: `idle → queued`, `queued → running`, `queued → idle` (when computations are
paused), `running → completed`, `running → idle` (when the run is stopped).

There is no `stopped` or `failed` status: stopping a run returns the pipeline to `idle` with the
status message "Зупинено користувачем". The pipeline history records every status change.

## Validations

- The stage order of a graph is enforced: a child node must belong to a later stage than its parent.
- Computations can start only if **every** graph path contains a classification stage.
- Graph settings require the four metric weights (`accuracy`, `f1`, `rocAuc`, `ntps`) to be in the range 0..1 and to sum to 1.
- Graph settings require at least one allowed computation queue, and a run is accepted only for an allowed queue.
- The computation mode of the graph (`local`, `cloud`, `both`) restricts which queue can be used.
- Experiment updates and graph changes are blocked after computations start (statuses `computing`, `optimization` and `completed`).
- Optimization can be started only from the `computing` or `completed` status, and only one optimization can run at a time. All pipelines, in every selected queue, must be `completed`.

## GraphQL behavior

- `enqueueExperimentRuns` checks the graph settings and the classification stage coverage, then moves `idle` pipelines to `queued`.
- `stopExperimentRun(input: { runId })` stops a `running` pipeline and returns it to `idle`; for any other status it returns the pipeline unchanged. A cloud job is cancelled first when one exists.
- `PipelineStatus.idle` is also what the UI shows for a path that has no runs.

## Graph constructor (desktop)

- The stage order is fixed: preprocessing → data enhancement → feature extraction → dimensionality reduction → classification.
- Adding a node allows only the stages that come after the parent stage.
- Editing a node cannot change its stage to an earlier one if a parent stage exists.
- The classification stage has no button for adding a child node.

## Graph settings (desktop)

- The metrics `accuracy`, `f1`, `rocAuc` and `ntps` are stored in the range 0..1.
- The UI takes the weights as percentages (0-100); the sum must be 100% (1 in the data).
- The computation types are a multi-select (local and cloud). A run cannot start without a selection.

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

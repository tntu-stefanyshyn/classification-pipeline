# Experiment operations

An experiment is a dataset file plus a graph of stages; see [Experiments and computations](../../domain/experiments.md) for the rules and [Lifecycle](../../architecture/lifecycle.md) for the statuses. The graph has its own page: [Graph](graph.md).

| Operation                            | Kind     | Access               | Purpose                                                   |
| ------------------------------------ | -------- | -------------------- | --------------------------------------------------------- |
| `experiments`                        | Query    | Signed-in user       | The user's experiments.                                   |
| `experiment`                         | Query    | Owner or worker      | One experiment by id.                                     |
| `createExperiment`                   | Mutation | Signed-in user       | Creates an experiment with an empty graph.                |
| `updateExperiment`                   | Mutation | Signed-in user (own) | Changes name, description, file, graph or graph settings. |
| `changeExperimentStatus`             | Mutation | Signed-in user (own) | Moves the experiment along the status transitions.        |
| `updateExperimentProgress`           | Mutation | Worker               | Reports the progress of the optimization.                 |
| `updateExperimentOptimizationResult` | Mutation | Worker               | Stores the best pipeline and its score.                   |

## The `Experiment` type

| Field              | Type                   | Meaning                                                                                                     |
| ------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `_id`              | ID!                    | Id of the experiment.                                                                                       |
| `name`             | String!                | Name.                                                                                                       |
| `description`      | String                 | Description.                                                                                                |
| `fileId`           | ID                     | Attached dataset file, if any.                                                                              |
| `status`           | ExperimentStatus       | `creating`, `configuring`, `computing`, `optimization` or `completed`. Read from the experiment's workflow. |
| `graph`            | GraphStructure         | The graph and its settings; see [Graph](graph.md).                                                          |
| `optimization`     | ExperimentOptimization | `status` (`optimizing`, `failed`, `completed`), `progress`, `history`, `bestPipelineId`, `bestScore`.       |
| `computationHosts` | [PipelineMachineInfo!] | Machines that computed pipelines, one per queue.                                                            |
| `createdAt`        | Date!                  | Creation time.                                                                                              |

## `experiments`

`experiments: [Experiment!]!`

```graphql
query {
  experiments {
    _id
    name
    status
    createdAt
  }
}
```

## `experiment`

`experiment(_id: ID!): Experiment`

Returns `null` when the experiment does not exist or belongs to another user, so the answer does not reveal whether an id exists. A worker (service token) can read any experiment.

```graphql
query Experiment($id: ID!) {
  experiment(_id: $id) {
    _id
    name
    status
    fileId
    graph {
      computationMode
      settings {
        folds
        queues
      }
      nodes {
        _id
        stage
        technology
        parentId
      }
    }
    optimization {
      status
      progress
      bestPipelineId
      bestScore
    }
  }
}
```

## `createExperiment`

`createExperiment(input: CreateExperimentInput!): Experiment!`

| Input field   | Type    | Required | Meaning                                                 |
| ------------- | ------- | -------- | ------------------------------------------------------- |
| `name`        | String! | Yes      | Name; it must not be blank.                             |
| `description` | String  | No       | Description.                                            |
| `fileId`      | ID      | No       | An uploaded file of the user. It can be attached later. |

The experiment starts in `creating` with an empty graph. Errors: `Name is required`, `File _id is invalid`, and the file errors below when the file cannot be attached.

```graphql
mutation Create($input: CreateExperimentInput!) {
  createExperiment(input: $input) {
    _id
    status
  }
}
```

```json
{
  "input": {
    "name": "EEG baseline",
    "description": "Five folds",
    "fileId": "6740f0c2a1b2c3d4e5f60719"
  }
}
```

## `updateExperiment`

`updateExperiment(input: UpdateExperimentInput!): Experiment!`

Send `_id` and only the fields to change.

| Input field            | Type                        | Meaning                                                                      |
| ---------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| `_id`                  | ID!                         | Id of the experiment (owned by the caller).                                  |
| `name`                 | String                      | New name; not blank.                                                         |
| `description`          | String                      | New description.                                                             |
| `fileId`               | ID                          | File to attach. An empty value detaches the file.                            |
| `graphNodes`           | [GraphNodeInput!]           | The whole list of nodes; it replaces the current one. See [Graph](graph.md). |
| `graphSettings`        | GraphStructureSettingsInput | New computation settings. See [Graph](graph.md).                             |
| `graphComputationMode` | ComputationMode             | `local`, `cloud` or `both`.                                                  |

Rules:

- Changing the graph, its settings or its mode moves the experiment to `configuring`.
- In `computing`, `optimization` and `completed` an update is rejected with `Редагування експерименту недоступне після початку обчислень.` ("Editing the experiment is not available after computations have started."). The one exception is a request that sets only `fileId` on an experiment that has no file yet.
- A file that is being deleted cannot be attached: `Файл не знайдено або він зараз видаляється.` ("The file was not found or is being deleted.").

Other errors: `Experiment not found`, `Name is required`, `File _id is invalid`.

```graphql
mutation Update($input: UpdateExperimentInput!) {
  updateExperiment(input: $input) {
    _id
    name
    status
  }
}
```

```json
{ "input": { "_id": "6740f0c2a1b2c3d4e5f6071a", "name": "EEG baseline v2" } }
```

## `changeExperimentStatus`

`changeExperimentStatus(input: ChangeExperimentStatusInput!): Boolean!` with `experimentId` and `status`.

Moves the experiment along the allowed transitions (`creating → configuring → computing → optimization → completed`, and `completed → optimization`). Any other move fails with `TRANSITION_NOT_FOUND`. A concurrent change fails with `TRANSITION_CONFLICT`. The desktop app uses it to start the computations (`computing`).

Moving to `computing` checks the dataset first and then generates the pipelines (one per path and selected queue):

- `Додайте CSV файл до експерименту перед запуском обчислень.` ("Add a CSV file to the experiment before starting computations.")
- `Файл експерименту не знайдено або він недоступний для обчислень.` ("The experiment's file was not found or is not available for computations.")

```graphql
mutation Start($input: ChangeExperimentStatusInput!) {
  changeExperimentStatus(input: $input)
}
```

```json
{ "input": { "experimentId": "6740f0c2a1b2c3d4e5f6071a", "status": "computing" } }
```

## Worker operations

Called by the optimization container with the service token; users are rejected with `Not authenticated`. They are described for authors of workers.

### `updateExperimentProgress`

`updateExperimentProgress(input: UpdateExperimentProgressInput!): Boolean!`

Sets `optimization.progress` and `optimization.status` and adds an entry to `optimization.history` when `message` or `status` is sent.

```json
{
  "input": {
    "experimentId": "6740f0c2a1b2c3d4e5f6071a",
    "progress": 40,
    "message": "Pipeline 2 of 5",
    "status": "optimizing"
  }
}
```

### `updateExperimentOptimizationResult`

`updateExperimentOptimizationResult(input: UpdateExperimentOptimizationResultInput!): Boolean!` with `experimentId`, `bestPipelineId` and `score`. Stores the best pipeline and its integral score (lower is better).

# Graph operations

The graph of an experiment is a set of nodes (one technology at one stage each) and the computation settings. There is one graph per experiment; it is created together with the experiment and read through `Experiment.graph`. The rules for stages and paths are in [Experiments and computations](../../domain/experiments.md#graph-and-paths).

| Operation                 | Kind     | Access               | Purpose                                                                |
| ------------------------- | -------- | -------------------- | ---------------------------------------------------------------------- |
| `generateExperimentGraph` | Mutation | Signed-in user (own) | Builds the nodes from the technologies chosen per stage.               |
| `updateExperiment`        | Mutation | Signed-in user (own) | Saves hand-edited nodes (`graphNodes`), settings and computation mode. |

Both are rejected once computations have started (`computing`, `optimization`, `completed`): `generateExperimentGraph` with `Редагування графа недоступне після початку обчислень.` ("Editing the graph is not available after computations have started."), `updateExperiment` with the message in [Experiments](experiments.md#updateexperiment). Both move the experiment to `configuring`.

## The `GraphStructure` type

| Field             | Type                   | Meaning                                                         |
| ----------------- | ---------------------- | --------------------------------------------------------------- |
| `_id`             | ID!                    | Id of the graph.                                                |
| `experimentId`    | ID!                    | The experiment.                                                 |
| `nodes`           | [GraphNode!]!          | The nodes; the edges are given by each node's `parentId`.       |
| `settings`        | GraphStructureSettings | Computation settings; `null` until they are saved.              |
| `computationMode` | ComputationMode        | `local`, `cloud` or `both`. When it is not set, `both` applies. |
| `createdAt`       | Date!                  | Creation time.                                                  |

A `GraphNode` has `_id`, `label`, `stage` (`PREPROCESSING`, `DATA_ENHANCEMENT`, `FEATURE_EXTRACTION`, `DIMENSIONALITY_REDUCTION`, `CLASSIFICATION`), `technology` (the technology name), `settings` (a list of `{ key, value }`), `type` (`technology`) and `parentId`. A node without a parent starts a path.

## `generateExperimentGraph`

`generateExperimentGraph(input: GenerateExperimentGraphInput!): Experiment!`

Replaces the nodes with a new graph made from the technologies chosen for each stage. Every chosen technology becomes a node under each node of the previous chosen stages, and a stage without a choice is skipped, so the graph holds every combination.

| Input field | Type                         | Meaning                                                                     |
| ----------- | ---------------------------- | --------------------------------------------------------------------------- |
| `_id`       | ID!                          | Id of the experiment.                                                       |
| `stages`    | [GraphStageSelectionInput!]! | Per stage: `stage` and `technologyIds` (ids from the `technologies` query). |

`CLASSIFICATION` must have at least one technology. Node settings start from the defaults of the technology.

Errors:

| Message                                                               | Meaning                                  |
| --------------------------------------------------------------------- | ---------------------------------------- |
| `Фінальний етап має містити щонайменше одну технологію класифікації.` | No classification technology was chosen. |
| `Некоректний ідентифікатор технології: <id>`                          | The id is not a valid id.                |
| `Технологію не знайдено: <id>`                                        | There is no such technology.             |
| `Технологія "<name>" не відповідає етапу <stage>.`                    | The technology belongs to another stage. |

```graphql
mutation Generate($input: GenerateExperimentGraphInput!) {
  generateExperimentGraph(input: $input) {
    _id
    graph {
      nodes {
        _id
        label
        stage
        parentId
      }
    }
  }
}
```

```json
{
  "input": {
    "_id": "6740f0c2a1b2c3d4e5f6071a",
    "stages": [
      { "stage": "PREPROCESSING", "technologyIds": ["6740f0c2a1b2c3d4e5f60801"] },
      {
        "stage": "CLASSIFICATION",
        "technologyIds": ["6740f0c2a1b2c3d4e5f60811", "6740f0c2a1b2c3d4e5f60812"]
      }
    ]
  }
}
```

## Editing nodes with `updateExperiment`

`updateExperiment` with `graphNodes` replaces the whole list. Each `GraphNodeInput`:

| Field        | Type                     | Meaning                                                 |
| ------------ | ------------------------ | ------------------------------------------------------- |
| `_id`        | ID!                      | Id of the node, unique in the graph.                    |
| `label`      | String!                  | Name shown for the node.                                |
| `stage`      | ClassificationStage!     | The stage.                                              |
| `technology` | String!                  | Technology name; it must belong to the stage.           |
| `settings`   | [GraphNodeSettingInput!] | `{ key, value }` pairs for the technology's settings.   |
| `type`       | String!                  | `technology`.                                           |
| `parentId`   | ID                       | The parent node; omit it for a node that starts a path. |

The backend checks that every parent exists, that a node is not its own parent, that ids are unique, and that each stage comes after its parent's stage: `Наступний етап має йти після поточного у послідовності класифікації.` ("The next stage must come after the current one in the classification sequence."), or `Parent node not found for <id>`.

## Settings

`graphSettings: GraphStructureSettingsInput` in `updateExperiment`:

| Field                                 | Type                     | Rule                                                                |
| ------------------------------------- | ------------------------ | ------------------------------------------------------------------- |
| `metrics`                             | GraphMetricWeightsInput! | `accuracy`, `f1`, `rocAuc`, `ntps`: each from 0 to 1, summing to 1. |
| `queues`                              | [ComputationQueue!]!     | `local` and/or `cloud`; at least one, duplicates are removed.       |
| `folds`                               | Int!                     | Cross-validation folds, 1 to 20 (default 5).                        |
| `hyperOptimizationMinutesPerPipeline` | Int                      | Optimization budget per pipeline, at least 1 (default 30).          |
| `predictDataPercent`                  | Int                      | Share of the data used for prediction, 1 to 99 (default 20).        |

Errors include `Metric weight "<name>" must be between 0 and 1.`, `Сума ваг метрик має дорівнювати 1.` ("The metric weights must sum to 1."), `Потрібно обрати хоча б один тип обчислень.` ("Choose at least one computation type."), the fold and percentage limits, `Graph settings are required.` and `Graph metrics are required.` when the settings or their `metrics` are missing.

```json
{
  "input": {
    "_id": "6740f0c2a1b2c3d4e5f6071a",
    "graphSettings": {
      "metrics": { "accuracy": 0.25, "f1": 0.25, "rocAuc": 0.25, "ntps": 0.25 },
      "queues": ["cloud"],
      "folds": 5,
      "hyperOptimizationMinutesPerPipeline": 30,
      "predictDataPercent": 20
    },
    "graphComputationMode": "cloud"
  }
}
```

The computation mode limits which queue a run may use: with `local` only `local` runs are accepted, with `cloud` only `cloud` runs. See [Runs and pipelines](runs.md#enqueueexperimentruns).

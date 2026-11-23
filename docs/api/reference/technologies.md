# Technology operations

The technology catalog lists what can be a node of a graph. It is filled by the seeder `technologiesSeeder` when the backend starts.

| Operation      | Kind  | Access | Purpose                               |
| -------------- | ----- | ------ | ------------------------------------- |
| `technologies` | Query | Public | All technologies with their settings. |

## `technologies`

`technologies: [Technology!]!`

| Field         | Type                  | Meaning                                                  |
| ------------- | --------------------- | -------------------------------------------------------- |
| `_id`         | ID!                   | Id of the technology; used in `generateExperimentGraph`. |
| `name`        | String!               | Unique name; graph nodes refer to it in `technology`.    |
| `displayName` | String                | Name shown to users.                                     |
| `stage`       | ClassificationStage!  | The stage the technology belongs to.                     |
| `settings`    | [TechnologySetting!]! | The settings that can be configured.                     |

A `TechnologySetting` has `key` (the key used in a node's `settings`), `label`, `type` (`TEXT`, `NUMBER`, `SELECT` or `BOOLEAN`), `required`, `placeholder`, `defaultValue` and `options` (the allowed values of a `SELECT`).

```graphql
query {
  technologies {
    _id
    name
    displayName
    stage
    settings {
      key
      label
      type
      defaultValue
      options
    }
  }
}
```

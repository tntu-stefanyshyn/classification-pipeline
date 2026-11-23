# GraphQL API reference

The backend serves one GraphQL endpoint, `POST /graphql` on port 4000. This reference lists every operation by area with its access rules, arguments, results, errors and an example. The schema itself carries a description for every operation, argument, type and enum value: `backend/schema.gql` (copied to `desktop/schema.graphql`) is generated from the code, so it is always current; this reference adds the rules and the examples.

| Area                            | Operations                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Authentication](auth.md)       | `register`, `login`, `refreshSession`, `logout`, `me`                                                                                                                                             |
| [Experiments](experiments.md)   | `experiments`, `experiment`, `createExperiment`, `updateExperiment`, `changeExperimentStatus`, `updateExperimentProgress`, `updateExperimentOptimizationResult`                                   |
| [Graph](graph.md)               | `generateExperimentGraph`, and the graph arguments of `updateExperiment`                                                                                                                          |
| [Runs and pipelines](runs.md)   | `enqueueExperimentRuns`, `stopExperimentRun`, `pauseExperimentRuns`, `resumeExperimentRuns`, `optimizeExperimentRuns`, `pipelines`, `pipeline`, `changePipelineStatus`, and the worker operations |
| [Files](files.md)               | `uploadedFiles`, `createUploadedFile`, `uploadedFileUsage`, `deleteUploadedFile`                                                                                                                  |
| [Storage](storage.md)           | `signedUploadUrl`, `signedDownloadUrl`                                                                                                                                                            |
| [Technologies](technologies.md) | `technologies`                                                                                                                                                                                    |
| This page                       | `health`, `serverInfo`                                                                                                                                                                            |

The REST endpoint `GET /experiments/:experimentId/report` is described in [API overview](../index.md#rest-report).

## Making a request

Send a JSON body with the query and its variables:

```bash
curl -sS http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  --data '{"query":"query Experiments { experiments { _id name status } }"}'
```

- **Identifiers** are `_id` strings (the GraphQL type `ID`); the schema never uses `id`.
- **Dates** are ISO 8601 strings in UTC.
- **Numbers**: scores and metrics are floats; percentages are 0 to 100, metric weights 0 to 1.
- **Authentication** is the `Authorization: Bearer <token>` header; see [Authentication](../authentication.md) for the two kinds of token (the user's access token and the workers' service token).

### Access labels

| Label           | Who may call it                                                                     |
| --------------- | ----------------------------------------------------------------------------------- |
| Public          | Anyone, without a token.                                                            |
| Signed-in user  | A user with a valid access token; the data is the user's own.                       |
| Owner           | The user who owns the experiment (`createdById`). A service token is rejected.      |
| Owner or worker | The owner, or a worker with the service token.                                      |
| Worker          | Only a worker with the service token (`BACKEND_SERVICE_TOKEN`). Users are rejected. |

## Errors

A failed operation answers with an `errors` list; the HTTP status is 200 when the query was valid. Each error has a `message`, and some have a stable `extensions.code`:

```json
{
  "errors": [
    {
      "message": "Not authenticated",
      "extensions": { "code": "UNAUTHENTICATED" }
    }
  ],
  "data": null
}
```

- Decide on the `code`, not on the `message`.
- `UNAUTHENTICATED`: the token is missing, invalid or expired, or a worker operation was called without the service token. A client should refresh the session (`refreshSession`) and repeat the request once.
- `INVALID_CREDENTIALS`: `login` with an unknown email or a wrong password.
- Other errors have no code. Their messages come from the code and are partly in Ukrainian; each page lists the ones an integrator is likely to meet, with a translation. A user who does not own an experiment gets the same "not found" error as for an id that does not exist.
- A query that does not match the schema (an unknown field, a missing required argument) is rejected with HTTP 400 and a validation message before any operation runs.

See [Authentication](../authentication.md#errors) for the full list of authentication errors.

## Server

### `health`

`health: String!` (Public). Returns `ok` while the backend runs.

```graphql
query {
  health
}
```

```json
{ "data": { "health": "ok" } }
```

### `serverInfo`

`serverInfo: ServerInfo!` (Public). Returns the version from `package.json` (or `dev`), the status (`ok`) and the uptime in seconds.

```graphql
query {
  serverInfo {
    version
    status
    uptimeSeconds
  }
}
```

```json
{ "data": { "serverInfo": { "version": "1.0.0", "status": "ok", "uptimeSeconds": 4210 } } }
```

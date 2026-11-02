# Authentication

Every GraphQL request is identified by its `Authorization: Bearer <token>` header. The backend accepts two kinds of token.

| Token         | Who sends it                                                                  | How it is verified                                                         |
| ------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| User JWT      | The desktop UI, after `login` or `register`                                   | `AuthFlow.me` verifies the signature with `JWT_SECRET` and loads the user  |
| Service token | Compute workers and their containers (desktop worker, Docker jobs, AWS Batch) | `AuthFlow.isService` compares it with `BACKEND_SERVICE_TOKEN` (fixed time) |

An empty `BACKEND_SERVICE_TOKEN` matches nothing, so worker operations stay closed when it is not configured.

## Who can call what

| Operation                                                                                                                                                          | User JWT                | Service token |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ------------- |
| `enqueueExperimentRuns`, `stopExperimentRun`, `pauseExperimentRuns`, `resumeExperimentRuns`, `optimizeExperimentRuns`                                              | Owner of the experiment | Rejected      |
| `claimExperimentRun`, `completePipeline`, `updatePipelineProgress`, `updatePipelineOptimization`, `updateExperimentProgress`, `updateExperimentOptimizationResult` | Rejected                | Allowed       |
| `pipeline`, `pipelines`, `changePipelineStatus`, `experiment`                                                                                                      | Owner of the experiment | Allowed       |
| `signedDownloadUrl`                                                                                                                                                | Uploader of the file    | Allowed       |

The owner is the user whose id is stored in the `createdById` field of the experiment. A pipeline belongs to the owner of its experiment.

## Errors

Every authentication failure has `extensions.code: "UNAUTHENTICATED"`. Clients decide on the code, not on the message, which is meant for people. Services throw the domain `AuthenticationError`; the global resolver middleware `reportAuthenticationErrors` turns it into this code at the GraphQL boundary.

- A request without a token gets `Not authenticated`.
- A worker operation called with anything other than the service token gets `Not authenticated`.
- An invalid or expired JWT gets the verification error, for example `jwt malformed` or `jwt expired`.
- A JWT without a user id gets `Invalid token payload`, and a JWT of a deleted user gets `User not found`.
- `refreshSession` with an unknown, expired, used or revoked refresh token gets `Session expired`.
- A valid user who does not own the experiment or the pipeline gets the same "not found" error as for an id that does not exist, so the response does not reveal whether the id exists. The `experiment` query returns `null` in both cases. This error has no code: the session is fine.

## User sessions

`login` and `register` return two tokens: `token`, a JWT for the `Authorization` header, and `refreshToken`, an opaque random string.

| Variable            | Default | Meaning                                                           |
| ------------------- | ------- | ----------------------------------------------------------------- |
| `ACCESS_TOKEN_TTL`  | `15m`   | Lifetime of the JWT                                               |
| `REFRESH_TOKEN_TTL` | `30d`   | Lifetime of each refresh token; every refresh starts a new period |

Both accept a number of seconds or a number with `s`, `m`, `h` or `d`. An invalid value makes `login` fail with `Invalid duration`.

- `refreshSession(refreshToken)` needs no access token. It returns a new pair, and the presented refresh token stops working (rotation).
- All refresh tokens rotated from one login form a session (`familyId`). A refresh token that is presented a second time was copied, so the backend revokes the whole session: the copy and the token the legitimate client holds stop working. Two parallel exchanges of one token count as reuse too, so neither leaves a usable token.
- `logout(refreshToken)` revokes the session. It returns `true` for an unknown token as well, so it can be called again safely.
- Refresh tokens are stored in the `refresh_tokens` collection only as SHA-256 hashes, with the user, the session, the expiry, and the time a token was used or revoked. A TTL index removes a token once it expires.
- Each session has a document in `sessions` (its `_id` is the `familyId`). Its `revokedAt` is what rotation and revocation share: `logout` and reuse detection set it before anything else, and `refreshSession` checks it before the exchange and again after the next token is stored. A revocation that lands in between keeps that token from the client, and no token of a revoked session can be exchanged later. A TTL index removes the session after its newest token expires.
- JWTs issued before refresh tokens existed (valid for 7 days) keep working until they expire. A client that has no refresh token then signs in again.

### Desktop

- The desktop stores both tokens in `localStorage` (`auth_token`, `auth_refresh_token`) and clears them together.
- On an `UNAUTHENTICATED` error the session link (`desktop/src/graphql/sessionLink.ts`) refreshes the session and repeats the operation once with the new token. Requests that fail at the same time wait for the same refresh, because a refresh token can be exchanged only once. The repeated operation is not refreshed again, so there is no loop.
- Every sign-in and sign-out starts a new session generation (`tokenService.getGeneration()`); a refresh keeps it. The auth link records the generation and the access token on each operation. A refresh, its result (new tokens or an expired session) and the retry apply only while that generation is current, so a late answer cannot undo a sign-out or touch another account, and a new session never waits for the refresh of the previous one. A request that failed with an access token that was refreshed since is retried without another refresh.
- The refresh request is a plain `fetch` outside the Apollo links: it is never retried and never carries the expired access token. It sends the generated `RefreshSession` and `Logout` documents (`desktop/src/graphql/mutations/*.graphql`).
- When the refresh token is rejected (or missing), the desktop clears both tokens and the Apollo cache and opens the login page with the "session has ended" notice. When the backend cannot be reached, the user stays signed in and sees the usual network error.
- Signing out clears the tokens at once and then calls `logout`. Offline, the refresh token simply expires on the server.

The refresh token stays in `localStorage` rather than in Electron `safeStorage`. The renderer needs the token in plain text to call `refreshSession`, so code running in the renderer could read it either way. `safeStorage` would only encrypt it at rest, and on Linux without a keyring (including the WSL setup in [SETUP.md](../../SETUP.md)) it falls back to a fixed key. Rotation with reuse detection and server-side `logout` limit what a copied token can do.

## Where the service token comes from

Set the same value in every place. Any long random string works; do not keep the `change-me` value from the example files, because whoever knows the token can read and change every experiment.

| Component                                | Source of the token                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Backend                                  | `BACKEND_SERVICE_TOKEN` in `backend/.env`                                                         |
| Containers started by the backend        | `COMPUTE_BACKEND_TOKEN`, set by `LocalBackendComputationWorker`                                   |
| Optimization container                   | `backend_token` in the stdin payload, set by `OptimizationRunner`                                 |
| Desktop worker (`local` queue)           | `BACKEND_SERVICE_TOKEN` in the Electron main process: the shell, or `desktop/.env` in development |
| Containers started by the desktop worker | `COMPUTE_BACKEND_TOKEN`, set by `pythonRunner`                                                    |
| AWS Batch jobs                           | `COMPUTE_BACKEND_TOKEN` in the [job definition](../operations/aws-batch.md)                       |

## Desktop worker

The desktop worker uses the service token, not the JWT of the signed-in user. The worker runs in the Electron main process, which cannot read the `localStorage` of the renderer, and it has to keep reporting after the JWT expires or the user signs out. The operations it calls are worker operations in any case.

The token is read at runtime and is never bundled, so a packaged app does not contain it. Without the token the worker logs a warning and stays off, and `local` runs remain `queued`.

`claimExperimentRun` is not limited to one user: a worker takes the next queued run of any user. Give the service token only to machines you trust to run everyone's computations, and do not distribute it with the desktop app to end users.

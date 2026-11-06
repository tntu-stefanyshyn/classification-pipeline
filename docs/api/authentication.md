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

Resolvers authenticate the request (`AuthFlow.me` for user operations, `AuthFlow.authenticate` where the service token is also allowed) and pass the user id or the principal to `ExperimentAccess`. It holds the ownership rules and does not depend on HTTP.

## Errors

Every authentication failure has `extensions.code: "UNAUTHENTICATED"`. Clients decide on the code, not on the message, which is meant for people. Services throw the domain `AuthenticationError` (`modules/auth/classes`); the global resolver middleware `reportAuthenticationErrors` turns it into this code at the GraphQL boundary. The codes are in `modules/auth/constants/errorCodes.ts`.

- A request without a token gets `Not authenticated`.
- A worker operation called with anything other than the service token gets `Not authenticated`.
- An invalid or expired JWT gets the verification error, for example `jwt malformed` or `jwt expired`.
- A JWT without a user id gets `Invalid token payload`, and a JWT of a deleted user gets `User not found`.
- `refreshSession` with an unknown, expired, used or revoked refresh token gets `Session expired`.
- A `login` with an unknown email or a wrong password gets `Invalid credentials` with `extensions.code: "INVALID_CREDENTIALS"` (`InvalidCredentialsError`). It is not `UNAUTHENTICATED`: there is no session to refresh, and the form shows the message.
- A valid user who does not own the experiment or the pipeline gets the same "not found" error as for an id that does not exist, so the response does not reveal whether the id exists. The `experiment` query returns `null` in both cases. This error has no code: the session is fine.

## User sessions

`login` and `register` return two tokens: `token`, a JWT for the `Authorization` header, and `refreshToken`, an opaque string `<session id>.<random part>.<signature>`. The signature is an HMAC with `JWT_SECRET`, so the backend knows which session a token it issued belongs to even after the record of that token was removed.

| Variable            | Default | Meaning                                                           |
| ------------------- | ------- | ----------------------------------------------------------------- |
| `ACCESS_TOKEN_TTL`  | `15m`   | Lifetime of the JWT                                               |
| `REFRESH_TOKEN_TTL` | `30d`   | Lifetime of each refresh token; every refresh starts a new period |

Both accept a number of seconds or a number with `s`, `m`, `h` or `d`. An invalid value makes `login` fail with `Invalid duration`.

- `refreshSession(refreshToken, attemptId)` needs no access token. It returns a new pair, and the presented refresh token stops working (rotation).
- `attemptId` is optional and names the client's attempt to exchange that token. The next refresh token is derived from the presented token and the attempt id, so when the answer is lost after the backend rotated, the same attempt gets the same new refresh token again (as long as it was not used). Any other exchange of a used token is reuse. If the next token was never stored (the backend failed in between), the same attempt stores it.
- All refresh tokens rotated from one login form a session (`familyId`). A refresh token that is presented a second time was copied, so the backend revokes the whole session: the copy and the token the legitimate client holds stop working. Two parallel exchanges of one token with different (or no) attempt ids count as reuse too, so neither leaves a usable token; two of the same attempt get the same token.
- Reuse is detected for as long as the session is active, also after the copied token itself expired: a used token is reuse at any age, and a token whose record MongoDB already removed still names its session, which is revoked when it is still active. An unused token that expired only means the session ended. A token whose signature does not match is unknown and revokes nothing.
- `logout(refreshToken)` revokes the session. It returns `true` for an unknown token as well, so it can be called again safely. Any other answer, an error included, means the session may still be active.
- Refresh tokens are stored in the `refresh_tokens` collection only as SHA-256 hashes, with the user, the session, the expiry, the time a token was used or revoked, and the SHA-256 of the attempt id it was exchanged in. A TTL index removes a token once it expires.
- Each session has a document in `sessions` (its `_id` is the `familyId`). Its `revokedAt` is what rotation and revocation share: `logout` and reuse detection set it before anything else, and `refreshSession` checks it before the exchange and again after the next token is stored. A revocation that lands in between keeps that token from the client, and no token of a revoked session can be exchanged later. A TTL index removes the session after its newest token expires.
- JWTs issued before refresh tokens existed (valid for 7 days) keep working until they expire. A client that has no refresh token then signs in again.

### Desktop

- The desktop stores both tokens in `localStorage` (`auth_token`, `auth_refresh_token`) and clears them together. The attempt id of the current refresh token (`auth_refresh_attempt`) is kept there too, until the exchange succeeds, so a refresh repeated after a lost answer, even after a restart, is the same attempt.
- On an `UNAUTHENTICATED` error the session link (`desktop/src/graphql/sessionLink.ts`) refreshes the session and repeats the operation once with the new token. Requests that fail at the same time wait for the same refresh, because a refresh token can be exchanged only once. The repeated operation is not refreshed again, so there is no loop. An operation the caller unsubscribed from while the refresh was pending is not repeated.
- Every sign-in and sign-out starts a new session generation (`tokenService.getGeneration()`); a refresh keeps it. The auth link records the generation and the access token on each operation. A refresh, its result (new tokens or an expired session) and the retry apply only while that generation is current, so a late answer cannot undo a sign-out or touch another account, and a new session never waits for the refresh of the previous one. The retry keeps the generation of its first attempt, and the auth link (`createAuthLink`) checks it again right before it picks the access token: if the user signed out or in after the refresh succeeded, the retry is not sent and the operation ends with its original `UNAUTHENTICATED` error, so one account's request is never repeated with another account's token. A request that failed with an access token that was refreshed since is retried without another refresh.
- The refresh request is a plain `fetch` outside the Apollo links: it is never retried and never carries the expired access token. It sends the generated `RefreshSession` and `Logout` documents (`desktop/src/graphql/mutations/*.graphql`).
- When the refresh token is rejected (or missing), the desktop clears both tokens and the Apollo cache and opens the login page with the "session has ended" notice. When the backend cannot be reached, the user stays signed in and sees the usual network error: the failed refresh ends the operation with its network error (`ApolloError.networkError`), not with the `UNAUTHENTICATED` error that started the refresh. Every request waiting for that refresh gets the same error, and the next one tries the refresh again.
- Signing out clears the tokens at once and then calls `logout`. Until the backend answers `true`, the refresh token stays in `auth_pending_logouts` (it is used for nothing else) and the user sees that the server will end the session later. The desktop sends these logouts again at start and when the network comes back.

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

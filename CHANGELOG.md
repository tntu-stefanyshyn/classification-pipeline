# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Documentation is consolidated under `docs/` with an index and a language policy (English only).
- Documentation statements that no longer matched the code were corrected (pipeline statuses, experiment statuses, aws-jobs Docker images).
- The desktop worker for the `local` queue now requires `BACKEND_SERVICE_TOKEN` (`desktop/.env` or the shell).
- AWS Batch job definitions now require `COMPUTE_BACKEND_TOKEN`.

### Added

- `docs/index.md`, `docs/getting-started`, `docs/architecture`, `docs/domain`, `docs/api` and `docs/operations` sections.
- `docs/api/authentication.md` describes the user JWT and service token rules.
- Session refresh: `login` and `register` also return a `refreshToken`, and the new `refreshSession` and `logout` mutations rotate and revoke it. A reused refresh token ends the whole session, also after it expired; a refresh repeated with the same `attemptId` after a lost answer gets the same tokens instead. A failed `login` has the `INVALID_CREDENTIALS` code. The access token now lives `ACCESS_TOKEN_TTL` (15 minutes by default), the refresh token `REFRESH_TOKEN_TTL` (30 days).
- The desktop refreshes an expired session and repeats the request, and opens the login page with a notice only when the session cannot be refreshed. Signing out revokes the session on the server, and a sign-out the server did not confirm is sent again later.
- Authentication errors carry `extensions.code: "UNAUTHENTICATED"`.

### Security

- Run operations and the `pipeline` and `pipelines` queries are limited to the owner of the experiment.
- Worker operations require the service token.
- `completePipeline` in aws-jobs no longer prints the token to the logs.
- `signedUploadUrl` and `createUploadedFile` require a signed-in user. Upload keys are issued under the user (`uploads/<user id>/...`), and a file can be registered only on a key issued to the caller, once, so no record points at another user's dataset or has no owner.
- The PDF report (`GET /experiments/:experimentId/report`) requires the user JWT and is limited to the owner of the experiment; the desktop app downloads it with the token and refreshes an expired session first.
- CORS allows only the origins in `CORS_ORIGINS` (by default the desktop app), on GraphQL as well. The desktop dev server stays on port 5173, the allowed origin, and does not start when the port is busy.

### Fixed

- Runs on the `local` queue no longer fail with `Not authenticated`.
- Compute containers now send the token with every progress update and with the final result.
- Pipeline history entries written from worker progress updates now store the run status, so a query that selects `history { status }` no longer fails. The `pipeline-history-missing-status-to-running` migration fills in the status of existing entries at startup.

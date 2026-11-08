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
- MongoDB indexes for workflows (`instanceId` + `type`, `type` + `status`), uploaded files (`uploadedById` + `uploadedAt`) and experiments (`fileId`), so status reads, run claiming and file lists no longer scan whole collections. Existing databases get them on the next backend start; the workflow indexes build in the background and do not delay startup.
- Applied migrations are recorded in the `applied_migrations` collection, so each migration runs once.

### Security

- Run operations and the `pipeline` and `pipelines` queries are limited to the owner of the experiment.
- Worker operations require the service token.
- `completePipeline` in aws-jobs no longer prints the token to the logs.

### Fixed

- Runs on the `local` queue no longer fail with `Not authenticated`.
- Compute containers now send the token with every progress update and with the final result.
- Pipeline history entries written from worker progress updates now store the run status, so a query that selects `history { status }` no longer fails. The `pipeline-history-missing-status-to-running` migration fills in the status of existing entries at startup.

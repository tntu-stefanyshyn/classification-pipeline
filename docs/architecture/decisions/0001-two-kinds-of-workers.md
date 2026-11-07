# 0001: Two kinds of workers

Status: Accepted

## Context

Pipelines are CPU-heavy jobs. They can run on the user's own machine or on a server, and the server side can use AWS Batch or just Docker on the backend host.

## Decision

Every pipeline belongs to a queue, `local` or `cloud`, and workers claim only runs of their queue:

- The **desktop worker** (Electron main process) serves `local`. It runs the compute container on the user's machine, one running `local` run per machine.
- The **backend Docker worker** serves `cloud` without AWS, on the backend host (`BACKEND_LOCAL_WORKER_ENABLED`, default on).
- The **AWS Batch worker** serves `cloud` through AWS Batch (`BACKEND_CLOUD_WORKER_ENABLED`).

The graph settings (`queues`, `computationMode`) decide which queues a user may run an experiment on.

## Rationale

- **Confirmed:** the setup guide states that the local setup needs no AWS Batch, AWS CLI or host Python, so the backend Docker worker exists to run the `cloud` queue without AWS. The one-run-per-machine limit and the machine information (`hostname`, cores, memory, GPU) are recorded in the code for `local` runs.
- **Assumed:** the desktop worker lets users compute on their own hardware, and AWS Batch adds capacity for larger experiments. The original reasons are not recorded.

## Consequences

- If both `cloud` workers are enabled they compete for the same queue; the default setup turns AWS Batch off.
- The desktop worker needs the shared service token, which lets it claim runs of every user. See [Authentication](../../api/authentication.md).
- All three workers use the same claim operation and the same container image, so a run behaves the same wherever it executes.

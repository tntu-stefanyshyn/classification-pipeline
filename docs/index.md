# Documentation

Documentation for the Classification Pipeline project: a desktop application and a backend for
building and running classification experiments.

## Language policy

- English is the primary language of all documentation.
- Ukrainian translations of the user-facing pages live next to the English file with the suffix
  `.uk.md` (for example `README.uk.md`). Developer-only pages are English only.
- Keep technical terms in English in every language: experiment, graph, stage, path, pipeline, run, fold, queue.
- When you change an English page that has a Ukrainian translation, update the translation too.

## Where to find things

| Section                                   | Contents                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| [Getting started](getting-started/index.md) | Quick start and the full [setup guide](../SETUP.md) (WSL/Linux, Docker, S3).          |
| [Architecture](architecture/backend-structure.md) | Backend folder structure, database conventions, desktop component structure.   |
| [Domain](domain/experiments.md)           | Experiment and pipeline statuses, validations, graph rules, PDF report.               |
| [API](api/index.md)                       | GraphQL and REST endpoints, GraphQL usage in the desktop app.                         |
| [Operations](operations/ci.md)            | CI and the Windows installer, running computations in [AWS Batch](operations/aws-batch.md). |
| [aws-jobs](../aws-jobs/README.md)         | Python jobs and the Docker images used for computations.                              |

### All pages

- Getting started
  - [Getting started](getting-started/index.md)
  - [Setup guide](../SETUP.md) (stays in the repository root)
- Architecture
  - [Backend folder guidelines](architecture/backend-structure.md)
  - [Database conventions](architecture/database-conventions.md)
  - [Desktop component structure](architecture/desktop-components.md)
- Domain
  - [Experiments and computations](domain/experiments.md)
- API
  - [API overview and REST report](api/index.md)
  - [GraphQL in the desktop app](api/graphql-client.md)
- Operations
  - [Continuous integration](operations/ci.md)
  - [AWS Jobs (AWS Batch)](operations/aws-batch.md)
- Internal
  - [Implementation plans](internal/plans/2026-10-24-ci.md) (working notes, not user documentation)

The Mermaid sources of the data model are in [`backend/src/mermaid`](../backend/src/mermaid), and the
status diagrams are in
[`pipeline-statuses.mmd`](../backend/src/core/pipeline/pipeline-statuses.mmd) and
[`experiment-statuses.mmd`](../backend/src/modules/experiments/experiment-statuses.mmd).

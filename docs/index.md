# Documentation

Documentation for the Classification Pipeline project: a desktop application and a backend for
building and running classification experiments.

## Language policy

- All documentation is written in English: technical documentation, project rules and descriptions of how the application works.
- Ukrainian is used only for the translations displayed in the desktop app UI (`desktop/src/i18n/uk.ts`). Do not add Ukrainian copies of documentation pages.
- Use the terms defined in [Experiments and computations](domain/experiments.md#terms) (experiment, graph, stage, path, pipeline, run, queue, fold) consistently across all pages.
- Code identifiers, file names, commands and status values (`idle`, `queued`) are written as they appear in the code.

## Where to find things

| Section                                     | Contents                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [Getting started](getting-started/index.md) | Quick start and the full [setup guide](../SETUP.md) (WSL/Linux, Docker, S3).                           |
| [Architecture](architecture/overview.md)    | System overview, lifecycle, data model, run execution, decisions, known limitations, code conventions. |
| [Domain](domain/experiments.md)             | Experiment and pipeline statuses, validations, graph rules, PDF report.                                |
| [API](api/index.md)                         | GraphQL and REST endpoints, GraphQL usage in the desktop app.                                          |
| [Operations](operations/ci.md)              | CI and the Windows installer, running computations in [AWS Batch](operations/aws-batch.md).            |
| [aws-jobs](../aws-jobs/README.md)           | Python jobs and the Docker images used for computations.                                               |

### All pages

- Getting started
  - [Getting started](getting-started/index.md)
  - [Setup guide](../SETUP.md) (stays in the repository root)
- Architecture
  - [System overview](architecture/overview.md)
  - [Experiment and pipeline lifecycle](architecture/lifecycle.md)
  - [Data model](architecture/data-model.md)
  - [Run execution](architecture/run-execution.md)
  - [Architecture decision records](architecture/decisions/README.md)
  - [Known limitations](architecture/known-limitations.md)
  - [Backend folder guidelines](architecture/backend-structure.md)
  - [Database conventions](architecture/database-conventions.md)
  - [Desktop component structure](architecture/desktop-components.md)
- Domain
  - [Experiments and computations](domain/experiments.md)
- API
  - [API overview and REST report](api/index.md)
  - [Authentication](api/authentication.md)
  - [GraphQL in the desktop app](api/graphql-client.md)
- Operations
  - [Continuous integration](operations/ci.md)
  - [AWS Jobs (AWS Batch)](operations/aws-batch.md)
- Internal
  - [Implementation plans](internal/plans/2026-10-24-ci.md) (working notes, not user documentation)

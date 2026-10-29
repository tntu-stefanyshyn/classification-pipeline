English | [Українська](README.uk.md)

# Classification Pipeline

Desktop application and backend for building and running classification experiments.

## Documentation

Start with the [documentation index](docs/index.md). Documentation is written in English; Ukrainian
translations of user-facing pages use the `.uk.md` suffix (for example `README.uk.md`).

- [Setup guide](SETUP.md) - local setup for WSL/Linux, Docker computations, and S3 uploads.
- [Getting started](docs/getting-started/index.md)
- [Architecture](docs/architecture/backend-structure.md) - backend structure, database and desktop component conventions.
- [Experiments and computations](docs/domain/experiments.md) - statuses, validations and graph rules.
- [API](docs/api/index.md) - GraphQL and REST endpoints.
- [Continuous integration](docs/operations/ci.md) - automated checks and Windows x64 installer artifacts.
- [AWS Batch](docs/operations/aws-batch.md) - running computations in AWS.
- [aws-jobs](aws-jobs/README.md) - Python jobs and Docker images.

## Quick start

Use Node.js 24 and npm 11 or newer. The Node.js version is recorded in [`.nvmrc`](.nvmrc).

```bash
cp backend/.env.example backend/.env   # set JWT_SECRET, BACKEND_SERVICE_TOKEN and the S3 values
docker compose up -d                   # MongoDB, backend, compute images
npm install && npm run start:desktop   # Electron runs on the host
```

See the [setup guide](SETUP.md) for details (S3 CORS, WSL2, running the backend without Docker).
The desktop starts the local computation worker and prepares its Docker image automatically.

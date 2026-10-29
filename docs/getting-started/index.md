English | [Українська](index.uk.md)

# Getting started

## Quick start

Use the Node.js version recorded in [`.nvmrc`](../../.nvmrc) (Node.js 24) and npm 11 or newer.

```bash
cp backend/.env.example backend/.env   # set JWT_SECRET, BACKEND_SERVICE_TOKEN and the S3 values
docker compose up -d                   # MongoDB, backend, compute images
npm install && npm run start:desktop   # Electron runs on the host
```

## Next steps

- [Setup guide](../../SETUP.md): WSL 2 and Linux preparation, Docker, `backend/.env`, S3 CORS, starting the backend with or without Docker Compose, verification and troubleshooting.
- [Experiments and computations](../domain/experiments.md): what an experiment, a graph and a pipeline are, and which rules apply before a run.
- [Continuous integration](../operations/ci.md): the checks that run on every pull request and how to run them locally.
- [Documentation index](../index.md)

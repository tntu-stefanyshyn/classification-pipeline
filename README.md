# Classification Pipeline

Desktop application and backend for building and running classification experiments.

## Documentation

- [Continuous integration](docs/CI.md) - automated checks and Windows x64 installer artifacts.
- [Setup guide](SETUP.md) - local setup for WSL/Linux, Docker computations, and S3 uploads.
- [Backend documentation](backend/instructions/README.md)
- [Desktop documentation](desktop/instructions/README.md)
- [AWS jobs documentation](aws-jobs/README.md)

## Quick start

Use Node.js 24 and npm 11 or newer. The Node.js version is recorded in [`.nvmrc`](.nvmrc).

```bash
cp backend/.env.example backend/.env   # set JWT_SECRET, BACKEND_SERVICE_TOKEN and the S3 values
docker compose up -d                   # MongoDB, backend, compute images
npm install && npm run start:desktop   # Electron runs on the host
```

See the [setup guide](SETUP.md) for details (S3 CORS, WSL2, running the backend without Docker).
The desktop starts the local computation worker and prepares its Docker image automatically.

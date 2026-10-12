# Classification Pipeline

Desktop application and backend for building and running classification experiments.

## Documentation

- [Setup guide](SETUP.md) - local setup for WSL/Linux, Docker computations, and S3 uploads.
- [Backend documentation](backend/instructions/README.md)
- [Desktop documentation](desktop/instructions/README.md)
- [AWS jobs documentation](aws-jobs/README.md)

## Quick start

```bash
npm install
npm run start:backend
npm run start:desktop
```

Before starting, complete the [setup guide](SETUP.md), especially the `backend/.env` configuration.
Run the backend and desktop commands in separate terminals.
The desktop starts the local computation worker and prepares its Docker image automatically.

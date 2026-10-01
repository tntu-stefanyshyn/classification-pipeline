# Setup

Instructions for running Classification Pipeline locally.

## 1. Required tools

- [Git](https://git-scm.com/downloads)
- [NVM](https://github.com/nvm-sh/nvm) for installing and switching Node.js versions
- [Node.js 20+](https://nodejs.org/en/download) and npm 10+
- [MongoDB](https://www.mongodb.com/docs/manual/installation/) locally or [MongoDB Atlas](https://www.mongodb.com/atlas/database)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) for AWS jobs
- Python 3.10+ for running AWS jobs outside Docker: [python.org](https://www.python.org/downloads/)
- [AWS account](https://aws.amazon.com/premiumsupport/knowledge-center/create-and-activate-aws-account/) for S3 and AWS Batch

Check installed versions:

```bash
node --version
npm --version
python3 --version
aws --version
```

## 2. Install Node.js with NVM

Linux/macOS:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
```

On Windows, use [nvm-windows](https://github.com/coreybutler/nvm-windows).

Make sure the versions meet the project requirements:

```bash
node --version  # must be v20 or newer
npm --version   # must be v10 or newer
```

## 3. MongoDB

Choose one of the following options:

- local MongoDB at `mongodb://localhost:27017/app`;
- MongoDB Atlas: create a cluster and database user, then allow your IP address in Network Access.

An Atlas connection string looks like this:

```text
mongodb+srv://<username>:<password>@<cluster>.mongodb.net/app?retryWrites=true&w=majority
```

Do not commit real passwords or access keys to Git.

## 4. Clone the repository and install dependencies

```bash
git clone <repository-url>
cd classification-pipeline
npm install
```

`npm install` installs dependencies for `backend` and `desktop`, then generates GraphQL types for desktop.

## 5. Configure the backend

Create `backend/.env` from [`backend/.env.example`](backend/.env.example):

```bash
cp backend/.env.example backend/.env
```

Minimum configuration for local development:

```env
MONGODB_URI=mongodb://localhost:27017/app
JWT_SECRET=replace-with-a-long-random-secret
```

For MongoDB Atlas, replace `MONGODB_URI` with your Atlas connection string.

## 6. Configure AWS

An [AWS account](https://aws.amazon.com/) is required for object storage and cloud computations.

1. Install the [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html).
2. Create an IAM user or use AWS SSO according to your team's policies.
3. Configure credentials:

```bash
aws configure
aws sts get-caller-identity
```

4. Create an [S3 bucket](https://docs.aws.amazon.com/AmazonS3/latest/userguide/creating-bucket.html) in the required region.
5. For cloud computations, configure [AWS Batch](https://docs.aws.amazon.com/batch/latest/userguide/what-is-batch.html): a compute environment, job queue, and job definition.

Add the AWS values to `backend/.env`:

```env
AWS_S3_BUCKET=your-bucket
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_BATCH_JOB_QUEUE=your-batch-queue
AWS_BATCH_JOB_DEFINITION=your-job-definition
AWS_BATCH_JOB_NAME_PREFIX=experiment-run
AWS_COMPUTATION_RESULTS_BUCKET=your-results-bucket
AWS_COMPUTATION_RESULTS_PREFIX=computations
AWS_COMPUTATION_RESULTS_REGION=eu-central-1
```

For production, prefer IAM roles, AWS SSO, or another mechanism that avoids long-lived access keys.

## 7. Run the backend and desktop app

Start the backend in one terminal:

```bash
npm run start:backend
```

The GraphQL endpoint will be available at:

```text
http://localhost:4000/graphql
```

Start the desktop app in a second terminal:

```bash
npm run start:desktop
```

If the backend runs at another address, create `desktop/.env`:

```env
VITE_GRAPHQL_ENDPOINT=http://localhost:4000/graphql
```

## 8. Run AWS jobs with Docker

Create a root `.env` file read by `docker-compose.yml`:

```env
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=eu-central-1
```

Start the worker:

```bash
docker compose build aws-jobs
docker compose up -d aws-jobs
docker compose logs -f aws-jobs
```

Stop the worker:

```bash
docker compose down
```

See [`aws-jobs/README.md`](aws-jobs/README.md) for detailed Python worker notes.

## 9. Run AWS jobs without Docker

```bash
cd aws-jobs
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -e '.[dev]'
```

On Windows, activate the environment with `.venv\\Scripts\\activate`.

## 10. Verify the setup

```bash
npm run build:backend
npm run lint:desktop
```

If AWS is not configured, local computations can still run without S3 and AWS Batch. Cloud computations and file uploads require the corresponding AWS resources and environment variables.

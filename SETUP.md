# Minimal local setup: WSL and Linux

Run the backend, MongoDB, and desktop app locally, with AWS S3 for CSV uploads.
Computation and optimization use Docker containers on your machine. AWS Batch,
AWS CLI, a host Python installation, and a separate jobs service are not required.

## 1. Prepare WSL or Linux

On Windows, use WSL 2 with Ubuntu and WSLg for the Electron desktop window.
In administrator PowerShell, install WSL if needed:

```powershell
wsl --install -d Ubuntu-24.04
```

Restart Windows if prompted, then open Ubuntu and finish creating your Linux user.
For an existing WSL installation, run `wsl --update` and check `wsl --list --verbose`
to confirm the distribution uses version 2. GUI support requires Windows 11 or
Windows 10 build 19044+. See [Microsoft's WSL GUI guide](https://learn.microsoft.com/en-us/windows/wsl/tutorials/gui-apps).

On native Linux, use your normal desktop session. All remaining commands run in
the Linux terminal, including on WSL. Keep the repository in your Linux home
directory (for example, `~/projects/classification-pipeline`).

You need Git, curl, Node.js 24 with npm 11+, local MongoDB, and Docker. On Ubuntu:

```bash
sudo apt update
sudo apt install -y git curl
```

Install Node.js 24 with [NVM](https://github.com/nvm-sh/nvm/tree/v0.40.3), or use
your existing installation if it meets the requirements:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 24
nvm use 24
node --version
npm --version
```

Install MongoDB Community using the [official Ubuntu instructions](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-ubuntu/)
or the [instructions for your Linux distribution](https://www.mongodb.com/docs/manual/administration/install-on-linux/).
On a system with systemd, start it and check the connection:

```bash
sudo systemctl start mongod
mongosh --quiet --eval 'db.adminCommand({ ping: 1 })'
```

If systemd is unavailable in WSL, run MongoDB in a separate Linux terminal instead:

```bash
mkdir -p "$HOME/.local/share/classification-pipeline/mongodb"
mongod --dbpath "$HOME/.local/share/classification-pipeline/mongodb" --bind_ip 127.0.0.1 --port 27017
```

### Docker for local computations

On WSL, install and start [Docker Desktop for Windows](https://docs.docker.com/desktop/features/wsl/).
Use Linux containers, enable **Use WSL 2 based engine**, and enable your Ubuntu
distribution under **Settings → Resources → WSL Integration**.

On native Linux, install [Docker Engine](https://docs.docker.com/engine/install/ubuntu/)
and configure [Docker access without sudo](https://docs.docker.com/engine/install/linux-postinstall/),
since the app invokes Docker as your normal user.

Check from the same Linux terminal that will launch the app:

```bash
docker version
docker info
```

Both commands must connect to the Docker daemon without `sudo`. Python and its
computation dependencies are installed inside the job images.

## 2. Install project dependencies

Clone the repository if needed, then run from its root:

```bash
npm install
```

This installs both Node.js workspaces and generates the desktop GraphQL types.
Use the normal install command so Electron's installation scripts can run.

### Recommended development environment and VS Code extensions

Ubuntu 24.04 LTS with WSL 2 is the recommended Windows development environment,
matching the current workspace. Native Ubuntu 24.04 is also suitable for this
guide. Keep Node.js, dependencies, MongoDB, and project commands inside Linux.

On Windows, install VS Code on the Windows side and Microsoft's
[WSL extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-wsl).
From the repository root in your Linux terminal, open the entire project:

```bash
code .
```

Confirm that VS Code shows **WSL: Ubuntu** in the status bar. Install development
extensions in that WSL environment when VS Code offers **Install in WSL: Ubuntu**.
On native Linux, open the same repository root in your local VS Code installation.
See [VS Code's WSL guide](https://code.visualstudio.com/docs/remote/wsl).

These extensions are installed in the current development workspace and useful
for this project:

| Extension                                                                                                                                   | Recommendation                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) (`dbaeumer.vscode-eslint`)                             | Recommended for JavaScript and TypeScript diagnostics using the backend and desktop ESLint configurations. |
| [Prettier ESLint](https://marketplace.visualstudio.com/items?itemName=rvest.vs-code-prettier-eslint) (`rvest.vs-code-prettier-eslint`)      | Recommended for JavaScript and TypeScript formatting with the project's Prettier and ESLint rules.         |
| [GraphQL for VSCode](https://marketplace.visualstudio.com/items?itemName=kumar-harsh.graphql-for-vscode) (`kumar-harsh.graphql-for-vscode`) | Optional syntax highlighting for GraphQL queries, mutations, and schemas.                                  |
| [GitLens](https://marketplace.visualstudio.com/items?itemName=eamodio.gitlens) (`eamodio.gitlens`)                                          | Optional Git history and blame information while reviewing changes.                                        |

Use the repository's `.prettierrc`, `backend/.eslintrc.json`, and
`desktop/.eslintrc.json` rather than separate personal formatting rules. The
extensions are editor conveniences; they are not prerequisites for running the app.

## 3. Configure the backend and S3 uploads

Create `backend/.env` if it does not exist. If you already have one, update the
relevant values without overwriting other settings:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/app
JWT_SECRET=replace-with-a-long-random-secret

BACKEND_CLOUD_WORKER_ENABLED=false
BACKEND_LOCAL_WORKER_ENABLED=true
BACKEND_SERVICE_TOKEN=replace-with-a-long-random-string
BACKEND_GRAPHQL_URL=http://host.docker.internal:4000/graphql

AWS_S3_BUCKET=your-development-bucket
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

Set `AWS_REGION` to your bucket's actual region. Use a development bucket and
credentials with `s3:PutObject` access to `arn:aws:s3:::your-development-bucket/uploads/*`.
File downloads and deletion also require `s3:GetObject` and `s3:DeleteObject` on
that prefix. The backend generates [presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
using those credentials; the desktop uploads directly to S3. Keep credentials in
`backend/.env`, which is ignored by Git, and out of desktop configuration.

AWS Batch queues, job definitions, computation results buckets, and a root `.env`
are unnecessary for this setup.

Two workers execute runs. The backend's Docker worker
(`BACKEND_LOCAL_WORKER_ENABLED=true`, the default) consumes the `cloud` queue and
needs no AWS Batch; the desktop worker executes the `local` queue. Keep
`BACKEND_CLOUD_WORKER_ENABLED=false` unless you use AWS Batch (the code default is
`true`, so a missing value logs the "cloud worker disabled" warning at startup). The containers that
the backend starts authenticate with `BACKEND_SERVICE_TOKEN`; any long random string
works. The same values apply to the Compose and the manual start below (Compose sets
`MONGODB_URI` and `BACKEND_GRAPHQL_URL` itself).

### Allow uploads to the bucket from localhost

The developer or bucket administrator must configure the S3 bucket's CORS rules
to allow requests from localhost. In the S3 console, open your bucket, then
**Permissions → Cross-origin resource sharing (CORS) → Edit**. Add this rule to
the JSON array, preserving any existing rules:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3000
  }
]
```

The wildcard origin allows requests from any origin, including localhost on any
port. The rule permits all five HTTP methods supported by S3 CORS.

S3 handles the `OPTIONS` preflight automatically; do not add `OPTIONS` to
`AllowedMethods`. Keep the bucket private with Block Public Access enabled:
CORS allows the browser request, while IAM permissions authorize the upload.
See [AWS CORS configuration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html)
and [CORS rule fields](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html).

## 4. Start with Docker Compose (recommended)

With Docker running and `backend/.env` created from `backend/.env.example`
(local mode is the default; set `JWT_SECRET`, `BACKEND_SERVICE_TOKEN` and the S3 values), run from the root:

```bash
docker compose up -d
npm run start:desktop
```

Compose starts MongoDB (volume `mongo-data`), builds the `aws-jobs` and
`aws-jobs-optimization` images, and runs the backend on port 4000. The backend
mounts `/var/run/docker.sock` to start compute containers, which reach it via
`host.docker.internal` (mapped with `host-gateway`). MongoDB and the host
installation steps above are then unnecessary; the compose backend overrides
`MONGODB_URI`.

## 4b. Start manually (without Compose)

From the repository root, start the backend in one terminal:

```bash
npm run start:backend
```

The backend needs MongoDB (section 3) and the `aws-jobs` and `aws-jobs-optimization`
images. Build the images once (and after changes in `aws-jobs/`):

```bash
docker compose build aws-jobs aws-jobs-optimization
```

Start the desktop from the repository root in another Linux terminal:

```bash
npm run start:desktop
```

The desktop starts its local computation worker automatically and prepares the
`aws-jobs` Docker image, building it when missing (and rebuilding it on every start in
development; set `LOCAL_WORKER_REBUILD_IMAGE=false` to skip the rebuild). The worker polls the `local`
queue and executes runs submitted through the app while the desktop is open.
Remove any old `LOCAL_WORKER_ENABLED=false` override from your shell or launch
configuration. No separate worker launch or manual image build is needed.
The desktop uses `http://localhost:4000/graphql` by default, so no desktop `.env`
is needed. Do not launch the desktop with `sudo`.

The containers reach the backend at `http://host.docker.internal:4000/graphql`.
The existing runners add the `host-gateway` mapping for Linux Docker networking.
Keep the backend running while computations or optimization are active.

Stop each process with `Ctrl+C` in its terminal.

## 5. Check the setup

Check the backend while it is running:

```bash
curl -sS http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  --data '{"query":"{ health }"}'
```

Expect `{"data":{"health":"ok"}}`. In the desktop, register or sign in, then
upload a CSV from the Files page. Confirm that it appears in the file list and
under `uploads/` in the S3 bucket. The backend credentials also need `s3:GetObject`
on `uploads/*` so computations can download the dataset through a presigned URL.

To check a computation, create an experiment with the uploaded CSV, select `cloud`
(the backend's Docker worker) as the allowed queue, and include a classification
stage in every graph path. Start a run and inspect its status and the backend logs
(`docker compose logs -f backend` when using Compose). Runs on the `local` queue are
executed by the desktop worker, which does not send a token to its container yet;
see the troubleshooting entry below.

After all pipelines complete, optimization uses the local `aws-jobs-optimization`
image. The optimizer and the backend compute containers read the experiment and the
dataset with `BACKEND_SERVICE_TOKEN` from `backend/.env`. Set it to any long random
string and restart the backend.

## Troubleshooting

- **CORS upload error:** confirm the bucket has the CORS rule above saved, with
  `AllowedOrigins: ["*"]`, `PUT`, and `Content-Type` allowed.
- **S3 access denied:** check the bucket region and the backend credentials'
  `s3:PutObject` permission. CORS does not grant IAM access.
- **Docker unavailable or permission denied:** start Docker, check WSL integration
  or Linux user permissions, and confirm `docker info` works without `sudo`.
- **Local runs stay queued:** keep the desktop open, remove any
  `LOCAL_WORKER_ENABLED=false` override, and choose the `local` queue.
- **Run fails with `Not authenticated`:** for runs executed by the backend Docker
  worker (`cloud` queue), check that `BACKEND_SERVICE_TOKEN` is set in `backend/.env`
  and restart the backend. The desktop worker for the `local` queue starts its
  container without a token, so those runs can still fail this way (tracked
  separately); use the `cloud` queue meanwhile.
- **Optimization fails with `Not authenticated`:** set `BACKEND_SERVICE_TOKEN` and
  restart the backend.
- **Container cannot reach the backend:** check that the backend is listening on
  port 4000 and `BACKEND_GRAPHQL_URL` uses `host.docker.internal`.
- **Port 4000 already in use:** stop the existing server before launching another.
- **No desktop window on WSL:** confirm WSL 2 and WSLg are available using the
  [WSL GUI guide](https://learn.microsoft.com/en-us/windows/wsl/tutorials/gui-apps).
- **Electron reports a missing shared library:** install the corresponding Linux
  runtime package. Ubuntu 24.04 commonly needs `libnss3`, `libgtk-3-0t64`,
  `libgbm1`, and `libasound2t64`; Ubuntu 22.04 uses `libgtk-3-0` and `libasound2`
  for the latter GTK/audio package names.

# Continuous integration

[CI](../.github/workflows/ci.yml) runs on every pull request, every push to `main`, and manual dispatch from the repository's **Actions → CI → Run workflow** page.

| Check                 | What it verifies                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| Tests                 | One Docker container runs the lint, formatting and test steps below, with Node.js 24 and Python 3.11         |
| - Lint                | `npm run lint`: ESLint for the desktop app and the backend; errors fail the check, warnings do not           |
| - Formatting          | `npm run format:check`: Prettier check of the whole repository                                               |
| - Tests               | `npm test`: desktop, backend, and Python suites; the coverage table is published in the run summary          |
| GraphQL schema        | Regenerates `backend/schema.gql` and `desktop/schema.graphql`; fails if the committed files are stale        |
| Docker (backend)      | The backend image builds from the repository root                                                            |
| Docker (aws-jobs)     | The compute/optimization image builds                                                                        |
| Windows x64 installer | GraphQL code generation, production application bundles, and a Squirrel installer on a native Windows runner |
| CI passed             | All checks above succeeded; fails if any required job fails, is cancelled, or is skipped                     |

To require CI before merging, select **CI passed** as a required status check in the `main` branch protection rule or ruleset. The workflow does not change repository protection settings.

Dependabot proposes weekly updates for GitHub Actions, npm, Python (`aws-jobs`), Dockerfiles and `docker-compose.yml` ([configuration](../.github/dependabot.yml)). Review code owners are set in [CODEOWNERS](../.github/CODEOWNERS).

## Download the Windows installer

Open a successful **Actions → CI** run and download the **desktop-windows-x64** artifact. Unzip it and run the `Setup.exe` installer. Artifacts include the Squirrel update packages and are retained for 14 days. These builds are unsigned.

The desktop application uses `http://localhost:4000/graphql` by default. Start the backend with the existing setup instructions before using it.

This workflow does not create GitHub releases, publish container images to ECR, or deploy the backend.

## Local checks

From the repository root:

Run the complete CI test suite in the same container used by GitHub Actions:

```bash
docker build -f Dockerfile.ci -t classification-tests:ci .
docker run --rm classification-tests:ci
```

Run the lint and formatting checks of CI in the same container:

```bash
docker run --rm classification-tests:ci npm run lint
docker run --rm classification-tests:ci npm run format:check
```

To run the same test command directly on your machine:

```bash
nvm install
nvm use
npm ci
python3 -m venv aws-jobs/.venv
source aws-jobs/.venv/bin/activate
python -m pip install -e 'aws-jobs[dev]'
npm run lint
npm run format:check
npm test
docker build -f backend/Dockerfile -t backend:ci .
docker build -f aws-jobs/Dockerfile -t aws-jobs:ci aws-jobs
```

On Windows, generate the installer with:

```powershell
npm ci
npm run make --workspace desktop -- --platform win32 --arch x64
```

### Formatting

`npm run format:check` fails when a file is not formatted by Prettier; `npx prettier --write <file>` fixes it. Existing line endings are kept (`endOfLine: auto`), so Windows checkouts with CRLF pass too. To format staged files automatically on every commit, enable the repository hook once:

```bash
git config core.hooksPath .githooks
```

### GraphQL schema

`backend/schema.gql` is generated from the backend resolvers and copied to `desktop/schema.graphql`; both are tracked and must stay byte-identical. After changing a resolver, input or type, run:

```bash
npm run emit:schema --workspace backend
npm run sync:schema --workspace desktop
```

and commit both files. The schema is built without starting the server or connecting to MongoDB. They are excluded from Prettier because they are generated.

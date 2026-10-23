# Continuous integration

[CI](../.github/workflows/ci.yml) runs on every pull request, every push to `main`, and manual dispatch from the repository's **Actions → CI → Run workflow** page.

| Check                 | What it verifies                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| Tests (backend)       | TypeScript compilation and all backend tests on Node.js 22                                                   |
| Tests (desktop)       | Portable codegen cleanup and all desktop tests on Node.js 22                                                 |
| Tests (aws-jobs)      | All Python tests on Python 3.11                                                                              |
| Docker (backend)      | The backend image builds from the repository root                                                            |
| Docker (aws-jobs)     | The compute/optimization image builds                                                                        |
| Windows x64 installer | GraphQL code generation, production application bundles, and a Squirrel installer on a native Windows runner |
| CI passed             | All checks above succeeded; fails if any required job fails, is cancelled, or is skipped                     |

To require CI before merging, select **CI passed** as a required status check in the `main` branch protection rule or ruleset. The workflow does not change repository protection settings.

## Download the Windows installer

Open a successful **Actions → CI** run and download the **desktop-windows-x64** artifact. Unzip it and run the `Setup.exe` installer. Artifacts include the Squirrel update packages and are retained for 14 days. These builds are unsigned.

The desktop application uses `http://localhost:4000/graphql` by default. Start the backend with the existing setup instructions before using it.

This workflow does not create GitHub releases, publish container images to ECR, or deploy the backend.

## Local checks

From the repository root:

```bash
npm ci
npm run test:desktop
npm run test --workspace backend
python3 -m venv aws-jobs/.venv
aws-jobs/.venv/bin/python -m pip install -e 'aws-jobs[dev]'
aws-jobs/.venv/bin/python -m pytest aws-jobs/tests
docker build -f backend/Dockerfile -t backend:ci .
docker build -f aws-jobs/Dockerfile -t aws-jobs:ci aws-jobs
```

On Windows, generate the installer with:

```powershell
npm ci
npm run make --workspace desktop -- --platform win32 --arch x64
```

`npm run lint:desktop` currently reports existing formatting, declaration-file, generated-code, and test-fixture errors. It remains a separate local check until those are addressed; CI does not suppress its failures or treat it as a passing check.

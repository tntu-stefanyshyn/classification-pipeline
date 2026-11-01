# aws-jobs

Python workspace with the machine-learning jobs for classification experiments. It contains the
compute handler (one pipeline run) and the optimization handler (one experiment), and runs inside the
Docker images that the backend and the desktop app start.

## Docker images

`aws-jobs/Dockerfile` builds one image (Python 3.11) that serves both handlers. The root
`docker-compose.yml` builds it twice under two names and exits immediately (`entrypoint: ["true"]`),
because the backend starts the containers itself through the Docker socket:

| Image                   | Used for                                                |
| ----------------------- | ------------------------------------------------------- |
| `aws-jobs`              | Compute runs (the desktop and backend Docker workers)   |
| `aws-jobs-optimization` | Experiment optimization (`OptimizationRunner`)          |

Build both images from the repository root (and again after changing `aws-jobs/`):

```bash
docker compose build aws-jobs aws-jobs-optimization
```

`docker compose up -d` builds them as a part of the full stack (MongoDB, backend and the images).
Compose does not run a long-lived `aws-jobs` service and does not mount `aws-jobs/` into a container,
so code changes require rebuilding the images.

## Local development

1. Create a virtual environment in the `aws-jobs` directory, for example `python -m venv .venv && source .venv/bin/activate`.
2. Install the dependencies: `pip install -e .[dev]`.
3. Run the tests from the repository root: `npm run test:aws-jobs`.
4. Use `aws_jobs.classification_job.TabularClassifier` to train a model.

### Example

```python
import pandas as pd
from pathlib import Path
from aws_jobs.classification_job import ClassificationJobConfig, TabularClassifier

df = pd.read_csv("data.csv")
cfg = ClassificationJobConfig(target_column="label", output_dir=Path("artifacts"))
report = TabularClassifier(cfg).train(df)
print(report)
```

## Deploy to AWS

For the ECR upload steps and the AWS Batch job definitions for the compute and optimization
handlers, see [AWS Jobs (AWS Batch)](../docs/operations/aws-batch.md).

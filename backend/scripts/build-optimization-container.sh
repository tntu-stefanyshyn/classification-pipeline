#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
AWS_JOBS_DIR="${REPO_ROOT}/../aws-jobs"
IMAGE_NAME="${OPTIMIZATION_DOCKER_IMAGE:-aws-jobs-optimization}"

if [[ "${SKIP_OPTIMIZATION_BUILD:-}" == "1" ]]; then
  echo "Skipping optimization container build (SKIP_OPTIMIZATION_BUILD=1)"
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to build the optimization image" >&2
  exit 1
fi

if [[ ! -d "${AWS_JOBS_DIR}" ]]; then
  echo "aws-jobs directory not found at ${AWS_JOBS_DIR}" >&2
  exit 1
fi

echo "Building optimization container image '${IMAGE_NAME}' from ${AWS_JOBS_DIR}..."
docker build -t "${IMAGE_NAME}" "${AWS_JOBS_DIR}"

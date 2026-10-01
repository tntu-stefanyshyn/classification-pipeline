#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
AWS_JOBS_DIR="${REPO_ROOT}/../aws-jobs"
IMAGE_NAME="${OPTIMIZATION_DOCKER_IMAGE:-aws-jobs-optimization}"

if [[ "${SKIP_OPTIMIZATION_BUILD:-}" == "1" ]]; then
  echo "Пропускаємо збірку контейнера оптимізації (SKIP_OPTIMIZATION_BUILD=1)"
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Для збірки образу оптимізації потрібен Docker" >&2
  exit 1
fi

if [[ ! -d "${AWS_JOBS_DIR}" ]]; then
  echo "Директорію aws-jobs не знайдено: ${AWS_JOBS_DIR}" >&2
  exit 1
fi

echo "Збираємо образ контейнера оптимізації '${IMAGE_NAME}' з ${AWS_JOBS_DIR}..."
docker build -t "${IMAGE_NAME}" "${AWS_JOBS_DIR}"

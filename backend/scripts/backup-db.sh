#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_DIR="${BACKEND_DIR}/backups/db"
ENV_FILE="${BACKEND_DIR}/.env"

read_mongo_uri_from_env_file() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    return
  fi

  local raw
  raw="$(grep -E '^MONGODB_URI=' "${ENV_FILE}" | tail -n 1 || true)"
  if [[ -z "${raw}" ]]; then
    return
  fi

  raw="${raw#MONGODB_URI=}"
  raw="${raw%\"}"
  raw="${raw#\"}"
  raw="${raw%\'}"
  raw="${raw#\'}"
  echo "${raw}"
}

MONGO_URI="${MONGODB_URI:-}"
if [[ -z "${MONGO_URI}" ]]; then
  MONGO_URI="$(read_mongo_uri_from_env_file)"
fi

if [[ -z "${MONGO_URI}" ]]; then
  echo "MONGODB_URI не задано. Вкажи env-перемінну або backend/.env" >&2
  exit 1
fi

if ! command -v mongodump >/dev/null 2>&1; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "Команда mongodump не знайдена, і Docker також недоступний." >&2
    echo "Встанови MongoDB Database Tools або Docker." >&2
    exit 1
  fi
fi

REQUESTED_NAME="${1:-$(date +%Y%m%d-%H%M%S)}"
SAFE_NAME="$(
  echo "${REQUESTED_NAME}" \
    | tr -cs '[:alnum:]_.-' '-' \
    | sed -E 's/-+/-/g; s/^-+//; s/-+$//'
)"
if [[ -z "${SAFE_NAME}" ]]; then
  SAFE_NAME="$(date +%Y%m%d-%H%M%S)"
fi
ARCHIVE_PATH="${BACKUP_DIR}/${SAFE_NAME}.archive.gz"

mkdir -p "${BACKUP_DIR}"

if [[ -f "${ARCHIVE_PATH}" ]]; then
  echo "Бекап вже існує: ${ARCHIVE_PATH}" >&2
  exit 1
fi

echo "Створюю бекап БД у ${ARCHIVE_PATH}"
if command -v mongodump >/dev/null 2>&1; then
  mongodump --uri="${MONGO_URI}" --archive="${ARCHIVE_PATH}" --gzip
else
  if [[ "${MONGO_URI}" == *"localhost"* || "${MONGO_URI}" == *"127.0.0.1"* ]]; then
    if [[ "$(uname -s)" == "Linux" ]]; then
      docker run --rm \
        --network host \
        -e MONGO_URI="${MONGO_URI}" \
        -v "${BACKUP_DIR}:/backup" \
        mongodb/mongodb-database-tools:100.13.0 \
        sh -lc "mongodump --uri=\"\$MONGO_URI\" --archive=\"/backup/${SAFE_NAME}.archive.gz\" --gzip"
    else
      echo "Локальний MongoDB URI з localhost у Docker може бути недоступний на цій ОС." >&2
      echo "Або встанови MongoDB Database Tools, або використовуй URI з host.docker.internal." >&2
      exit 1
    fi
  else
    docker run --rm \
      -e MONGO_URI="${MONGO_URI}" \
      -v "${BACKUP_DIR}:/backup" \
      mongodb/mongodb-database-tools:100.13.0 \
      sh -lc "mongodump --uri=\"\$MONGO_URI\" --archive=\"/backup/${SAFE_NAME}.archive.gz\" --gzip"
  fi
fi
echo "Готово: ${ARCHIVE_PATH}"

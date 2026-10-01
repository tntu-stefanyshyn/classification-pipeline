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

if ! command -v mongorestore >/dev/null 2>&1; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "Команда mongorestore не знайдена, і Docker також недоступний." >&2
    echo "Встанови MongoDB Database Tools або Docker." >&2
    exit 1
  fi
fi

INPUT_NAME="${1:-}"
if [[ -z "${INPUT_NAME}" ]]; then
  echo "Вкажи ім'я бекапу або шлях до файлу." >&2
  echo "Приклад: npm run db:restore -- pre-release" >&2
  exit 1
fi

ARCHIVE_PATH=""
NORMALIZED_INPUT_NAME="$(
  echo "${INPUT_NAME}" \
    | tr -cs '[:alnum:]_.-/' '-' \
    | sed -E 's/-+/-/g; s/^-+//; s/-+$//'
)"
if [[ -f "${INPUT_NAME}" ]]; then
  ARCHIVE_PATH="${INPUT_NAME}"
elif [[ -f "${BACKUP_DIR}/${INPUT_NAME}" ]]; then
  ARCHIVE_PATH="${BACKUP_DIR}/${INPUT_NAME}"
elif [[ -f "${BACKUP_DIR}/${INPUT_NAME}.archive.gz" ]]; then
  ARCHIVE_PATH="${BACKUP_DIR}/${INPUT_NAME}.archive.gz"
elif [[ -n "${NORMALIZED_INPUT_NAME}" && -f "${BACKUP_DIR}/${NORMALIZED_INPUT_NAME}.archive.gz" ]]; then
  ARCHIVE_PATH="${BACKUP_DIR}/${NORMALIZED_INPUT_NAME}.archive.gz"
elif [[ -n "${NORMALIZED_INPUT_NAME}" && -f "${BACKUP_DIR}/${NORMALIZED_INPUT_NAME}-.archive.gz" ]]; then
  ARCHIVE_PATH="${BACKUP_DIR}/${NORMALIZED_INPUT_NAME}-.archive.gz"
fi

if [[ -z "${ARCHIVE_PATH}" ]]; then
  echo "Бекап не знайдено: ${INPUT_NAME}" >&2
  echo "Шукав у ${BACKUP_DIR}" >&2
  if compgen -G "${BACKUP_DIR}/*.archive.gz" >/dev/null; then
    echo "Доступні бекапи:" >&2
    ls -1 "${BACKUP_DIR}"/*.archive.gz >&2
  fi
  exit 1
fi

echo "Відновлюю БД з ${ARCHIVE_PATH}"
if command -v mongorestore >/dev/null 2>&1; then
  mongorestore --uri="${MONGO_URI}" --archive="${ARCHIVE_PATH}" --gzip --drop
else
  ARCHIVE_DIR="$(cd "$(dirname "${ARCHIVE_PATH}")" && pwd)"
  ARCHIVE_FILE="$(basename "${ARCHIVE_PATH}")"
  if [[ "${MONGO_URI}" == *"localhost"* || "${MONGO_URI}" == *"127.0.0.1"* ]]; then
    if [[ "$(uname -s)" == "Linux" ]]; then
      docker run --rm \
        --network host \
        -e MONGO_URI="${MONGO_URI}" \
        -v "${ARCHIVE_DIR}:/restore" \
        mongodb/mongodb-database-tools:100.13.0 \
        sh -lc "mongorestore --uri=\"\$MONGO_URI\" --archive=\"/restore/${ARCHIVE_FILE}\" --gzip --drop"
    else
      echo "Локальний MongoDB URI з localhost у Docker може бути недоступний на цій ОС." >&2
      echo "Або встанови MongoDB Database Tools, або використовуй URI з host.docker.internal." >&2
      exit 1
    fi
  else
    docker run --rm \
      -e MONGO_URI="${MONGO_URI}" \
      -v "${ARCHIVE_DIR}:/restore" \
      mongodb/mongodb-database-tools:100.13.0 \
      sh -lc "mongorestore --uri=\"\$MONGO_URI\" --archive=\"/restore/${ARCHIVE_FILE}\" --gzip --drop"
  fi
fi
echo "Відновлення завершено."

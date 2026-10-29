[English](README.md) | Українська

# Classification Pipeline

Десктопний застосунок і бекенд для створення та запуску експериментів з класифікації.

## Документація

Почніть з [індексу документації](docs/index.uk.md). Документація написана англійською; українські
переклади користувацьких сторінок мають суфікс `.uk.md` (наприклад, `README.uk.md`).

- [Посібник з налаштування](SETUP.uk.md) — локальне налаштування для WSL/Linux, обчислення в Docker і завантаження в S3.
- [Початок роботи](docs/getting-started/index.uk.md)
- [Архітектура](docs/architecture/backend-structure.md) (англійською) — структура бекенду, правила роботи з базою даних і структура компонентів десктопу.
- [Експерименти та обчислення](docs/domain/experiments.uk.md) — статуси, перевірки та правила графа.
- [API](docs/api/index.md) (англійською) — ендпоінти GraphQL і REST.
- [Безперервна інтеграція (CI)](docs/operations/ci.md) (англійською) — автоматичні перевірки та інсталятор для Windows x64.
- [AWS Batch](docs/operations/aws-batch.md) (англійською) — запуск обчислень в AWS.
- [aws-jobs](aws-jobs/README.md) (англійською) — Python-завдання та Docker-образи.

## Швидкий старт

Потрібні Node.js 24 і npm 11 або новіший. Версію Node.js записано у файлі [`.nvmrc`](.nvmrc).

```bash
cp backend/.env.example backend/.env   # вкажіть JWT_SECRET, BACKEND_SERVICE_TOKEN і значення для S3
docker compose up -d                   # MongoDB, бекенд, образи для обчислень
npm install && npm run start:desktop   # Electron запускається на хості
```

Подробиці (CORS для S3, WSL2, запуск бекенду без Docker) дивіться в [посібнику з налаштування](SETUP.uk.md).
Десктопний застосунок сам запускає локальний виконавець (worker) обчислень і готує його Docker-образ.

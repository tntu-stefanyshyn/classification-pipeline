[English](index.md) | Українська

# Початок роботи

## Швидкий старт

Використовуйте версію Node.js, записану у [`.nvmrc`](../../.nvmrc) (Node.js 24), і npm 11 або новіший.

```bash
cp backend/.env.example backend/.env   # вкажіть JWT_SECRET, BACKEND_SERVICE_TOKEN і значення для S3
docker compose up -d                   # MongoDB, бекенд, образи для обчислень
npm install && npm run start:desktop   # Electron запускається на хості
```

## Наступні кроки

- [Посібник з налаштування](../../SETUP.uk.md): підготовка WSL 2 і Linux, Docker, `backend/.env`, CORS для S3, запуск бекенду з Docker Compose і без нього, перевірка та усунення несправностей.
- [Експерименти та обчислення](../domain/experiments.uk.md): що таке експеримент, граф і конвеєр та які правила діють перед запуском.
- [Безперервна інтеграція (CI)](../operations/ci.md) (англійською): перевірки, що виконуються для кожного pull request, і як запустити їх локально.
- [Індекс документації](../index.uk.md)

# Правила для GraphQL у десктопі

- Використовуй лише згенеровані хуки/документи (`src/graphql/**/generated/*`). Не прописуй `gql` інлайном у компонентах.
- Якщо потрібна нова квері/мутація і її немає у generated, створи `.graphql` файл у відповідній папці (`src/graphql/queries` або `src/graphql/mutations`). Потім запусти `npm run codegen --workspace desktop` (він сам підтягне схему з бекенду).
- Схема на десктопі синхронізується з бекенду через `npm run sync:schema --workspace desktop` (автоматично входить у `codegen`).
- У компонентах імпортуй лише `useXYZQuery`/`useXYZMutation` з `generated` та працюй через них.
- Використовуй `_id` для ідентифікаторів у запитах/мутаціях та моделях, не `id`.

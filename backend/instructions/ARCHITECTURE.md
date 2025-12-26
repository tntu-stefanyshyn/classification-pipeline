# Backend Folder Guidelines

Use this structure for new code:

- `core/`: shared domain parts (e.g., `user`).
  - `classes/`: domain entities, DTOs.
  - `models/`: persistence models (e.g., Typegoose/Mongoose).
  - `constants/`, `enums/`: shared domain-level constants/enums when needed.
  - `services/`: shared domain services (business logic without transport concerns).
  - `graphql/`: GraphQL resolvers that belong to core (if any).
- `modules/<feature>/`: feature-scoped code (e.g., `auth`).
  - `classes/`: DTOs/payloads used by the feature.
  - `models/`: feature-specific DB models.
  - `services/`: business logic for the feature (no HTTP/GraphQL wiring).
  - `constants/`: feature-specific constants.
  - `enums/`: feature-specific enums.
  - `graphql/`: GraphQL resolvers for the feature.
- `graphql/`: app-level resolvers not tied to a feature (e.g., health, server info).
- `config/`: configuration only.
- `index.ts`: bootstrap; wire schema, server, DB.

Rules:

- Classes live in `classes/`, DB models in `models/`, resolvers in `graphql/`.
- Keep services transport-agnostic; resolvers call services.
- Put constants/enums in their dedicated folders; re-export via an `index.ts` when useful.
- Avoid committing built `.js` in `src/`; TypeScript is the source of truth.
- Use `_id` for identifiers across DB/models/GraphQL; avoid `id` fields.

# Backend folder guidelines

Use this structure for new code in `backend/src`:

- `core/`: shared domain parts (`user`, `pipeline`, `workflow`).
  - `classes/`: domain entities, DTOs.
  - `models/`: persistence models (Typegoose/Mongoose).
  - `constants/`, `enums/`: shared domain-level constants and enums when needed.
  - `services/`: shared domain services (business logic without transport concerns).
  - `graphql/`: GraphQL resolvers that belong to core (if any).
- `modules/<feature>/`: feature-scoped code (`auth`, `computations`, `experiments`, `files`, `storage`, `technologies`).
  - `classes/`: DTOs and payloads used by the feature.
  - `models/`: feature-specific DB models.
  - `services/`: business logic for the feature (no HTTP/GraphQL wiring).
  - `constants/`: feature-specific constants.
  - `enums/`: feature-specific enums.
  - `graphql/`: GraphQL resolvers for the feature.
  - `utils/`: feature-specific helpers (for example `buildGraphPaths`).
- `graphql/`: app-level resolvers not tied to a feature (`health`, server info).
- `config/`: configuration only.
- `migrations/`: one-off data migrations that run at startup.
- `seeders/`: initial data (for example the technology catalog).
- `mermaid/`: entity-relationship diagrams of the data model (Mermaid sources).
- `types/`, `utils/`, `test/`: shared TypeScript types, helpers and test utilities.
- `index.ts`: bootstrap; wires schema, server, DB and the REST report endpoint.

Rules:

- Classes live in `classes/`, DB models in `models/`, resolvers in `graphql/`.
- Keep services transport-agnostic; resolvers call services.
- Put constants and enums in their dedicated folders; re-export them via an `index.ts` when useful.
- Do not commit built `.js` files in `src/`; TypeScript is the source of truth.
- Use `_id` for identifiers across DB, models and GraphQL; avoid `id` fields.
- See [Database conventions](database-conventions.md) for Mongoose rules.

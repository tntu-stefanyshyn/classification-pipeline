# Database conventions (Mongoose)

Rules for new backend code:

- Do not call `.exec()` on Mongoose queries; `await` the query directly.
- Call `lean()` without generic type arguments (for example, not `lean<UploadedFile>()`).
- Always pass `{ getters: true }` to `toObject`: `doc.toObject({ getters: true })`.

Some older code still calls `.exec()` (in `PipelineManager`, `GraphManager` and a migration).
Do not copy that pattern into new code; clean it up when you touch those files.

## Indexes

Declare indexes on the class with `@index(...)` (or `index: true` on a `@prop`), next to a one-line
comment naming the query that needs it. Mongoose creates missing indexes on every backend start
(`autoIndex`); there is no separate step for existing databases, including production.

- MongoDB 7 builds an index in the background: reads and writes continue while it builds. The
  backend must not wait for a build on a large collection either, so startup waits for nothing
  except what correctness needs:
  - `WorkflowModel.init()` in `index.ts` waits for every index declared on `Workflow`. Declare
    there only the unique per-machine index (the one-local-run-per-machine rule depends on it).
  - The workflow read indexes live in `createWorkflowReadIndexes` (`WorkflowModel.ts`), which
    `index.ts` starts without awaiting; until a build finishes, queries just scan. A failure is
    logged and does not stop the backend.
  - Indexes declared on other classes are built by Mongoose in the background and not awaited.
- Prefer non-unique indexes unless the code relies on uniqueness. A unique index that cannot be
  built (duplicates already stored) makes `WorkflowModel.init()` fail and stops the backend.
- Removing or changing an index in a class does not drop the old one in the database; drop it by
  hand (`db.<collection>.dropIndex(...)`) or in a migration.
- Check a new query with `explain('executionStats')`: a `COLLSCAN` with `totalDocsExamined` close to
  the collection size means an index is missing. Tests that need a real database read
  `MONGODB_TEST_URI` and call `Model.createIndexes()` themselves (Mongoose builds indexes once per
  process).

Current indexes added for reads: `workflows` (`instanceId`, `type`) and (`type`, `status`);
`uploaded_files` (`uploadedById`, `uploadedAt`); `experiments` (`fileId`).

## Migrations

A migration is a `{ name, run }` object in `backend/src/migrations`, added to the list in
`migrations/index.ts`. `run` returns the number of changed documents.

- `runMigrations` runs at startup, after the database connects. It first creates the unique index
  on `applied_migrations.name` (so backends starting together cannot record a name twice), then
  skips every migration whose `name` is already in the collection. After a successful run the name and `appliedAt` are
  stored, so a migration that throws runs again on the next start.
- Never rename a migration that has shipped: the new name would run again.
- Still write each migration to change nothing on a second run. It can run twice when two backends
  start together or when the backend stops between `run` and the record.
- Use a raw collection or `updateMany` with a filter that matches only unmigrated documents, and
  cover it with a `*.mongo.test.ts` test (see `PipelineHistoryStatus.mongo.test.ts`).
- Databases created before the registry existed have an empty `applied_migrations`: every listed
  migration runs once on the first start, finds nothing to change, and is recorded.

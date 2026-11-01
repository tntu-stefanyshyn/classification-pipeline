# Database conventions (Mongoose)

Rules for new backend code:

- Do not call `.exec()` on Mongoose queries; `await` the query directly.
- Call `lean()` without generic type arguments (for example, not `lean<UploadedFile>()`).
- Always pass `{ getters: true }` to `toObject`: `doc.toObject({ getters: true })`.

Some older code still calls `.exec()` (in `PipelineManager`, `GraphManager` and a migration).
Do not copy that pattern into new code; clean it up when you touch those files.

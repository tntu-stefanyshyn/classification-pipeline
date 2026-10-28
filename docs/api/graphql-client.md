# GraphQL in the desktop app

- Use only generated hooks and documents (`src/graphql/**/generated/*`). Do not write inline `gql` in components.
- If you need a new query or mutation that is not generated yet, create a `.graphql` file in the matching folder (`src/graphql/queries` or `src/graphql/mutations`), then run `npm run codegen --workspace desktop`. Codegen pulls the schema from the backend automatically.
- The desktop schema is synchronized from the backend with `npm run sync:schema --workspace desktop`, which is part of `codegen`.
- In components import only `useXYZQuery` and `useXYZMutation` from `generated` and work through them.
- Use `_id` for identifiers in queries, mutations and models, not `id`.
- For new run actions (for example `stopExperimentRun`) add a separate `.graphql` file and update the generated types.
- The root `npm install` runs codegen in its `postinstall` step, so the generated files exist after installation.

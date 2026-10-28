# Desktop component structure

## Basic rules

- Every component lives in its own folder named after the component.
- The component file has the same name as the component (`SomeComponent.tsx`).
- The component folder has an `index.ts` that re-exports the component and any types or utilities needed outside.
- The component file contains only the component itself: no types, helpers or constants.
- Keep component types in `SomeComponent.types.ts`.
- Keep helper functions in a `utils/` folder.
- Keep constants in a `constants/` folder.
- Keep hooks in a `hooks/` folder.
- If a component is split into subcomponents, put them in a `components/` folder and follow the same structure for each.
- If a component uses GraphQL, add a `graphql/` folder for local re-exports and wrappers over the generated code.
- If something is repeated in several places, extract it into a shared component, utility or constant instead of duplicating it.
- For inputs (input, textarea, checkbox, file) use the components from `src/components/inputs`.

## Component exports

- Export components only as `default`:
  `const SomeComponent: FC<SomeComponentProps> = (...) => ...; export default SomeComponent;`
- Always re-export in `index.ts`:
  `export { default as SomeComponent } from './SomeComponent';`
- Also re-export the types and utilities needed outside (for example `export type { SomeComponentProps } ...`).
- Do not use `export const SomeComponent` or `export function SomeComponent` for components.
- If `FC` does not fit (generic components or `forwardRef`), keep `const` with a `default export` and type the parameters explicitly.

## Where to create components

- `src/components/`: all reusable components, grouped by purpose (`inputs/`, `layout/`, `auth/`, `ui/`, and so on).
- `src/pages/`: simple page wrappers only (usually one file), without logic.
- `src/components/pages/`: "smart" page components with logic (GraphQL, state, mutations). Pages in `src/pages/` are thin wrappers around them.

## Pages rule

- Files in `src/pages/**` must stay as simple as possible: no hooks, business logic or complex calculations.
- Pages only render a component from `src/components/pages/**` and pass props.

## Example structure

```
SomeComponent/
  SomeComponent.tsx
  SomeComponent.types.ts
  utils/
  components/
  graphql/
  constants/
  hooks/
```

## Tables

- For tabular data use `DataTable` (`src/components/ui/DataTable`) instead of a custom `<table>`.
- Render row actions as icons without text, but with `aria-label` or `title` for accessibility.

## Types

- Type components with `FC` (except for the cases above).
- Do not use `as` to force type casts; prefer type guards or narrowing.

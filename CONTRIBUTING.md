# Contributing

Thank you for your interest in UML Drawer JS. This document covers the contributor workflow until the library reaches `1.0`.

## Development setup

1. Install Node.js 20 LTS (the version is pinned in [`.nvmrc`](./.nvmrc)).
2. Install pnpm 9+.
3. Clone the repository and run `pnpm install`. The `prepare` script wires up Husky hooks automatically.

```bash
nvm use
pnpm install
```

## Workspace layout

```
packages/
  theme/                  design-agnostic theming contract
  core/                   parser, AST, generator, validators, layout, renderer, exporters, editor
  codemirror-plantuml/    CodeMirror 6 language extension
  react/                  React adapter (<UmlEditor> + sub-components)
apps/
  playground/             showcase + cyber-topographic skin (not published)
  docs/                   VitePress documentation site
docs/                     specification, implementation plan, ADRs
```

The phased roadmap and exit criteria for every phase live in [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md).

## Source of truth

- Requirements and API surface — [`docs/uml-drawer.md`](./docs/uml-drawer.md).
- Roadmap — [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md).
- Decisions on open questions — `docs/adr/000{1..N}-*.md`.

Before starting a non-trivial change, find the matching phase in the implementation plan and confirm the exit criteria.

## Coding conventions

- TypeScript strict mode, ESM-only, `sideEffects: false` on every publishable package.
- All AST mutations go through CQRS commands; never mutate AST in place.
- No hardcoded colors or brand aesthetics inside `packages/*` — consume only `--uml-*` variables.
- Prefer constructor injection / pure functions; no `var`.
- Tests follow the AAA (Arrange-Act-Assert) pattern.
- IDs are UUIDv7.
- In `docs/IMPLEMENTATION_PLAN.md`, completed checklist items are marked with `✅`, not `- [x]`.

## Commits

This repository uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by `commitlint`. Common types:

- `feat:` — user-visible feature.
- `fix:` — bug fix.
- `docs:`, `chore:`, `refactor:`, `perf:`, `test:`, `build:`, `ci:`.

Pre-commit hooks run `lint-staged` (ESLint + Prettier on changed files). The commit-msg hook validates the message format.

## Changesets

User-facing changes to publishable packages require a changeset:

```bash
pnpm changeset
```

Pick the affected packages, the bump type (`patch` / `minor` / `major`) and write a one-line summary. Commit the generated `.changeset/*.md` file alongside your code.

`apps/playground` and `apps/docs` are listed under `ignore` and never bump.

## Pull requests

- Branch from `main`.
- Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` locally.
- Reference the relevant phase from the implementation plan in the PR description.
- Visual or performance-sensitive changes need to point to the regression evidence (screenshots or bench output).

## Pre-1.0 versioning

Until `1.0`, breaking changes may land in minor versions but must be flagged in the changeset summary and called out in the PR description.

## License

By contributing you agree that your contributions will be licensed under the [MIT License](./LICENSE).

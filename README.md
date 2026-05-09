# UML Drawer JS

> Framework-agnostic TypeScript library for editing UML diagrams with bidirectional PlantUML synchronization.

**Status:** MVP feature-complete (pre-alpha). Phases 0–17 closed except for the browser-test layer (Phase 14b — Playwright E2E + visual regression + axe-core), which lands alongside the first deploy. The roadmap and exit criteria for every phase live in [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md).

What ships today:

- **Library packages** (publishable on npm): `@uml-drawer/core` (parser + AST + commands + history + validators + layout + renderer + exporters + vanilla `createEditor`), `@uml-drawer/react` (idiomatic React 18+ adapter), `@uml-drawer/codemirror-plantuml` (CM6 language + diagnostics + autocomplete), `@uml-drawer/theme` (design-agnostic `--uml-*` contract).
- **Showcase** (`apps/playground`): full composition under the cyber-topographic skin with topbar / breadcrumb / theme switch / skin toggle / per-type sample diagrams / 4-corner HUD / slash-command channel.
- **Documentation site** (`apps/docs`): VitePress site with Getting Started, Concepts, per-type guides, Theming, hand-curated API reference, Recipes, Migration; deploys alongside the playground via GitHub Pages.
- **CI / quality gates**: lint + typecheck + Vitest + coverage gate (≥ 85% on core) + design-agnostic CSS guard + perf bench (parse + regen < 50 ms) + size-limit (core + react + ELK ≤ 500 KB gzip).
- **ADRs for every open question** in `docs/adr/0001..0006-*.md` plus a touch/mobile interaction matrix in `docs/design/interaction-matrix.md`.

The Phase 4 parser is hand-rolled; the CodeMirror package rides the same parser via `StreamLanguage`. Lezer migration is tracked in [ADR-0003](./docs/adr/0003-plantuml-subset.md) and will not change the published API.

See [`docs/uml-drawer.md`](./docs/uml-drawer.md) for the full specification and [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md) for the phased roadmap.

## Planned packages

| Package                           | Purpose                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `@uml-drawer/core`                | Hexagonal core: parser, AST model, generator, validators, layout, renderer, commands, history, exporters, vanilla `createEditor` |
| `@uml-drawer/react`               | Idiomatic React adapter: `<UmlEditor>` and headless sub-components                                                               |
| `@uml-drawer/codemirror-plantuml` | CodeMirror 6 language support reusing the core Lezer grammar                                                                     |
| `@uml-drawer/theme`               | Design-agnostic theming contract — `--uml-*` CSS variables with neutral light/dark defaults                                      |

`apps/playground` and `apps/docs` host the showcase and documentation site respectively. The cyber-topographic skin lives only inside `apps/playground/src/skins/cyber-topographic/` and is not published.

## Requirements

- Node.js 20 LTS (see `.nvmrc`)
- pnpm 9+

## Scripts

```bash
pnpm install           # install workspace dependencies
pnpm typecheck         # run tsc --noEmit across all packages
pnpm lint              # ESLint + Prettier check
pnpm test              # Vitest across all packages
pnpm build             # build all publishable packages
pnpm changeset         # author a changeset for a release
```

## License

[MIT](./LICENSE)

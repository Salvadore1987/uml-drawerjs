# UML Drawer JS

> Framework-agnostic TypeScript library for editing UML diagrams with bidirectional PlantUML synchronization.

**Status:** MVP feature-complete (pre-alpha) and extended with post-MVP feature rounds for class / ER / sequence parity and c4model.com alignment. Phases 0–17 closed except for the browser-test layer (Phase 14b — Playwright E2E + visual regression + axe-core), which lands alongside the first deploy. The roadmap and exit criteria for every phase live in [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md).

What ships today:

- **Library packages** (publishable on npm): `@uml-drawer/core` (parser + AST + commands + history + validators + layout + renderer + exporters + vanilla `createEditor`), `@uml-drawer/react` (idiomatic React 18+ adapter with `<Tabs>` for Designer / Text split + per-kind editors for class members, entity columns, SD fragments / notes / dividers), `@uml-drawer/codemirror-plantuml` (CM6 language + diagnostics + autocomplete), `@uml-drawer/theme` (design-agnostic `--uml-*` contract).
- **Five diagram types at full UML parity**: C4 Context / Container / Component (full c4model.com stdlib — `Person_Ext`, `SystemDb`, `SystemQueue`, `Container_Ext`, `ContainerDb`, `ContainerQueue`, `Component_Ext`, `ComponentDb`, `ComponentQueue`, `Enterprise_Boundary`); Class (members + generics + enum literals + packages + per-end role / multiplicity / navigability); Entity Relationship (PK / FK / NN columns in UML-IE notation); Sequence (lifelines + `boundary` / `control` / `entity` / `database` / `queue` / `collections` shapes, activations, combined fragments with operands, notes, dividers, autonumber, self-messages, create / destroy).
- **Boundary as a first-class element** on canvas — visible frame, drag / move / resize, drag-into-boundary membership, alias + label editing in the properties panel.
- **Showcase** (`apps/playground`): unified Designer / PlantUML tab workzone (Alt+1 / Alt+2), full composition under the cyber-topographic skin with topbar / breadcrumb / theme switch / skin toggle / per-type sample diagrams / 4-corner HUD / slash-command channel.
- **Documentation site** (`apps/docs`): VitePress site with Getting Started, Concepts, per-type guides, Theming, hand-curated API reference, Recipes, Migration; deploys alongside the playground via GitHub Pages.
- **CI / quality gates**: lint + typecheck + Vitest + coverage gate (≥ 85% on core) + design-agnostic CSS guard + perf bench (parse + regen < 50 ms) + size-limit (core + react + ELK ≤ 500 KB gzip).
- **ADRs for every design decision** in `docs/adr/0001..0010-*.md` plus a touch/mobile interaction matrix in `docs/design/interaction-matrix.md`.

The Phase 4 parser is hand-rolled; the CodeMirror package rides the same parser via `StreamLanguage`. Lezer migration is tracked in [ADR-0003](./docs/adr/0003-plantuml-subset.md) and will not change the published API.

## Getting started

- **[`USAGE.md`](./USAGE.md)** — quick install + usage guide (Russian): что установить, как подключить тему, минимальный React и vanilla примеры, экспорт / импорт, темизация, SSR, CQRS, чек-лист интеграции.
- **[`INTEGRATION.md`](./INTEGRATION.md)** — расширенная интеграция: CodeMirror, отладка, особенности типов диаграмм, полный каталог команд.
- **[`docs/uml-drawer.md`](./docs/uml-drawer.md)** — полная спецификация (SRS / SDD).
- **[`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md)** — фазовый roadmap, requirements-coverage, changelog.

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

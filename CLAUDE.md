# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository State

**This repository is MVP feature-complete** and has shipped several post-MVP feature rounds (class members + generics + enum literals + per-end edge endpoints; full ER attribute notation; full UML Sequence Diagram notation; c4model.com stdlib alignment; boundary as a first-class canvas element; unified Designer / PlantUML tab workzone in the playground). The implementation lives across `packages/*` and `apps/*`:

- `packages/core` — parser + AST + generator + validators + layout + renderer + commands + history + exporters + vanilla `createEditor`.
- `packages/react` — `<UmlEditor>` adapter + sub-components (`<Canvas>`, `<Palette>`, `<PropsPanel>`, `<TextEditor>`, `<Outline>`, `<HUD>`, `<CommandChannel>`, `<Statusbar>`, `<Tabs>`, plus per-kind editors: `<ClassMembersEditor>`, `<EntityMembersEditor>`, `<FragmentEditor>`, `<NoteEditor>`, `<DividerEditor>`).
- `packages/codemirror-plantuml` — CM6 language extension (StreamLanguage MVP; Lezer deferred per ADR-0003).
- `packages/theme` — design-agnostic `--uml-*` contract + neutral light/dark defaults.
- `apps/playground` — showcase under the cyber-topographic skin with unified Designer / PlantUML tabs (Alt+1 / Alt+2).
- `apps/docs` — VitePress documentation site.

Authoritative documents:

- [`docs/uml-drawer.md`](./docs/uml-drawer.md) — full SRS/SDD specification (in Russian). **Authoritative source of requirements**: functional + non-functional requirements, AST shape, API surface, UI design, validation levels, testing plan, deployment.
- [`docs/design/02-cyber-topographic.html`](./docs/design/02-cyber-topographic.html) — visual reference for **one specific showcase skin** (cyber-topographic), not for the library itself. The library is design-agnostic: components are styled exclusively through the `--uml-*` theming contract. The cyber-topographic skin lives in `apps/playground/src/skins/cyber-topographic/` and is never imported by `packages/*`.
- [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md) — phase-organized checklist with dependency map, exit criteria per phase, requirements-coverage table, and a post-MVP changelog at the bottom.
- [`docs/adr/0001..0010-*.md`](./docs/adr/) — Architecture Decision Records for every contentious design decision (sequence layout, undo granularity, PlantUML subset, CRDT readiness, drill-down scope, AI extension, enum modelling, class edge endpoints, ER attribute notation, full UML SD notation).
- [`INTEGRATION.md`](./INTEGRATION.md) — consumer integration guide (Russian) — install, theme, React + vanilla bootstrap, CodeMirror, per-diagram-type features, CQRS extension surface.

**When asked to implement something, first consult `docs/IMPLEMENTATION_PLAN.md` to find the relevant phase and its exit criteria, then verify against `docs/uml-drawer.md` for the exact requirement.** For diagram-type-specific decisions, also check the matching ADR.

## Project Vision (from the spec)

UML Drawer JS is a **framework-agnostic TypeScript library** with a React adapter for editing UML diagrams. The defining feature is **bidirectional synchronization** between a visual editor and PlantUML-compatible DSL — both views are kept in sync via a single AST as the source of truth.

Five diagram types are supported, fixed at diagram creation: C4 Context, C4 Container, C4 Component, Class, Entity Relationship, Sequence.

## Architecture

- **pnpm monorepo** with workspaces under `packages/*` and `apps/*`.
- **Hexagonal architecture** in the core: `parser/` (hand-rolled line-based; Lezer deferred per ADR-0003), `model/` (AST), `generator/` (AST → PlantUML), `validators/` (4 levels: syntax / semantic / constraints / lint), `layout/` (ELK.js + custom Sequence layout + grid fallback), `renderer/` (mini SVG layer + sequence pipeline + interactions + grid, no D3), `commands/` (CQRS), `history/` (undo/redo over commands), `exporters/` (puml/svg/png/json), `editor/` (vanilla `createEditor` bootstrap).
- **All AST mutations go through CQRS commands** — this is what enables undo/redo and keeps the door open for CRDT/Yjs collaboration later. Do not mutate AST directly.
- **Text edits and visual edits both converge on the same AST.** The parser is line-based and incremental enough for MVP; commands apply structurally. Layout coordinates live in `metadata.layoutOverrides` and are encoded in `' @drawer:meta {...}` PlantUML comments so other PlantUML tools ignore them.
- **Four published packages:** `@uml-drawer/core`, `@uml-drawer/react`, `@uml-drawer/codemirror-plantuml`, `@uml-drawer/theme` (CSS-only design-agnostic theming contract — `--uml-*` namespace + neutral light/dark defaults; **no brand aesthetics here**). Plus `apps/playground` (showcase that bundles its own cyber-topographic skin on top of the library + visual regression bed) and `apps/docs` (VitePress).

## Project-Specific Conventions

- **Checklist completion marker:** in `docs/IMPLEMENTATION_PLAN.md` and any new TODO files, completed tasks must be marked with `✅` (green checkmark emoji), **not** `- [x]`. Open tasks stay as `- [ ]`.
- **No hardcoded colors anywhere in `packages/*`** — consume only `--uml-*` CSS variables from `@uml-drawer/theme`. Hex values from `02-cyber-topographic.html` belong **only** in `apps/playground/src/skins/cyber-topographic/`, never in any library package. CI enforces this via a regex grep over built CSS (the "design-agnostic guard" in Phase 14).
- **Theme switching** must use `data-theme="light" | "dark"` on the editor's host container (not global `:root`), with a 0.2–0.4s CSS transition. The library must not pollute the host application's global styles. Skins (e.g. cyber-topographic) apply themselves via a class on the playground root, not on `:root`.
- **`prefers-color-scheme`** drives auto-theme selection when no `data-theme` is explicitly set.
- **Performance budgets** (verified in CI per the plan): 60 FPS pan/zoom on 200-node diagrams; parse + regenerate < 50 ms; bundle (core + react + ELK gzipped) ≤ 500 KB. ELK is loaded via dynamic import only when `runAutoLayout()` is first called.
- **TypeScript strict mode + ESM-only + `sideEffects: false`** for tree-shaking — non-negotiable per the spec's NFRs.
- **Reduced motion:** the library itself ships no glow/blur. Skins (showcase) that introduce them must gate every such effect behind `prefers-reduced-motion: reduce`.

## Commands

```bash
pnpm install                    # install workspace dependencies
pnpm typecheck                  # tsc --noEmit across every package
pnpm lint                       # ESLint (with max-warnings=0)
pnpm test                       # Vitest across every package
pnpm build                      # build all publishable packages + apps
pnpm bench                      # perf bench (parse + regen budget)
pnpm size                       # size-limit gate (core + react + ELK ≤ 500 KB gzip)
pnpm guard:design-agnostic      # regex grep — no hex/rgb in packages/* CSS
pnpm changeset                  # author a changeset for the next release
```

## Plan mode
- Always show in console what you need to change

## Agent / Skill Routing (from global rules)

- Tests → `senior-qa` skill
- Architecture decisions → `senior-architect` skill
- TypeScript / JavaScript → `senior-frontend` skill

## Implementation
- After each phase need check checkbox to done
- Add to git `git add .`
- Create commit with message `git commit -am {generated message from tasks}`
- After each phase need to update README.md if needed

## ADRs

Every contentious design decision is captured as an ADR. Existing records:

- `0001-sequence-layout.md` — bespoke synchronous SD algorithm vs ELK post-processor.
- `0002-undo-granularity.md` — atomic commands + opt-in coalesce window.
- `0003-plantuml-subset.md` — PlantUML subset for MVP; Lezer migration deferred.
- `0004-collab-readiness.md` — five CRDT-readiness invariants + migration path to Yjs.
- `0005-drilldown-out-of-scope.md` — sub-diagram drill-down deferred post-1.0.
- `0006-ai-extension.md` — AI assistant as a separate `@uml-drawer/ai` package.
- `0007-class-enum-modelling.md` — enum literals as a dedicated `EnumLiteral[]` field.
- `0008-class-edge-endpoints.md` — class edges adopt nested `ends?: { source?, target? }`.
- `0009-er-attribute-modelling.md` — entity columns reuse `Attribute` with kind-aware PK / FK / NN.
- `0010-sequence-uml-notation.md` — full UML SD notation; flat `fragments[]` / `notes[]` / `dividers[]`; activations on nodes; self-message reuses normal edges.

When introducing a new structural decision, capture the trade-offs as the next ADR rather than smuggling the choice into code.

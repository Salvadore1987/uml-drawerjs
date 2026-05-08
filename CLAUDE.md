# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository State

**This repository is greenfield.** As of writing, the only artifacts that exist are documentation:

- [`docs/uml-drawer.md`](./docs/uml-drawer.md) — the full SRS/SDD specification (in Russian). This is the **authoritative source of requirements**: functional + non-functional requirements, AST shape, API surface, UI design, validation levels, testing plan, deployment.
- [`docs/design/02-cyber-topographic.html`](./docs/design/02-cyber-topographic.html) — visual reference for **one specific showcase skin** (cyber-topographic), not for the library itself. The library is design-agnostic: components are styled exclusively through the `--uml-*` theming contract. The cyber-topographic skin is implemented separately in `apps/playground/src/skins/cyber-topographic/` *after* the library is feature-complete (Phase 13a), and is never imported by `packages/*`.
- [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md) — phase-organized TODO checklist with dependency map, exit criteria per phase, and a requirements-coverage table.

There is no `package.json`, no source code, no build system yet. The implementation has not started.

**When asked to implement something, first consult `docs/IMPLEMENTATION_PLAN.md` to find the relevant phase and its exit criteria, then verify against `docs/uml-drawer.md` for the exact requirement.**

## Project Vision (from the spec)

UML Drawer JS will be a **framework-agnostic TypeScript library** with a React adapter for editing UML diagrams. The defining feature is **bidirectional synchronization** between a visual editor and PlantUML-compatible DSL — both views are kept in sync via a single AST as the source of truth.

Five diagram types are supported, fixed at diagram creation: C4 Context, C4 Container, C4 Component, Class, Entity Relationship, Sequence.

## Planned Architecture (when implementation begins)

The spec mandates a specific structure — do not invent alternatives without strong reason:

- **pnpm monorepo** with workspaces under `packages/*` and `apps/*`.
- **Hexagonal architecture** in the core: `parser/` (Lezer), `model/` (AST), `generator/` (AST → PlantUML), `validators/` (4 levels: syntax / semantic / constraints / lint), `layout/` (ELK.js + custom Sequence layout), `renderer/` (mini SVG layer, no D3), `commands/` (CQRS), `history/` (undo/redo over commands), `exporters/` (puml/svg/png/json), `editor/` (vanilla `createEditor` bootstrap).
- **All AST mutations go through CQRS commands** — this is what enables undo/redo and keeps the door open for CRDT/Yjs collaboration later. Do not mutate AST directly.
- **Text edits and visual edits both converge on the same AST.** Lezer parses incrementally; commands apply structurally. Layout coordinates live in `metadata.layoutOverrides` and are encoded in `' @drawer:meta {...}` PlantUML comments so other PlantUML tools ignore them.
- **Four planned packages:** `@uml-drawer/core`, `@uml-drawer/react`, `@uml-drawer/codemirror-plantuml`, `@uml-drawer/theme` (CSS-only design-agnostic theming contract — `--uml-*` namespace + neutral light/dark defaults; **no brand aesthetics here**). Plus `apps/playground` (showcase that bundles its own cyber-topographic skin on top of the library + visual regression bed) and `apps/docs`.

## Project-Specific Conventions

- **Checklist completion marker:** in `docs/IMPLEMENTATION_PLAN.md` and any new TODO files, completed tasks must be marked with `✅` (green checkmark emoji), **not** `- [x]`. Open tasks stay as `- [ ]`.
- **No hardcoded colors anywhere in `packages/*`** — consume only `--uml-*` CSS variables from `@uml-drawer/theme`. Hex values from `02-cyber-topographic.html` belong **only** in `apps/playground/src/skins/cyber-topographic/`, never in any library package. CI enforces this via a regex grep over built CSS (the "design-agnostic guard" in Phase 14).
- **Theme switching** must use `data-theme="light" | "dark"` on the editor's host container (not global `:root`), with a 0.2–0.4s CSS transition. The library must not pollute the host application's global styles. Skins (e.g. cyber-topographic) apply themselves via a class on the playground root, not on `:root`.
- **`prefers-color-scheme`** drives auto-theme selection when no `data-theme` is explicitly set.
- **Performance budgets** (verified in CI per the plan): 60 FPS pan/zoom on 200-node diagrams; parse + regenerate < 50 ms; bundle (core + react + ELK gzipped) ≤ 500 KB. ELK is loaded via dynamic import only when `runAutoLayout()` is first called.
- **TypeScript strict mode + ESM-only + `sideEffects: false`** for tree-shaking — non-negotiable per the spec's NFRs.
- **Reduced motion:** the library itself ships no glow/blur. Skins (showcase) that introduce them must gate every such effect behind `prefers-reduced-motion: reduce`.

## Commands

No build system is configured yet. Once Phase 0 of `docs/IMPLEMENTATION_PLAN.md` lands, this section should be updated with the actual `pnpm` scripts (`pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm bench`, Playwright commands, etc.). Until then there is nothing to run.

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

## Open Questions Tracked as ADRs

The spec leaves several decisions explicitly open (Sequence layout strategy, undo granularity for text edits, PlantUML subset for MVP, CRDT-readiness checks, drill-down scope, AI-assistant placement, touch UX). These are tracked in Phase 17 of the implementation plan and should be resolved as ADRs in `docs/adr/000{1..6}-*.md` when encountered — do not silently make these choices in code.

# ADR-0004 — Collaboration readiness: CRDT/Yjs as a future swap

- **Status:** Accepted (cross-cutting, applies from Phase 3 onward)
- **Date:** 2026-05-09
- **Authors:** UML Drawer JS contributors
- **Phases:** [P3 (Commands)](../IMPLEMENTATION_PLAN.md#5-phase-3--commands-cqrs--history), [P10 (createEditor)](../IMPLEMENTATION_PLAN.md#12-phase-10--editorcreateeditor-vanilla-bootstrap)

## Context

The spec leaves multi-user collaboration as a deliberately-unsolved problem for the MVP, but mandates that the architecture be **CRDT-ready** from day one. The cost of retrofitting collaboration onto a mutable-state codebase is large; the cost of doing it correctly during MVP is small if the right invariants are upheld.

## Decision

The MVP implementation upholds five invariants that make Yjs (or any other CRDT) a focused swap rather than a rewrite:

1. **Single source of truth.** The `Diagram` AST is the only canonical state. Both visual edits and text edits converge on it. Neither modality maintains a parallel "shadow" model.
2. **Immutable updates.** Every command produces a new `Diagram` via `structuredClone` + targeted patching. No in-place mutation. Renderer and React consumers can rely on referential changes to detect updates.
3. **Explicit, structural commands.** Every state change is a `Command<Kind, Payload>` whose `kind` is a stable string and whose `payload` is JSON-serialisable. The full catalogue is enumerated in `packages/core/src/commands/index.ts`. There are no "hidden" mutations from inside a hook or a component.
4. **No ambient coupling.** Validators, layout, renderer, and exporters are pure functions of the AST. None reads `globalThis` state, none uses module-level singletons. Swapping the bus does not require changes downstream.
5. **Deterministic ids.** Node/edge/group ids are uuidv7 (or counter-based in tests). They never collide with the alias / label space, so renaming a node never changes its identity.

These five constraints are tested implicitly by the existing CQRS suite (each command's `apply ↔ invert` round-trips byte-equal AST snapshots) and the round-trip parser/generator tests.

## Migration path to Yjs

The expected swap, post-1.0:

1. Replace the `CommandBus` implementation with a Yjs-aware variant. Locally, `dispatch` still returns a fresh `Diagram`; remotely, the bus reflects Yjs document updates as synthetic `Command`s.
2. Re-encode the `Diagram` shape as a Yjs `Map`/`Array` tree. The shape is small (nodes, edges, groups, metadata) — the encoding is mechanical.
3. Wire awareness (cursors, selection) into the existing `SelectionModel` — the model already supports multiple subscribers, so it generalises to per-user selections without API changes.
4. Replace the React adapter's `useEffect`-based bus subscription with a Yjs-aware one. Public hooks (`useEditor`, `useEditorState`, `useDiagramErrors`, `useSelection`) keep their signatures.

No public types change. Hosts that want CRDT collaboration upgrade their dependency; hosts that don't keep using the local bus.

## Consequences

### Pros

- The MVP stays ship-shape today and stays ship-shape under Yjs tomorrow.
- The five invariants are easy to enforce in code review and via tests.
- Renderer / validators / exporters / layout never change.

### Cons

- The five invariants impose discipline. Any change that adds in-place mutation or globals to `packages/core/*` is a regression on this ADR and should be flagged in PR review.
- Yjs encoding has its own performance characteristics; the integration phase will need a perf pass to confirm we still hit the 50 ms parse + regen and 60 FPS pan/zoom budgets under collaboration.

### Followups

- When the integration lands, capture the Yjs-specific decisions in an ADR-0007 ("Yjs encoding strategy") and supersede this one as "Implemented".

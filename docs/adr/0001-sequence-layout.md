# ADR-0001 — Sequence-diagram layout: bespoke synchronous algorithm

- **Status:** Accepted (Phase 7)
- **Date:** 2026-05-09
- **Authors:** UML Drawer JS contributors
- **Phase:** [Phase 7 — Layout](../IMPLEMENTATION_PLAN.md#9-phase-7--layout)

## Context

The implementation plan calls out two open questions for the layout phase:

1. ELK Layered (the default for C4 / Class / ER) does not produce the canonical look for sequence diagrams — lifelines on a horizontal axis with vertical message stacking, time flowing top-to-bottom.
2. Sequence diagrams need to be deterministic across machines (same source ⇒ same coordinates) so that visual-regression baselines are stable.

Two candidates were considered:

- **Bespoke synchronous algorithm** — assign lifelines to evenly-spaced X positions in declaration order; assign messages a Y based on their order in the AST. Pure data, no async, no Worker.
- **ELK post-processor** — feed sequence input into ELK Layered and reshape the output to flatten lifelines along a single horizontal lane. Reuses the loader and the rest of the layout machinery.

## Decision

Ship the **bespoke synchronous algorithm** (`packages/core/src/layout/sequence.ts`). `runAutoLayout(diagram)` dispatches by `diagram.type`: sequence routes to `layoutSequence`, everything else routes to ELK with the grid fallback.

Reasons:

- The algorithm is genuinely simple — lifelines on a horizontal axis with constant pitch, messages at constant vertical pitch, deterministic by AST order. Implementing it costs less than the ELK post-processing logic.
- It is **synchronous**: no `await import("elkjs/...")`, no Worker construction, no platform-specific rounding. That makes the parse + regen + layout chain stay inside the 50 ms budget without any caching.
- It avoids loading ELK for sequence-only documents — measurable on small embeds where bundle weight matters.
- Visual regression baselines are byte-stable on every machine because the output is pure-arithmetic.

## Consequences

### Pros

- Deterministic across runs; no Workers required; never throws.
- Sequence-only consumers never download `elk.bundled.js`.
- Tightly coupled to the diagram-type dispatch in `runAutoLayout`, easy to evolve in isolation.

### Cons

- Activations / combined fragments (`alt` / `opt` / `loop`) are not yet supported — the algorithm assumes flat message lists. Once those land, we may need a more sophisticated vertical packer; the algorithm is a single file so the rewrite is contained.
- Diverges from how the other diagram types lay out (ELK). New contributors need to know the sequence path is bespoke.

### Followups

- When activations land, extend `layoutSequence` with a vertical packer that respects activation depth.
- If we ever introduce more nuanced rendering (parallel messages, message groupings), revisit whether ELK Layered + a post-processor is now a better deal than evolving the bespoke algorithm.

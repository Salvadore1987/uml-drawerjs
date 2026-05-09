# ADR-0002 — Undo granularity: atomic per-command, opt-in coalesce window

- **Status:** Accepted (Phase 3)
- **Date:** 2026-05-09
- **Authors:** UML Drawer JS contributors
- **Phase:** [Phase 3 — Commands & History](../IMPLEMENTATION_PLAN.md#5-phase-3--commands-cqrs--history)

## Context

The CQRS layer dispatches one command per user action — `AddNodeCommand`, `UpdateNodeCommand`, `MoveNodeCommand`, etc. Two extreme undo policies were considered:

- **Atomic** — one undo frame per command. Ctrl-Z reverses the most recent action, even if the user typed three letters into a label (each keystroke is `UpdateNodeCommand` with a fresh `label` patch).
- **Semantic grouping** — group related commands automatically (e.g. consecutive label edits within 500 ms collapse into a single undo frame).

Atomic gives precise control but feels noisy for typing-heavy interactions. Semantic grouping gives a smoother UX but introduces hidden state and edge cases (when does a "burst" end? what if the user pauses then types more?).

## Decision

The history stack defaults to **atomic per-command** but accepts a **caller-configurable coalesce policy**:

```ts
new History(bus, {
  coalesceWindowMs: 200,
  coalescePredicate: sameKindAndTarget,
});
```

Three predicates ship out of the box:

- `never` (default) — one frame per command.
- `sameKind` — adjacent commands of the same kind merge if they fall inside the window.
- `sameKindAndTarget` — adjacent commands of the same kind targeting the same element (node/edge/group id) merge.

The window is gated so a long pause always opens a new frame, regardless of predicate. The behaviour is configured by the host, not baked into core.

## Consequences

### Pros

- Library users decide where the trade-off lands. The React adapter currently passes no coalesce policy — the playground shows precise undo for now and can switch to `sameKindAndTarget` per-component when prop edits become typing-heavy.
- The coalesce machinery is local to `History`; the `CommandBus`, the renderer, and the validator stack do not see grouping at all.
- Undo replay is a clean inversion of `apply` — frames are just `Command[]` arrays, so the same machinery transparently handles both single-command and grouped frames.

### Cons

- The default (atomic) means typing into a label produces one undo step per keystroke. The text-editor component's debounced `loadFromText` flush already aggregates within the debounce window (typed text becomes one `ImportTextCommand`), so the symptom is contained in the props-panel typing path. Hosts that care can opt in to coalesce.
- Custom predicates can produce surprising frames if poorly written (e.g. always returning true creates one infinite frame). The predicate is documented as a small pure function and tested by unit suites in `@uml-drawer/core`.

### Followups

- If user testing shows that prop-panel typing is the dominant friction, ship `sameKindAndTarget` as the default coalesce policy and keep `never` as an opt-out.
- Consider a "compound" command type that bundles multiple primitives into one undo frame at dispatch time (e.g. "rename + move" from a single user action). This is orthogonal to the coalesce policy.

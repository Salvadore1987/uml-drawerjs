# ADR-0010 — Sequence diagram: full UML SD notation

- **Status:** Accepted
- **Date:** 2026-05-10
- **Authors:** UML Drawer JS contributors
- **Phase:** Sequence-diagram parser, generator, layout, renderer, props panel,
  validators

## Context

Sequence-diagram support before this round covered only the
`participant` / `actor` declaration line and three message arrows
(`->`, `->>`, `-->`). Every other piece of canonical UML SD —
combined fragments, activation specifications, notes, dividers,
auto-numbering, lifeline iconography, self-message arcs,
create / destroy messages — fell through to the parser's opaque
bucket and was lost as soon as the editor regenerated the
PlantUML.

We had to decide several questions before committing to code:

1. **Lifeline kinds.** Should every PlantUML lifeline keyword
   (`boundary`, `control`, `entity`, `database`, `queue`,
   `collections`) become a distinct `NodeKind`, or stay a single
   `lifeline` carrying a stereotype label?
2. **Combined fragments.** Should they be modelled as a tree of
   nested `SequenceStep` items, or as a flat array of fragments
   with explicit `parentId` + `parentOperandId` references?
3. **Activations.** Should activation intervals live on the
   `DiagramNode` (so the renderer can paint shafts without
   walking edges twice) or on the edges themselves (so PlantUML
   shortcut form `++` / `--` round-trips literally)?
4. **Notes / dividers / auto-numbering.** Where should each shape
   live in the AST so the editor commands stay simple and the
   round-trip stays loss-free?
5. **Self-messages.** Treat as a special edge kind, or keep as a
   normal sync-call with `source === target` and have the
   renderer do the right thing?

## Decision

### 1. Distinct `NodeKind` values for boundary / control / entity / collections.

Four new kinds — `lifeline-boundary`, `lifeline-control`,
`lifeline-entity`, `lifeline-collections`. The `lifeline-` prefix
makes the grouping obvious to grep / readers and — crucially —
avoids the pre-existing clash with `entity` (ER) and `boundary`
(`GroupKind`). `database`, `queue`, and `actor` are **reused**
from C4 / existing kinds; the renderer dispatches on
`diagram.type === "sequence"` to draw the UML head + shaft form
instead of the C4 free-standing form.

Why not stay with `kind: "lifeline"` plus a stereotype string?
Distinct kinds let the validator whitelist them at the
`NodeKindNotAllowed` level and let the props panel render a
typed kind dropdown without parsing free-form stereotype text.
The trade-off is a slightly larger `NodeKind` union — judged
worth it because UML SD treats these as semantically different
participants, not just visual variations.

### 2. Combined fragments as a flat array with `parentId` + `parentOperandId`.

`Diagram.fragments?: CombinedFragment[]` holds every fragment
in declaration order. Each fragment has `operands: { id, guard?,
edges: string[] }[]` referencing message edge ids. Nesting is
captured by setting `parentId` and `parentOperandId` on the
inner fragment.

The alternative — recursive `SequenceStep` tree — would unify
edges and fragments under a single hierarchical structure, which
is closer to PlantUML's reading order, but it would force every
caller (renderer, generator, validators, props panel) to
implement tree traversal. Flat arrays keep the AST trivially
serialisable and let existing CQRS commands operate on edges
without special-casing fragments.

### 3. Activations on `DiagramNode.activations[]` as intervals.

`ActivationInterval = { id, fromEdgeId, toEdgeId? }`. The
renderer walks the lifeline's intervals, looks up the y-row of
each anchor edge, and paints the rectangle. Open-ended intervals
(no `toEdgeId`) close at the bottom of the diagram.

Generator round-trip uses **explicit** `activate X` /
`deactivate X` lines — not the `++` / `--` shortcuts — so the
output is unambiguous regardless of how the activation was
authored. The parser still accepts both forms; it just
normalises on the way out.

### 4. Notes, dividers, autonumber as distinct top-level concepts.

- `Diagram.notes?: SequenceNote[]` — placement (`left` / `right`
  / `over`), participants by id, text, optional `anchorEdgeId`
  for chronological pinning.
- `Diagram.dividers?: SequenceDivider[]` — label + optional
  `afterEdgeId`.
- `DiagramMetadata.sequenceAutoNumber?: { start, increment,
format? }` — applied at render time as a label prefix; not
  stored on each edge.

Autonumber lives on metadata because it's a diagram-wide setting,
not a per-edge property. Notes and dividers are independent of
both nodes and edges — they have their own selection / edit
identity.

### 5. Self-messages stay as normal edges with `source === target`.

The AST stays uniform; the renderer's sequence module detects
the equality and draws a curved loopback arrow on the same
column. The layout reserves an extra y-padding row so the arc
has visual room. No new `EdgeKind` is needed.

## Consequences

### Pros

- **Loss-free round-trip** for the canonical UML SD subset
  (lifelines + activations + fragments + notes + dividers +
  autonumber + self-messages + create/destroy).
- **Single rendering pipeline** for SD via
  `renderer/sequence.ts`, separate from the generic node + edge
  path. UML SD geometry doesn't fit the generic dispatcher;
  isolating it avoids polluting class / C4 / ER renderers.
- **Theme-friendly**. New `--uml-sequence-*` tokens are aliased
  onto existing `--uml-edge-*`, `--uml-text`, `--uml-bg-elevated`
  defaults — no hex literals in `packages/*` per CLAUDE.md.
- **Validator coverage**. Five new constraint codes
  (`SequenceActivationUnbalanced`,
  `SequenceFragmentEmptyOperand`,
  `SequenceFragmentTooFewOperands`,
  `SequenceNoteOrphanParticipant`, `SequenceNoteEmpty`) catch the
  most common authoring mistakes.
- **Props panel** now supports lifeline-kind switching and
  per-message activation flags inline; no full custom editors
  yet, but the surface for richer editors (fragments / notes) is
  straightforward to add.

### Cons

- **AST grows**. Six new types in `model/types.ts`
  (`ActivationInterval`, `FragmentOperand`, `FragmentKind`,
  `CombinedFragment`, `SequenceNote`, `SequenceDivider`) plus
  field additions to `DiagramNode`, `DiagramEdge`,
  `DiagramMetadata`, `Diagram`. The `parseDiagram` Zod schema and
  the JSON Schema both need synchronous updates — drift is
  caught by the round-trip tests in `validation.test.ts`.
- **Renderer dispatch** is now type-aware: `diagram.type ===
"sequence"` short-circuits to a bespoke pipeline. A future
  refactor could unify this through a per-type renderer table.
- **Editor surface is partial**. Combined fragments and notes
  are not yet selectable in the canvas — they're only editable
  through PlantUML text or by future commands. The selection
  hit-test for fragment frames / note rectangles is queued for
  a follow-up.
- **`ref` fragment** is rendered as a labelled frame with no
  participant binding (since the AST doesn't store the participant
  list separately from edges). Authors who use `ref` extensively
  may want a future `participants[]` on `CombinedFragment`.

### Followups

- Selection model for fragments / notes / dividers (so the props
  panel can render dedicated editors).
- Inline editing of fragment guards and note text directly in
  the canvas.
- `lost` / `found` message kinds (for messages whose endpoint
  isn't in the diagram) — not in MVP.
- Continuation / state invariants and time markers — UML extras,
  rare in practice.
- `ref` zoom-in (open the referenced sub-diagram inline).
- Touch / mobile interaction for fragment selection (Phase 17
  ADR-0006).

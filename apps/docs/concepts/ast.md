# AST as the source of truth

The AST (`Diagram` in `@uml-drawer/core/model`) is the single source of truth. Both the canvas and the PlantUML text are projections of the same tree:

```
text  ──parse──►  Diagram  ──generate──►  text
                     ▲   │
                     │   ▼
                  layout / renderer
                     ▲
                     │
                  user gestures (commands)
```

Visual edits and text edits both produce a fresh `Diagram`; nothing mutates state in place.

## Shape

```ts
interface Diagram {
  id: string; // uuidv7
  type: DiagramType; // c4-context | c4-container | c4-component | class | er | sequence
  title?: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
  // Sequence-only:
  fragments?: CombinedFragment[];
  notes?: SequenceNote[];
  dividers?: SequenceDivider[];
  styles?: StyleMap;
  metadata: DiagramMetadata; // schemaVersion, layoutOverrides, opaque, sequenceAutoNumber
}
```

Full type definitions live in [`packages/core/src/model/types.ts`](https://github.com/Salvadore1987/uml-drawerjs/blob/main/packages/core/src/model/types.ts). The shape is uniform across diagram types — per-type rules are enforced by the constraints validator, not the type system, so a `Diagram` deserialised from disk is always structurally valid.

## Per-diagram-type fields

- **Class** — `node.attributes[]`, `node.operations[]`, `node.generics[]` (per-class generics list), `node.enumLiterals[]` (only when `kind === "enum"`, see [ADR-0007](https://github.com/Salvadore1987/uml-drawerjs/blob/main/docs/adr/0007-class-enum-modelling.md)). Edges use `ends?: { source?, target? }` with role / multiplicity / navigability per end (see [ADR-0008](https://github.com/Salvadore1987/uml-drawerjs/blob/main/docs/adr/0008-class-edge-endpoints.md)).
- **ER** — `node.attributes[]` with `primaryKey` / `foreignKey` / `nullable` flags honoured (see [ADR-0009](https://github.com/Salvadore1987/uml-drawerjs/blob/main/docs/adr/0009-er-attribute-modelling.md)); edges use flat `cardinality?: { source?, target? }`.
- **Sequence** — `node.activations[]` (intervals anchored to message edges), top-level `diagram.fragments[]` (flat with `parentId` / `parentOperandId` for nesting), `diagram.notes[]`, `diagram.dividers[]`, `metadata.sequenceAutoNumber` (see [ADR-0010](https://github.com/Salvadore1987/uml-drawerjs/blob/main/docs/adr/0010-sequence-uml-notation.md)).
- **C4** — `node.technology` carries the `[tech]` rider; `group.kind` distinguishes `boundary` / `package` / `system`.

## Layout overrides + opaque + autonumber

`metadata` carries three round-trip-safe metadata fields:

- `metadata.layoutOverrides` — a map of `nodeId → { x, y, width?, height? }` plus per-edge `points[]` for re-routed edges. Persisted into PlantUML as `' @drawer:meta layoutOverrides {...}` comments that other PlantUML renderers ignore.
- `metadata.opaque` — verbatim text the parser didn't recognise (preprocessor, `!include`, raw skinparam blocks, etc.). The generator emits these unchanged so the editor never silently loses content.
- `metadata.sequenceAutoNumber` — `{ start, increment, format? }` for SD diagrams. The renderer prefixes every message label with the formatted counter; the generator emits an `autonumber` line at the top.

## Why immutable

Every command produces a new `Diagram` via `structuredClone` + targeted patching. That gives:

- Free undo / redo: the history stack just keeps frames of `Command` objects with `apply` / `invert`.
- Predictable React rendering: changing a node creates a new top-level `Diagram` reference; consumers can rely on `Object.is` checks.
- A clean migration path to CRDT/Yjs collaboration: each command is a small structural patch with serialisable payload.

See [CQRS commands & history](./commands).

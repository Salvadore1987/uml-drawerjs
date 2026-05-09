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
  styles?: StyleMap;
  metadata: DiagramMetadata; // schemaVersion, layoutOverrides, opaque
}
```

Full type definitions live in [`packages/core/src/model/types.ts`](https://github.com/Salvadore1987/uml-drawerjs/blob/main/packages/core/src/model/types.ts). The shape is uniform across diagram types — per-type rules are enforced by the constraints validator, not the type system, so a `Diagram` deserialised from disk is always structurally valid.

## Layout overrides + opaque

Two metadata fields make round-tripping safe:

- `metadata.layoutOverrides` — a map of `nodeId → { x, y }`. Persisted into PlantUML as `' @drawer:meta layoutOverrides {...}` comments that other PlantUML renderers ignore. Survives across export → import round trips.
- `metadata.opaque` — verbatim text the parser didn't recognise (preprocessor, `!include`, raw skinparam blocks, etc.). The generator emits these unchanged so the editor never silently loses content.

## Why immutable

Every command produces a new `Diagram` via `structuredClone` + targeted patching. That gives:

- Free undo / redo: the history stack just keeps frames of `Command` objects with `apply` / `invert`.
- Predictable React rendering: changing a node creates a new top-level `Diagram` reference; consumers can rely on `Object.is` checks.
- A clean migration path to CRDT/Yjs collaboration: each command is a small structural patch with serialisable payload.

See [CQRS commands & history](./commands).

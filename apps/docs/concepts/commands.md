# CQRS commands & history

Every AST mutation flows through a command. The shape is small and uniform:

```ts
interface Command<Kind extends string = string, Payload = unknown> {
  kind: Kind;
  payload: Payload;
  apply(diagram: Diagram): Diagram;
  invert(diagram: Diagram): Diagram;
}
```

`apply` returns the next AST; `invert` restores the previous one. Both are pure functions of their input — that's what makes undo/redo a one-line affair and what positions the project for a future CRDT integration.

## Catalogue

| Factory              | Effect                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------- |
| `addNodeCommand`     | Append a new node.                                                                      |
| `removeNodeCommand`  | Remove a node and cascade-drop its incident edges; restore on invert.                   |
| `moveNodeCommand`    | Update `metadata.layoutOverrides[id]`.                                                  |
| `updateNodeCommand`  | Patch `label / kind / stereotype / technology / description / attributes / operations`. |
| `addEdgeCommand`     | Append an edge.                                                                         |
| `removeEdgeCommand`  | Remove an edge.                                                                         |
| `updateEdgeCommand`  | Patch `label / kind / cardinality / style`.                                             |
| `addGroupCommand`    | Append a boundary / package / system group.                                             |
| `updateGroupCommand` | Patch group label / children / kind.                                                    |
| `removeGroupCommand` | Remove a group.                                                                         |
| `applyLayoutCommand` | Replace `metadata.layoutOverrides` wholesale (used by `runAutoLayout`).                 |
| `importTextCommand`  | Replace the entire AST (used by `loadFromText`).                                        |

## Bus + History

```ts
import { CommandBus } from "@uml-drawer/core/commands";
import { History } from "@uml-drawer/core/history";

const bus = new CommandBus(initialDiagram);
const history = new History(bus, { coalesceWindowMs: 200 });

history.dispatch(addNodeCommand({ id, kind: "class", label: "Foo" }));
history.undo();
history.redo();

bus.on("after", ({ command, nextState }) => {
  // Re-render, recompute validators, etc.
});
```

The bus broadcasts `before` / `after` events. The history stack subscribes implicitly via `dispatch` and offers a coalesce policy:

- `never` (default) — one frame per command.
- `sameKind` — adjacent commands of the same kind merge.
- `sameKindAndTarget` — adjacent commands targeting the same node/edge merge (e.g. typing into a label).

Coalesce is gated by `coalesceWindowMs` so a long pause always opens a new frame.

## Why CQRS

- **Cheap undo / redo**: the history just stores frames and replays `apply` / `invert`.
- **Audit trail**: command kinds + payloads are serialisable, so a future telemetry / activity-log layer is mechanical.
- **Collaboration-ready**: each command is a small structural patch. CRDT integration (Phase 17 ADR) replaces the bus's local dispatch with a remote-aware one — the rest of the stack stays untouched.
- **Testability**: each command's `apply ↔ invert` round-trips byte-equal AST snapshots, which is the foundation of the 18-test command suite in `@uml-drawer/core`.

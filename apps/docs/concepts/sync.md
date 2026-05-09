# Bidirectional sync

The defining feature of UML Drawer JS is that visual edits and textual edits land in the same place. The flow is intentionally short:

## Text → AST → Visual

```
user types in <TextEditor>
    │
    │ (debounced 250 ms)
    ▼
parsePlantUml(text, { diagramType })
    │
    ▼
Diagram + DiagramError[]   ← validators run on every parse
    │
    ▼
ImportTextCommand           ← dispatched on the bus
    │
    ▼
SVG rerender + onChange     ← editor.bus.on("after")
```

Errors never destroy the AST. The parser captures unrecognised lines into `metadata.opaque` and emits structured `DiagramError`s with stable codes (see [Validators](./validators)). The last successfully-parsed AST stays on the bus.

## Visual → AST → Text

```
user clicks palette / types in props panel
    │
    ▼
AddNodeCommand / UpdateNodeCommand / ...
    │
    ▼ (CommandBus.dispatch)
new Diagram                 ← apply() returns a fresh tree
    │
    ▼
generatePlantUml(diagram)   ← canonical formatter
    │
    ▼
text propagated via onChange
```

The generator is deterministic: identical ASTs round-trip to byte-equal text, modulo the alias strategy. Layout coordinates picked up by the user dragging a node land in `metadata.layoutOverrides` and survive the round trip via `' @drawer:meta` comments.

## Why a single AST

Many editors keep two parallel models — a "visual graph" and a "text document" — and reconcile them with diff/patch. That breaks down on edge cases (concurrent edits, undo across modalities, comment preservation).

UML Drawer JS keeps one model. Both modalities are commands against the same bus; both modalities undo with the same history stack; both modalities see the same validator output.

## Implications for hosts

- **Controlled props** — pass `value` to `<UmlEditor>` and lift the document upstream; the adapter syncs through `loadFromText`.
- **Uncontrolled defaults** — pass `defaultValue`; the editor owns the document internally.
- **External commands** — call `editor.dispatch(addNodeCommand(...))` from anywhere. The bus broadcasts `after` events that drive both the renderer and `onChange`.
- **External text edits** — assign a new `value`. The adapter notices the change and runs `loadFromText`, which dispatches `ImportTextCommand`.

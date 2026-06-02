# Round-trip of `metadata.layoutOverrides` breaks: keys are node UUIDs, parser allocates fresh UUIDs on every load

## Summary

`generator.formatDiagramMeta` emits `' @drawer:meta {"layoutOverrides": {<node.id>: {x, y}, ...}}` keyed by **node UUIDs**. On the next `loadFromText`, the parser allocates **new** UUIDs for the same PlantUML aliases (via `resolveAlias` → `ctx.idFactory()`), so the persisted override keys never match the current node ids and the renderer falls back to its `layoutGrid` default — every node ends up at `(0, 0)` (visually stacked).

This is a regression for any consumer that persists `editor.exportText()` to a backend and reloads it on next session.

## Reproduction

```ts
import { createEditor } from "@uml-drawer/core/editor";

const seed = `@startuml
!include <C4/C4_Context>
Person(customer, "Customer", "End user")
System(orderSystem, "Order Platform", "Handles intake")
System_Ext(payment, "Payment Gateway", "External processor")
Rel(customer, orderSystem, "Places orders")
Rel(orderSystem, payment, "Charges card")
@enduml`;

const host = document.body.appendChild(document.createElement("div"));

// 1. First run — auto-layout, snapshot the text.
const e1 = createEditor(host, { diagramType: "c4-context" });
await e1.loadFromText(seed);
await e1.runAutoLayout();
const saved = e1.exportText();
e1.destroy();

// `saved` now contains a meta line like:
//   ' @drawer:meta {"layoutOverrides":{"019e882d-7aff-...":{"x":12,"y":12}, ...}}
console.log(saved);

// 2. Second run — load the just-saved text into a fresh editor.
host.innerHTML = "";
const e2 = createEditor(host, { diagramType: "c4-context" });
await e2.loadFromText(saved);

// Expected: nodes positioned at the saved (x, y).
// Actual: parser allocates *new* UUIDs for `customer` / `orderSystem` /
// `payment`. The override-keys from `saved` are stale UUIDs from the
// first run. `withLayoutOverrides` passes the stale map straight into
// `rendererOptions.coordinates`; the renderer hits no match and emits
// `transform="translate(0, 0)"` for every node.

for (const n of e2.getState().nodes) {
  console.log(n.id, n.alias);
}
//   019e8885-5656-7734-b97d-a8608725e586 customer   <- NEW uuid
//   019e8885-5656-78bb-a12e-6483ee7e00c0 orderSystem
//   019e8885-5656-7330-ba60-91ffd5b1b271 payment
//
// override-keys in saved: 019e882d-...   <- OLD uuids (don't intersect)
```

## Root cause

Two files combine to break the round-trip:

- `packages/core/src/generator/format.ts:formatDiagramMeta` writes
  `layoutOverrides` as-is (UUID-keyed).
- `packages/core/src/parser/context.ts:resolveAlias` always calls
  `ctx.idFactory()` for first-seen aliases — UUIDv7 in production.
  The PlantUML alias (`customer`) is preserved on `node.alias`, but the
  meta payload's keys aren't remapped to it.

`packages/core/src/editor/createEditor.ts:withLayoutOverrides` then
passes `metadata.layoutOverrides` directly into `rendererOptions.coordinates`,
so the renderer's `coordinates[node.id]` lookup silently misses.

## Proposed fix (pick one)

### Option A — alias-keyed meta payload (recommended)

Emit `layoutOverrides` keyed by `node.alias ?? sanitizedId(node.id)` in
`formatDiagramMeta`, and remap parser-side: when meta arrives before any
node line, stash it in `ctx.pendingLayoutOverrides`; when an alias is
resolved (or the parse ends), translate keys via `ctx.aliases`. Aliases
are user-controlled and stable across parses, so the round-trip becomes
deterministic.

Pros: symbolic, human-readable, survives manual edits.
Cons: aliases can collide if two nodes share one (already an error in
other parts of the validator, so the constraint is fine to enforce).

### Option B — preserve UUIDs across parses

Hash the alias (or its position in source) into a stable UUIDv5 instead
of allocating a fresh UUIDv7. The id factory becomes a content-based
function. Drawback: any rename in the PlantUML source orphans the
override anyway, and id stability for re-renders inside a single session
already worked — this would only help round-trip.

### Option C — translation step at load time

Keep generator emission UUID-keyed, but inside the parser's `finalize`
step, walk `metadata.layoutOverrides` and remap each key by looking up
the original alias from a side-table (`reverseAliases: Map<oldId, alias>`)
that the generator emits alongside, e.g.:

```
' @drawer:meta {"aliases":{"019e882d-...":"customer"},"layoutOverrides":{"019e882d-...":{...}}}
```

Then the parser uses `aliases[oldId]` to find the alias, and
`ctx.aliases.get(alias)` to remap to the new id. Backward-compatible
(falls back to current behavior when `aliases` is absent), but a bit
verbose on the wire.

## Workaround used by downstream consumers

Run `editor.runAutoLayout()` on every load whenever
`Object.keys(metadata.layoutOverrides).every((k) => !nodeIds.has(k))`.
This restores visible positions at the cost of dropping the user's
manual coordinates between sessions.

## Affected

- All diagram types — the AST id is global to the model, not type-specific.
- Reproduced on `@uml-drawer/core@0.1.0` and `@uml-drawer/react@0.1.0`
  (the React adapter's `UmlEditor.autoLayoutOnLoad` skips auto-layout
  when `layoutOverrides` is non-empty, even when none of the keys match).

## Environment

- Node 22 / pnpm 10
- Consumer: Next.js 15 + React 19 SPA persisting `editor.exportText()` to a
  backend on every change.

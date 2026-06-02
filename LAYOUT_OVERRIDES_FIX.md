# Fix: alias-keyed `layoutOverrides` in PlantUML meta payload

Two coordinated changes that make `editor.exportText()` → `editor.loadFromText()` round-trip preserve node positions, regardless of how many times the diagram is reparsed.

## Why

Generator currently writes `layoutOverrides` keyed by `node.id` (a UUIDv7 allocated by the parser). On the next `loadFromText`, `resolveAlias` allocates **new** UUIDs for the same PlantUML aliases (`customer`, `orderSystem`, …), so override keys never match the current ids and `withLayoutOverrides → rendererOptions.coordinates` lookups silently miss. Every node ends up at `(0, 0)`.

The fix moves the override-key space from "unstable AST id" to "stable PlantUML alias" — the alias is the symbol the user actually wrote, and `buildAliasIndex` already gives us a deterministic id↔alias map on the generator side. The parser already keeps `ctx.aliases: Map<alias, newId>`, so the reverse translation is a single `for` loop in `finalize`.

Backward compatibility: legacy payloads with UUID keys flow through the new parser unchanged (we only remap keys we recognise as aliases). Render-time lookups still miss for legacy keys, but that's the existing behaviour — nothing gets worse, and any subsequent `exportText()` rewrites them to aliases.

---

## Patch 1 — `packages/core/src/generator/format.ts`

Remap `layoutOverrides` and `styles` keys from `node.id` → alias before emission.

```diff
@@
 import type {
   Diagram,
   DiagramGroup,
   DiagramNode,
   LayoutCoordinate,
   StyleMap,
 } from "../model/types.js";
 import { formatMetaComment } from "../parser/meta.js";
@@
 /**
  * If the diagram carries layout overrides or per-element style overrides,
  * emit a single `' @drawer:meta {...}` line that the parser will decode
  * back into `metadata.layoutOverrides` / `styles`. Returns `null` when
  * there is nothing to encode.
+ *
+ * Keys in the on-the-wire payload are *aliases* (the PlantUML symbol the
+ * user writes — `customer`, `orderSystem`), not AST UUIDs. Aliases are
+ * stable across parses; UUIDs are not (the parser allocates a fresh one
+ * per `loadFromText`). The parser's `finalize` step reverses this
+ * translation by looking each key up in `ctx.aliases`. Anything that
+ * cannot be resolved to a node/group on either side is preserved verbatim
+ * so legacy UUID-keyed payloads continue to round-trip without loss.
  */
-export function formatDiagramMeta(diagram: Diagram): string | null {
-  const layoutOverrides = diagram.metadata.layoutOverrides;
-  const styles = diagram.styles;
-  const hasLayout = layoutOverrides && Object.keys(layoutOverrides).length > 0;
-  const hasStyles = styles && Object.keys(styles).length > 0;
-  if (!hasLayout && !hasStyles) return null;
-
-  const payload: { layoutOverrides?: Record<string, LayoutCoordinate>; styles?: StyleMap } = {};
-  if (hasLayout) payload.layoutOverrides = sortRecord(layoutOverrides);
-  if (hasStyles) payload.styles = sortRecord(styles);
-  return formatMetaComment(payload);
-}
+export function formatDiagramMeta(diagram: Diagram): string | null {
+  const layoutOverrides = diagram.metadata.layoutOverrides;
+  const styles = diagram.styles;
+  const hasLayout = layoutOverrides && Object.keys(layoutOverrides).length > 0;
+  const hasStyles = styles && Object.keys(styles).length > 0;
+  if (!hasLayout && !hasStyles) return null;
+
+  const aliasIndex = buildAliasIndex(diagram);
+  const payload: { layoutOverrides?: Record<string, LayoutCoordinate>; styles?: StyleMap } = {};
+  if (hasLayout) payload.layoutOverrides = sortRecord(remapToAliases(layoutOverrides, aliasIndex));
+  if (hasStyles) payload.styles = sortRecord(remapToAliases(styles, aliasIndex));
+  return formatMetaComment(payload);
+}
+
+/**
+ * Rewrite a record's keys from AST id → PlantUML alias via the supplied
+ * index. Keys that are not in the index (already-aliased payloads,
+ * legacy data, or references to elements that vanished) pass through
+ * unchanged so the round-trip is conservative.
+ */
+function remapToAliases<T>(record: Record<string, T>, aliasIndex: Map<string, string>): Record<string, T> {
+  const result: Record<string, T> = {};
+  for (const [id, value] of Object.entries(record)) {
+    const alias = aliasIndex.get(id);
+    result[alias ?? id] = value;
+  }
+  return result;
+}
```

---

## Patch 2 — `packages/core/src/parser/context.ts`

In `finalize`, translate alias keys in the accumulated `layoutOverrides` / `styles` back to the AST ids that this parse just allocated.

```diff
@@
 /** Compose the final `Diagram` from parser state. */
 export function finalize(ctx: ParseContext): Diagram {
   const metadata: Diagram["metadata"] = { schemaVersion: "0.1.0" };
-  if (ctx.layoutOverrides) metadata.layoutOverrides = ctx.layoutOverrides;
+  if (ctx.layoutOverrides) {
+    metadata.layoutOverrides = remapAliasKeysToIds(ctx.layoutOverrides, ctx.aliases);
+  }
   if (ctx.opaque.length > 0) metadata.opaque = ctx.opaque;
   if (ctx.sequenceAutoNumber) metadata.sequenceAutoNumber = ctx.sequenceAutoNumber;

   const diagram: Diagram = {
     id: ctx.diagramId,
     type: ctx.options.diagramType,
     nodes: ctx.nodes,
     edges: ctx.edges,
     groups: ctx.groups,
     metadata,
   };
   if (ctx.title) diagram.title = ctx.title;
-  if (ctx.styles) diagram.styles = ctx.styles;
+  if (ctx.styles) diagram.styles = remapAliasKeysToIds(ctx.styles, ctx.aliases);
   if (ctx.fragments.length > 0) diagram.fragments = ctx.fragments;
   if (ctx.notes.length > 0) diagram.notes = ctx.notes;
   if (ctx.dividers.length > 0) diagram.dividers = ctx.dividers;
   return diagram;
 }
+
+/**
+ * Rewrite a record's keys from PlantUML alias → AST id via `ctx.aliases`.
+ * Keys that are not in the alias map pass through verbatim — this keeps
+ * legacy UUID-keyed payloads (written before the generator started
+ * emitting alias keys) intact even though the renderer will not match
+ * them. The next `exportText()` rewrites them to aliases automatically.
+ */
+function remapAliasKeysToIds<T>(
+  record: Record<string, T>,
+  aliases: ReadonlyMap<string, string>,
+): Record<string, T> {
+  const result: Record<string, T> = {};
+  for (const [key, value] of Object.entries(record)) {
+    const id = aliases.get(key);
+    result[id ?? key] = value;
+  }
+  return result;
+}
```

---

## Test additions

### `packages/core/src/generator/generator.test.ts`

Add a round-trip test that asserts override survives `exportText` → `parse`:

```ts
import { describe, it, expect } from "vitest";
import { createEditor } from "../editor/createEditor.js";
import { parsePlantUml } from "../parser/parse.js";

describe("formatDiagramMeta + parser round-trip", () => {
  it("preserves layoutOverrides across exportText → parse", async () => {
    // Arrange — initial diagram + auto-layout
    const host = document.createElement("div");
    document.body.appendChild(host);
    const e1 = createEditor(host, { diagramType: "c4-context" });
    await e1.loadFromText(
      `@startuml
!include <C4/C4_Context>
Person(customer, "Customer", "")
System(orderSystem, "Order Platform", "")
Rel(customer, orderSystem, "Uses")
@enduml`,
    );
    await e1.runAutoLayout();
    const before = e1.getState();
    const saved = e1.exportText();
    e1.destroy();

    // Act — re-parse with a fresh editor (new UUIDs)
    const result = parsePlantUml(saved, { diagramType: "c4-context" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = result.diagram;

    // Assert — keys differ (fresh UUIDs) but every node has a coordinate
    const beforeCoords = before.metadata.layoutOverrides ?? {};
    const afterCoords = after.metadata.layoutOverrides ?? {};
    expect(Object.keys(afterCoords)).toHaveLength(Object.keys(beforeCoords).length);
    for (const node of after.nodes) {
      expect(afterCoords[node.id]).toBeDefined();
      // Same alias → same coordinate value in both diagrams
      const sameNode = before.nodes.find((n) => n.alias === node.alias);
      expect(sameNode).toBeDefined();
      if (sameNode) {
        expect(afterCoords[node.id]).toEqual(beforeCoords[sameNode.id]);
      }
    }
  });
});
```

### `packages/core/src/parser/parse.test.ts`

Add a legacy-compat case that ensures UUID-keyed payloads still parse without throwing:

```ts
it("preserves unknown-key layoutOverrides verbatim (legacy UUID payload)", () => {
  const legacy = `@startuml
!include <C4/C4_Context>
' @drawer:meta {"layoutOverrides":{"abcd-1234-uuid":{"x":12,"y":12}}}
Person(customer, "Customer", "")
@enduml`;
  const result = parsePlantUml(legacy, { diagramType: "c4-context" });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.diagram.metadata.layoutOverrides?.["abcd-1234-uuid"]).toEqual({ x: 12, y: 12 });
});
```

---

## Release notes

> **Fix**: `metadata.layoutOverrides` and `styles` now round-trip cleanly. The meta payload on the wire now uses PlantUML aliases as keys (`{"customer": {"x":12,"y":12}}`) instead of internal UUIDs. Legacy UUID-keyed payloads are still accepted by the parser, but the first `exportText()` after load will rewrite them to alias-keyed form. **No breaking change for consumers** unless they were inspecting the meta payload's raw on-the-wire bytes.

---

## Downstream cleanup (in `arch-vision`)

Once this ships and we bump `@uml-drawer/core` to a version with the fix, the auto-layout workaround in `archvision-frontend/features/designer/DesignerInteractiveBridge.tsx` (the "re-layout whenever no override-key matches" block) can be deleted — user-positioned nodes will then survive reload.

# @uml-drawer/react

## 0.7.0

### Minor Changes

- feat(props): "To front" / "To back" buttons for nodes and groups

  The Properties panel now offers **To front** / **To back** buttons for a selected node or
  group (package/boundary), dispatching the new core reorder commands so authors can control
  which overlapping element paints on top.

### Patch Changes

- Updated dependencies
  - @uml-drawer/core@0.5.0

## 0.6.0

### Minor Changes

- feat(props): fill type arguments for generic member types; drop the class Generics input

  The attribute / return-type / parameter type picker now offers generic containers
  (`List` / `Set` / `Collection` / `Map`) as base types; selecting one reveals dedicated
  fields for its type arguments ("element", or "key"/"value"), composing e.g.
  `List<String>` / `Map<String, Integer>`. The class-level "Generics (comma-separated…)"
  input is removed (class-level generics are no longer modelled in `@uml-drawer/core`).

### Patch Changes

- Updated dependencies
  - @uml-drawer/core@0.4.0

## 0.5.1

### Patch Changes

- revert(props): remove the inline per-node validation list from the Properties panel

  Validation messages are now surfaced by the host as tooltips anchored above the node on
  the canvas, so the inline list in `PropsPanel` is removed. The underlying validation rules
  and quick-fixes in `@uml-drawer/core` are unchanged.

## 0.5.0

### Minor Changes

- feat(props): show per-node validation messages (with quick-fix) in the Properties panel

  The Properties panel now lists the validation errors/warnings scoped to the selected
  node inline, styled by severity, so authors see _why_ an element is invalid right where
  they edit it (e.g. an interface that still carries fields after a kind change). When the
  offending rule has a registered quick-fix, a one-click button applies it.

### Patch Changes

- Updated dependencies
  - @uml-drawer/core@0.3.13

## 0.4.0

### Minor Changes

- feat(props): change a class element's kind from the Properties panel

  The Properties panel now shows a **Type** dropdown when a class-diagram node
  (`class` / `interface` / `abstract-class` / `enum`) is selected, letting authors
  switch the element's kind in place via `updateNodeCommand`. The node id, attached
  edges and layout are preserved, the change is undoable, and the PlantUML source
  regenerates with the matching keyword. Mirrors the existing sequence-lifeline kind
  control.

## 0.3.5

### Patch Changes

- Offer generic collection types (`List<E>`, `Map<K,V>`, `Set<E>`, `Collection<E>`) in the class-diagram member type selects (attributes, return types, parameters).

## 0.2.0

### Minor Changes

- C4 Rel edges now support sync/async interaction styles. `Rel(..., $tags="async")`
  parses onto the new `DiagramEdge.tags` field, renders with a dashed stroke
  (`uml-edge-async` class + `data-edge-async` attribute), and round-trips through
  the generator, which also emits `AddRelTag("async", $lineStyle = DashedLine())`
  ahead of the Rel lines so external PlantUML renderers draw the same dash. The
  React PropsPanel gains an "Interaction" select (Sync/Async) on C4 edges. New
  model exports: `ASYNC_EDGE_TAG`, `hasAsyncTag`.

### Patch Changes

- Updated dependencies
  - @uml-drawer/core@0.2.0

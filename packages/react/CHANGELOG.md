# @uml-drawer/react

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

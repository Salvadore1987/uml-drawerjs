# @uml-drawer/core

## 0.5.0

### Minor Changes

- feat(commands): add reorderNodeCommand / reorderGroupCommand (bring to front / send to back)

  New commands move a node or group to the front (end) or back (start) of the paint order by
  reordering `diagram.nodes` / `diagram.groups`. A packaged node or nested group is also
  reordered within its parent's `children`, so the z-order change round-trips through the
  generated PlantUML (package members emit in `children` order). Undoable via the captured
  before/after arrays.

## 0.4.1

### Patch Changes

- fix(validators): scope the duplicate-node-label lint to the package (group)

  `LINT_DUPLICATE_LABEL` counted node labels across the whole diagram, so two distinct
  classes with the same simple name in different packages (e.g. a `dto` record and a `domain`
  `@Embeddable` both named `DeliveryAddress`) raised a false-positive warning. The check is
  now scoped to a node's parent group: collisions are flagged only within the same package,
  or among top-level nodes.

## 0.4.0

### Minor Changes

- remove class-level generic type parameters (`DiagramNode.generics`)

  The class-level generics feature (`class Box<T>`) is removed end-to-end: the model field,
  JSON/Zod schemas, generator, renderer, and the enum/entity generics validators no longer
  reference it. The parser stays tolerant — legacy `class Box<T>` source still parses (the
  `<…>` is ignored, no error) so existing diagrams keep opening. Member-level generic types
  (e.g. `field: List<String>`) are unaffected — they remain free-form type strings.

## 0.3.13

### Patch Changes

- fix(validators): flag interfaces that declare fields (attributes)

  `enforceClassMemberRules` now emits `CONSTRAINT_CLASS_INTERFACE_HAS_ATTRIBUTES`
  when an `interface` node carries `attributes` — interfaces define only operations.
  This catches the common case of switching a `class` to an `interface` while it still
  holds (private) fields. A quick-fix ("Remove fields from interface") that clears the
  attributes is registered for the new code.

## 0.3.12

### Patch Changes

- fix(parser): accept `@` and other punctuation in class/package stereotypes

  The class `NODE_DECL` and `PACKAGE_DECL` stereotype groups only matched
  `[\w-]+`, so annotation-style stereotypes the generator happily emits — e.g.
  `<<@RestController>>`, `<<@Entity>>`, `<<@Repository>>` — failed the line match
  and the node was **silently dropped on reparse** (broken round-trip). The
  stereotype now captures any text inside `<<…>>`, so Spring/JPA-annotation
  stereotypes survive a save → reload cycle.

## 0.3.11

### Patch Changes

- Render a circled-letter kind spot (C / I / A / E) in the header of class-diagram nodes (`class`, `interface`, `abstract-class`, `enum`) so the element kind is distinguishable at a glance.

## 0.2.0

### Minor Changes

- C4 Rel edges now support sync/async interaction styles. `Rel(..., $tags="async")`
  parses onto the new `DiagramEdge.tags` field, renders with a dashed stroke
  (`uml-edge-async` class + `data-edge-async` attribute), and round-trips through
  the generator, which also emits `AddRelTag("async", $lineStyle = DashedLine())`
  ahead of the Rel lines so external PlantUML renderers draw the same dash. The
  React PropsPanel gains an "Interaction" select (Sync/Async) on C4 edges. New
  model exports: `ASYNC_EDGE_TAG`, `hasAsyncTag`.

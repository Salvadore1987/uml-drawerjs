# ADR-0008 — Class diagram: per-end edge endpoint shape

- **Status:** Accepted
- **Date:** 2026-05-10
- **Authors:** UML Drawer JS contributors
- **Phase:** 4 / 5 (Class-diagram parser, generator, renderer)

## Context

Classic UML class diagrams attach **role**, **multiplicity**, and **navigability** to _each_ end of an association independently:

```
Account "1" --> "0..*" Transaction : holds
        ^role+mult       ^role+mult        ^label
```

The pre-existing AST shape on `DiagramEdge` was:

```ts
interface EdgeCardinality {
  source?: string;
  target?: string;
}
interface DiagramEdge {
  // …
  cardinality?: EdgeCardinality;
}
```

— flat strings, multiplicity only, no role, no navigability. Extending this in place would require a stew of optional flat fields (`sourceRole?`, `sourceNavigability?`, `targetRole?`, `targetMultiplicity?`, …) that don't compose well.

## Decision

Add a nested **`ends?: { source?: EdgeEndpoint; target?: EdgeEndpoint }`** to `DiagramEdge`, where:

```ts
interface EdgeEndpoint {
  role?: string;
  multiplicity?: string;
  navigability?: "navigable" | "non-navigable" | "unspecified";
}
```

Class diagrams emit `ends` and never `cardinality`. ER diagrams keep using `cardinality` (flat strings already model their needs). The generator and renderer pick whichever is set.

## Consequences

### Pros

- Mirrors UML's `AssociationEnd` metaclass — extensible without touching every existing field.
- New per-end attributes (e.g. arrowhead override, ordering, qualifier expression) plug into `EdgeEndpoint` without breaking the call sites that consume `ends.source` / `ends.target`.
- Generator and renderer can dispatch on `edge.ends` vs `edge.cardinality` cleanly; the legacy ER path is untouched.
- Round-trip is loss-free: per-end multiplicity strings parse from `Foo "1" --> "0..*" Bar`, generate back to the same form.

### Cons

- Two ways to express endpoint metadata coexist (`ends` for class, `cardinality` for ER). Documentation must call out which to use per diagram type.
- A future migration that unifies them (drop `cardinality`, lift ER onto `ends`) means a schema-version bump. Tracked as a follow-up; not blocking.

### Followups

- When a third diagram type needs per-end fields, prefer `ends` and migrate ER off `cardinality` in the same PR.
- Add a renderer for the navigability arrow (open arrow vs. cross) once we model the Code-level "non-navigable" semantics. Currently `navigability: "navigable"` is rendered with the standard arrowhead and the others fall back to no arrow override.

# ADR-0007 — Class diagram: enum literals as a dedicated AST field

- **Status:** Accepted
- **Date:** 2026-05-10
- **Authors:** UML Drawer JS contributors
- **Phase:** 4 / 5 (Class-diagram parser, generator, renderer)

## Context

When extending the Class diagram to classic UML semantics, enum bodies needed an AST representation. PlantUML lets authors write:

```
enum AccountStatus {
  ACTIVE
  FROZEN
  CLOSED
}
```

Two reasonable AST shapes were considered:

1. **Reuse `attributes[]`** with a `«literal»` stereotype on each entry.
2. **Add a dedicated `enumLiterals[]` field** on `DiagramNode`, only meaningful when `kind === "enum"`.

UML treats enum literals as a distinct metaclass (`EnumerationLiteral`), not as attributes — they don't have visibility, type, multiplicity, or default value. A literal is a _symbolic constant_, not a field.

## Decision

Add **`enumLiterals?: EnumLiteral[]`** to `DiagramNode`. `EnumLiteral` carries `id` and `name` only.

```ts
interface EnumLiteral {
  id: string;
  name: string;
}
```

The validator (Phase 6) hard-errors on `enum.attributes` and `enum.operations` (codes `CONSTRAINT_CLASS_ENUM_HAS_ATTRIBUTES`, `CONSTRAINT_CLASS_ENUM_HAS_OPERATIONS`). The renderer dispatches enum bodies on this field (no visibility marker, no type column).

## Consequences

### Pros

- Mirrors UML's `EnumerationLiteral` metaclass; no shoe-horning.
- Simplifies the validator: any presence of `attributes` on an enum is a hard error, not a stereotype-string match that could be bypassed.
- Renderer code path is clean — enum literals get plain rows; class members get the visibility-marker / type / multiplicity formatting.
- Round-trip with the parser and generator is loss-free without stereotype gymnastics.

### Cons

- Adds one more optional field to `DiagramNode` (one line in `types.ts` and the JSON schema).
- Authors who want to attach metadata to a literal (deprecated tag, doc comment) currently can't — out of scope for the MVP. If demand surfaces, extend `EnumLiteral` rather than collapsing back into `attributes`.

### Followups

- If enum literals need to carry payload values (Java / Kotlin / Swift `enum class`), revisit by adding `value?: string` to `EnumLiteral` rather than reusing `Attribute.default`.

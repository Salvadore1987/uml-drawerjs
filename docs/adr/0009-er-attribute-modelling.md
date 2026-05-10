# ADR-0009 — ER diagram: attribute modelling and notation

- **Status:** Accepted
- **Date:** 2026-05-10
- **Authors:** UML Drawer JS contributors
- **Phase:** 4 / 5 (ER-diagram parser, generator, renderer, props panel)

## Context

Up to this phase, ER diagrams could only declare entities and crow's-foot relationships — the parser silently dropped anything between an entity's `{` and `}`, the generator emitted single-line `entity Foo`, and the props panel had no member editor. The `Attribute` type already carries `primaryKey`, `foreignKey`, and `nullable` flags, but they were unreachable from PlantUML round-trip and from the UI.

The goal: bring entity attributes to feature parity with class members, but constrained to the ER subset (no methods, no generics, no enum literals) and rendered in **UML / IE notation**:

```
┌─ Customer ────────────┐
│ _id_ : UUID           │  ← PK underlined
│ + tenant_id : UUID    │  ← FK with `+`
│ email : String        │  ← nullable
│ name : String         │  ← required (bold)
└───────────────────────┘
```

Two design choices needed pinning down before code:

1. **AST shape** — should ER columns reuse `Attribute`, or get a separate `EntityColumn` type?
2. **Visual marker style** — UML standard (PK underline, FK `+` prefix, NN bold) versus the previous `[PK,FK,NN]` flag suffix.

## Decision

### 1. Reuse `Attribute` for entity columns.

Class diagrams and ER diagrams share the unified `DiagramNode` shape, and `Attribute` already exposes the three flags ER needs (`primaryKey`, `foreignKey`, `nullable`). Splitting into a parallel `EntityColumn` type would duplicate name / type / default / id without adding semantic value, and would break the single-table `attributes?: Attribute[]` view shared with the renderer.

The flags are **kind-aware**:

- On `kind === "entity"`: `readonly` and `static` are ignored (class-only); `primaryKey`, `foreignKey`, `nullable` are honoured.
- On class-like kinds (`class`, `interface`, `abstract-class`, `enum`): `readonly` and `static` are honoured; `primaryKey`, `foreignKey`, `nullable` are ignored by the renderer / generator (but preserved on the AST so a user re-typing a class as an entity in the props panel doesn't lose data).

### 2. UML / IE notation in the canvas; `[PK,FK,NN]` flags retired.

PlantUML / IE syntax for the body:

```
entity Customer {
  * id : UUID                    -- PK marker `*`, implies NN
  + customer_id : UUID           -- FK marker `+`
  email : String <<NN>>          -- explicit NOT NULL via stereotype
  name : String                  -- nullable (default)
  total : Decimal = 0            -- default value supported
}
```

Renderer:

- PK → name `<tspan>` carries `text-decoration: var(--uml-entity-pk-decoration, underline)`.
- FK (and not also PK) → literal `+ ` prefix on the row.
- NN / required (including PK) → name `<tspan>` carries `font-weight: var(--uml-entity-required-weight, 600)`.
- Type segment after `: ` is always plain (no underline / no bold).

The previous suffix `[PK,FK,NN]` is removed from `formatAttribute` because it diverged from the canonical UML profile and didn't communicate underline / weight visually.

### 3. Per-end cardinality is editable.

The props panel renders two `<select>` dropdowns (Source / Target cardinality) for ER edges. Allowed tokens: `1`, `0..1`, `0..*`, `1..*`. When either side changes, the panel auto-derives `edge.kind` — the generator picks the arrow shape (`||--||`, `||--o{`, `}o--o{`) from `kind`, so the PlantUML output stays in lockstep.

## Consequences

### Pros

- Single attribute editor pattern across class and ER (via `ClassMembersEditor` / `EntityMembersEditor`), reusing `omit()` and `replace()` helpers.
- Generator round-trip is loss-free for entity bodies; PK / FK / NN survive `parse → generate → parse`.
- UML/IE notation matches the c4model.com Code-level visual conventions used in the rest of the project.
- New `--uml-entity-*` theme tokens are aliased onto `--uml-class-*` defaults, so skins inherit a consistent look until they override.

### Cons

- ER carries class-only flags (`readonly`, `static`) on `Attribute` even though it ignores them. A future strict-mode validator could surface "unused field" warnings; until then, the AST remains tolerant.
- PK / FK / NN flags are not part of PlantUML's pure `entity` syntax — `<<NN>>` is our convention. The parser also reads `<<not null>>` for ergonomics. Other PlantUML tools may not recognise `<<NN>>` and will treat it as opaque text — acceptable per ADR-0003 (PlantUML subset for MVP).
- Cardinality strings are stored on `edge.cardinality` only; PlantUML serialises through arrow shape, so authors who type non-canonical cardinality (e.g. `0..*` on the source of `||--o{`) lose the asymmetry on round-trip. Callers that need exact preservation can disable the auto-derivation later.

### Followups

- Identifying vs non-identifying relationship (dashed line) — needs a new `edge.style` flag; not in MVP scope.
- Weak entity (double border) — needs a `node.weakEntity?: boolean` flag; not requested for MVP.
- Composite / derived attributes — out of scope per the spec.

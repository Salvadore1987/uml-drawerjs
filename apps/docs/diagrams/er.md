# Entity Relationship diagrams

Database-style ER notation. Entities + crow's-foot relationships + UML/IE attribute notation per [ADR-0009](https://github.com/Salvadore1987/uml-drawerjs/blob/main/docs/adr/0009-er-attribute-modelling.md).

## Supported PlantUML subset

| Construct    | Example                 | AST                                                                  |
| ------------ | ----------------------- | -------------------------------------------------------------------- |
| Entity       | `entity User`           | `NodeKind: "entity"`                                                 |
| Entity alias | `entity User as U`      | Same, with `node.alias = "U"`                                        |
| 1 — 1        | `A \|\|--\|\| B`        | `EdgeKind: "one-to-one"`, cardinality `{ source: "1", target: "1" }` |
| 1 — many     | `A \|\|--o{ B`          | `EdgeKind: "one-to-many"`, cardinality `{ "1", "0..*" }`             |
| many — 1     | `A }o--\|\| B`          | `EdgeKind: "one-to-many"`, cardinality flipped                       |
| many — many  | `A }o--o{ B`            | `EdgeKind: "many-to-many"`                                           |
| Edge label   | `A \|\|--o{ B : places` | `edge.label = "places"`                                              |

## Attribute bodies

```text
entity Customer {
  * id : UUID                  -- PK marker `*`, implies NOT NULL
  + tenant_id : UUID           -- FK marker `+`
  email : String <<NN>>        -- explicit NOT NULL
  name : String                -- nullable (default)
  total : Decimal = 0          -- default value
}
```

Stored on `node.attributes[]` (reusing the same `Attribute` shape as class members). ER honours `primaryKey`, `foreignKey`, `nullable`; class-only flags (`readonly`, `static`) are kept on the AST but ignored by the ER renderer and generator.

The parser also accepts `<<not null>>` as a synonym for `<<NN>>`.

### Renderer (UML / IE notation)

- **PK** → name `<tspan>` carries `text-decoration: underline` via `--uml-entity-pk-decoration`.
- **FK** (and not also PK) → literal `+ ` prefix on the row.
- **NOT NULL** (including PK) → name `<tspan>` carries `font-weight: 600` via `--uml-entity-required-weight`.

The legacy `[PK,FK,NN]` suffix has been retired — UML/IE expresses the same information through underline / weight / prefix.

## Per-end cardinality

`<PropsPanel>` exposes two `<select>` dropdowns (Source / Target cardinality) per edge. Allowed tokens: `1`, `0..1`, `0..*`, `1..*`. When either side changes, the panel auto-derives `edge.kind` and the generator picks the matching crow's-foot arrow (`||--||`, `||--o{`, `}o--o{`).

## Validators specific to ER

- **Edge endpoints** — both source and target must be `entity` nodes (`CONSTRAINT_ER_EDGE_NON_ENTITY`).
- **Cardinality required** — every edge must declare both `source` and `target` cardinalities (`CONSTRAINT_ER_CARDINALITY_MISSING`).
- **Cardinality token validation** — must match `1 | 0..1 | 0..* | 1..* | * | n..m` (`CONSTRAINT_ER_CARDINALITY_INVALID`).

## Sample

```text
@startuml
title Banking Domain — ER

entity User {
  * id : UUID
  email : String <<NN>>
  name : String
  created_at : Timestamp
}

entity Account {
  * id : UUID
  + user_id : UUID
  balance : Decimal = 0
  status : String <<NN>>
}

entity Transaction {
  * id : UUID
  + account_id : UUID
  amount : Decimal <<NN>>
  posted_at : Timestamp
}

entity Card {
  * id : UUID
  + account_id : UUID
  last4 : String
  expires_at : Date
}

User ||--o{ Account : owns
Account ||--o{ Transaction : posts
Account ||--o{ Card : issues
@enduml
```

Open in the [Playground](/playground/) → **Entity Relationship**.

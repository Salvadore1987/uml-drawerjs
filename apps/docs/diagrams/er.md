# Entity Relationship diagrams

Database-style ER notation. Entities + cardinalities — column-level attributes are not yet modelled (they round-trip via `metadata.opaque`).

## Supported PlantUML subset

| Construct    | Example                 | AST                                                                  |
| ------------ | ----------------------- | -------------------------------------------------------------------- |
| Entity       | `entity User`           | `NodeKind: "entity"`                                                 |
| Entity alias | `entity User as U`      | Same, with `node.id` derived from the alias                          |
| 1 — 1        | `A \|\|--\|\| B`        | `EdgeKind: "one-to-one"`, cardinality `{ source: "1", target: "1" }` |
| 1 — many     | `A \|\|--o{ B`          | `EdgeKind: "one-to-many"`, cardinality `{ "1", "0..*" }`             |
| many — 1     | `A }o--\|\| B`          | `EdgeKind: "one-to-many"`, cardinality flipped                       |
| many — many  | `A }o--o{ B`            | `EdgeKind: "many-to-many"`                                           |
| Edge label   | `A \|\|--o{ B : places` | `edge.label = "places"`                                              |

## Validators specific to ER

- **Edge endpoints** — both source and target must be `entity` nodes (`CONSTRAINT_ER_EDGE_NON_ENTITY`).
- **Cardinality required** — every edge must declare both `source` and `target` cardinalities (`CONSTRAINT_ER_CARDINALITY_MISSING`).
- **Cardinality token validation** — must match `1 | 0..1 | 0..* | * | n..m` (`CONSTRAINT_ER_CARDINALITY_INVALID`).

## Sample

```text
@startuml
title Domain — ER

entity User
entity Account
entity Transaction
entity Card

User ||--o{ Account : owns
Account ||--o{ Transaction : posts
Account ||--o{ Card : issues
@enduml
```

Open in the [Playground](/playground/) → **Entity Relationship**.

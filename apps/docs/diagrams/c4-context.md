# C4 Context diagrams

Top-of-the-pyramid view: people interacting with one or more systems, no implementation detail.

## Supported macros

| Macro                                               | AST                                                                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `Person(alias, "label", "description"?)`            | `NodeKind: "person"`                                                                                            |
| `Person_Ext(alias, "label", "description"?)`        | `NodeKind: "person"` (label/description carry the `_Ext` differentiator until follow-up)                        |
| `System(alias, "label", "description"?)`            | `NodeKind: "system"`                                                                                            |
| `System_Ext(alias, "label", "description"?)`        | `NodeKind: "system-external"`                                                                                   |
| `Rel(from, to, "label", "tech"?)` and `Rel_U/D/L/R` | `EdgeKind: "uses"`. Tech rides as a `[tech]` suffix on the label until `DiagramEdge` exposes a dedicated field. |

## Validators specific to C4

- **Kind whitelist** — `person | system | system-external | container | component | database` allowed; `class` / `entity` / `lifeline` rejected with `CONSTRAINT_NODE_KIND_NOT_ALLOWED`.
- **Boundary children** — `System_Boundary` may only contain C4 kinds (`CONSTRAINT_C4_BOUNDARY_CHILD_KIND`). Container-level diagrams add `Container` boundaries, component-level adds `Component`.

## Sample

```text
@startuml
title Online Banking — Context

Person(customer, "Customer", "Personal banking customer")
System(bank, "Internet Banking System", "Allows customers to manage accounts")
System_Ext(mail, "E-mail System", "Sends notifications")

Rel(customer, bank, "Uses")
Rel(bank, mail, "Sends e-mail using")
@enduml
```

Open this in the [Playground](/playground/).

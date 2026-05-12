# C4 Context diagrams

Top-of-the-pyramid view: people interacting with one or more systems, no implementation detail. UML Drawer JS supports the full [c4model.com](https://c4model.com) PlantUML standard library at this level.

## Supported macros

| Macro                                               | AST                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| `Person(alias, "label", "description"?)`            | `NodeKind: "person"`                                              |
| `Person_Ext(alias, "label", "description"?)`        | `NodeKind: "person-external"`                                     |
| `System(alias, "label", "description"?)`            | `NodeKind: "system"`                                              |
| `System_Ext(alias, "label", "description"?)`        | `NodeKind: "system-external"`                                     |
| `SystemDb(alias, "label", "description"?)`          | `NodeKind: "database"`                                            |
| `SystemDb_Ext(alias, "label", "description"?)`      | `NodeKind: "database"` (`external` style)                         |
| `SystemQueue(alias, "label", "description"?)`       | `NodeKind: "queue"`                                               |
| `SystemQueue_Ext(alias, "label", "description"?)`   | `NodeKind: "queue"` (`external` style)                            |
| `Enterprise_Boundary(alias, "label") { … }`         | `GroupKind: "system"`                                             |
| `System_Boundary(alias, "label") { … }`             | `GroupKind: "boundary"`                                           |
| `Boundary(alias, "label") { … }`                    | `GroupKind: "boundary"` (generic)                                 |
| `Rel(from, to, "label", "tech"?)` and `Rel_U/D/L/R` | `EdgeKind: "uses"`. Tech rides as a `[tech]` suffix on the label. |

## Boundary as a first-class element

`System_Boundary` (and friends) lands on the canvas as a draggable / resizable frame. Drag a node inside the frame to add it to `group.children`; drag it out to remove. The Properties panel exposes both `label` (visible header) and `alias` (PlantUML identifier).

## Validators specific to C4

- **Kind whitelist** — `person | person-external | system | system-external | container | container-external | component | component-external | database | queue`; anything else rejected with `CONSTRAINT_NODE_KIND_NOT_ALLOWED`.
- **Boundary children** — `System_Boundary` may only contain C4 kinds (`CONSTRAINT_C4_BOUNDARY_CHILD_KIND`). Container-level diagrams add `Container` boundaries, component-level adds `Component`.

## Sample

```text
@startuml
title Online Banking — Context

Person(customer, "Customer", "Personal banking customer")
Person_Ext(auditor, "External Auditor", "Reviews bank operations")
System(bank, "Internet Banking System", "Allows customers to manage accounts")
System_Ext(mail, "E-mail System", "Sends notifications")
SystemDb(audit_db, "Audit Log", "Stores audit trails")

Rel(customer, bank, "Uses")
Rel(bank, mail, "Sends e-mail using")
Rel(bank, audit_db, "Writes audit events to")
Rel(auditor, audit_db, "Inspects")
@enduml
```

Open this in the [Playground](/playground/).

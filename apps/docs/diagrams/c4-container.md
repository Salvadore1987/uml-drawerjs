# C4 Container diagrams

Zoom-in on a single system: the high-level technology choices, datastores, queues, and interactions between containers. UML Drawer JS supports the full [c4model.com](https://c4model.com) Container-level standard library.

## Supported macros

In addition to every macro from [C4 Context](./c4-context):

| Macro                                                         | AST                              |
| ------------------------------------------------------------- | -------------------------------- |
| `Container(alias, "label", "tech"?, "description"?)`          | `NodeKind: "container"`          |
| `Container_Ext(alias, "label", "tech"?, "description"?)`      | `NodeKind: "container-external"` |
| `ContainerDb(alias, "label", "tech"?, "description"?)`        | `NodeKind: "database"`           |
| `ContainerQueue(alias, "label", "tech"?, "description"?)`     | `NodeKind: "queue"`              |
| `ContainerQueue_Ext(alias, "label", "tech"?, "description"?)` | `NodeKind: "queue"` (external)   |
| `Container_Boundary(alias, "label") { … }`                    | `GroupKind: "boundary"`          |

`tech` rides as a `[tech]` suffix on the rendered node header. The parser stores it on `node.technology` for round-trip integrity.

## Sample

```text
@startuml
title Online Banking — Containers

Person(customer, "Customer", "Personal banking customer")
System_Ext(mail, "E-mail System", "Sends notifications")

System_Boundary(bank, "Internet Banking System") {
  Container(web, "Web App", "JS / SPA", "Delivers static content")
  Container(api, "API", "Java/Spring", "Provides banking functionality")
  ContainerDb(db, "Database", "PostgreSQL", "Stores accounts, transactions")
  ContainerQueue(events, "Domain Events", "Kafka", "Publishes account events")
}

Container_Ext(payments, "Payments Gateway", "REST", "Third-party processor")

Rel(customer, web, "Uses", "HTTPS")
Rel(web, api, "Calls", "JSON/HTTPS")
Rel(api, db, "Reads/Writes", "JDBC")
Rel(api, events, "Publishes to", "Kafka")
Rel(api, payments, "Charges via", "HTTPS")
Rel(api, mail, "Sends notifications via", "SMTP")
@enduml
```

Open this in the [Playground](/playground/) and pick **C4 · Container** from the breadcrumb.

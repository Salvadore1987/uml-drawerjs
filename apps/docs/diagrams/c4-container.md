# C4 Container diagrams

Zoom-in on a single system: the high-level technology choices, datastores, and interactions between containers.

## Supported macros

In addition to every macro from [C4 Context](./c4-context):

| Macro                                                  | AST                     |
| ------------------------------------------------------ | ----------------------- |
| `Container(alias, "label", "tech"?, "description"?)`   | `NodeKind: "container"` |
| `ContainerDb(alias, "label", "tech"?, "description"?)` | `NodeKind: "database"`  |
| `Container_Boundary(alias, "label")`                   | `GroupKind: "boundary"` |

## Sample

```text
@startuml
title Online Banking — Containers

Person(customer, "Customer")
System_Boundary(bank, "Internet Banking System") {
  Container(web, "Web App", "JS / SPA", "Delivers static content")
  Container(api, "API", "Java/Spring", "Provides banking functionality")
  ContainerDb(db, "Database", "PostgreSQL", "Stores accounts, transactions")
}

Rel(customer, web, "Uses", "HTTPS")
Rel(web, api, "Calls", "JSON/HTTPS")
Rel(api, db, "Reads/Writes", "JDBC")
@enduml
```

Open this in the [Playground](/playground/) and pick **C4 · Container** from the breadcrumb.

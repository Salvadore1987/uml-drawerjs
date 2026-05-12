# C4 Component diagrams

The third level of the C4 model: the components that make up a single container, plus the dependencies between them.

## Supported macros

Every macro from [C4 Context](./c4-context) and [C4 Container](./c4-container), plus:

| Macro                                                         | AST                              |
| ------------------------------------------------------------- | -------------------------------- |
| `Component(alias, "label", "tech"?, "description"?)`          | `NodeKind: "component"`          |
| `Component_Ext(alias, "label", "tech"?, "description"?)`      | `NodeKind: "component-external"` |
| `ComponentDb(alias, "label", "tech"?, "description"?)`        | `NodeKind: "database"`           |
| `ComponentQueue(alias, "label", "tech"?, "description"?)`     | `NodeKind: "queue"`              |
| `ComponentQueue_Ext(alias, "label", "tech"?, "description"?)` | `NodeKind: "queue"` (external)   |
| `Container_Boundary(alias, "label") { … }`                    | `GroupKind: "boundary"`          |

## Sample

```text
@startuml
title Online Banking — API Components

Person(customer, "Customer", "Personal banking customer")
ContainerDb(db, "Database", "PostgreSQL", "Stores accounts, transactions")

Container_Boundary(api, "API Application") {
  Component(controller, "Accounts Controller", "Spring MVC", "REST endpoint for accounts")
  Component(security, "Security Component", "Spring", "Authenticates users")
  Component(service, "Account Service", "Spring Bean", "Business rules")
  ComponentDb(repo, "Account Repository", "Spring Data JPA", "Persistence")
  ComponentQueue(events, "Event Publisher", "Kafka", "Publishes domain events")
}

Component_Ext(payments, "Payments Gateway Client", "REST", "Wraps third-party API")

Rel(customer, controller, "Uses", "JSON/HTTPS")
Rel(controller, security, "Uses")
Rel(controller, service, "Uses")
Rel(service, repo, "Reads/Writes")
Rel(service, events, "Publishes to")
Rel(service, payments, "Charges via", "HTTPS")
Rel(repo, db, "Reads/Writes", "JDBC")
@enduml
```

Open in the [Playground](/playground/) → **C4 · Component**.

## Drill-down

Drill-down from a Container into its Components is **out of scope for the MVP**. See [ADR-0005 — drill-down out of scope](https://github.com/Salvadore1987/uml-drawerjs/blob/main/docs/adr/0005-drilldown-out-of-scope.md) for the rationale and the path to enabling it post-1.0.

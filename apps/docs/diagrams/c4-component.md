# C4 Component diagrams

The third level of the C4 model: the components that make up a single container, plus the dependencies between them.

## Supported macros

Every macro from [C4 Context](./c4-context) and [C4 Container](./c4-container), plus:

| Macro                                                  | AST                     |
| ------------------------------------------------------ | ----------------------- |
| `Component(alias, "label", "tech"?, "description"?)`   | `NodeKind: "component"` |
| `ComponentDb(alias, "label", "tech"?, "description"?)` | `NodeKind: "database"`  |

## Sample

```text
@startuml
title Online Banking — Components

Container(api, "API")
Component(controller, "AccountsController", "Spring MVC", "REST endpoint")
Component(service, "AccountService", "Spring Bean", "Business rules")
ComponentDb(repo, "AccountRepository", "Spring Data JPA")

Rel(controller, service, "uses")
Rel(service, repo, "reads / writes")
@enduml
```

Open in the [Playground](/playground/) → **C4 · Component**.

## Drill-down

Drill-down from a Container into its Components is **out of scope for the MVP**. See [ADR-0005 — drill-down out of scope](https://github.com/Salvadore1987/uml-drawerjs/blob/main/docs/adr/0005-drilldown-out-of-scope.md) for the rationale and the path to enabling it post-1.0.

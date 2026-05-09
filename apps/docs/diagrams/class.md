# Class diagrams

PlantUML class diagrams render through the `class` `diagramType`. Use it for object-oriented modelling — classes, interfaces, abstract classes, enums, and the relationships between them.

## Supported PlantUML subset

| Construct      | Example                            | AST                           |
| -------------- | ---------------------------------- | ----------------------------- |
| Class          | `class Foo`                        | `NodeKind: "class"`           |
| Interface      | `interface Foo`                    | `NodeKind: "interface"`       |
| Abstract class | `abstract class Foo`               | `NodeKind: "abstract-class"`  |
| Enum           | `enum Foo`                         | `NodeKind: "enum"`            |
| Stereotype     | `class Foo <<service>>`            | `node.stereotype = "service"` |
| Inheritance    | `Foo --\|> Bar` or `Bar <\|-- Foo` | `EdgeKind: "inheritance"`     |
| Realization    | `Foo ..\|> Bar`                    | `EdgeKind: "realization"`     |
| Composition    | `Foo *-- Bar`                      | `EdgeKind: "composition"`     |
| Aggregation    | `Foo o-- Bar`                      | `EdgeKind: "aggregation"`     |
| Association    | `Foo --> Bar` / `Foo -- Bar`       | `EdgeKind: "association"`     |
| Dependency     | `Foo ..> Bar`                      | `EdgeKind: "dependency"`      |
| Edge label     | `Foo --> Bar : transforms`         | `edge.label = "transforms"`   |

Member blocks (`class Foo { ... }`) are not yet modelled — they round-trip via `metadata.opaque`. See [ADR-0003](https://github.com/Salvadore1987/uml-drawerjs/blob/main/docs/adr/0003-plantuml-subset.md).

## Validators specific to class diagrams

- **Kind whitelist** — only `class`, `interface`, `abstract-class`, `enum`. Anything else flagged `CONSTRAINT_NODE_KIND_NOT_ALLOWED`.
- **Edge kind whitelist** — only the relationships above.
- **Inheritance / realization cycle detection** — `LINT_INHERITANCE_CYCLE` (severity: error). Fixable by removing the offending edge.
- **Empty label** — `SEM_NODE_LABEL_EMPTY` with quick-fix "Set placeholder label".

## Sample

```text
@startuml
title Order Management

class Customer
class Order
class Product
class Invoice

Customer "1" --> "*" Order : places
Order "*" --> "*" Product : contains
Order --> Invoice : produces
@enduml
```

Open this in the [Playground](/playground/) and pick **Class** from the breadcrumb.

## Recipes

- [Headless API — generating a class diagram from your codebase](../recipes/headless)
- [Embedding the editor inside a docs page](../recipes/)

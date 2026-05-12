# Class diagrams

PlantUML class diagrams render through the `class` `diagramType`. Use it for object-oriented modelling — classes, interfaces, abstract classes, enums, generics, packages, and their relationships.

## Supported PlantUML subset

| Construct        | Example                                 | AST                                                                               |
| ---------------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| Class            | `class Foo`                             | `NodeKind: "class"`                                                               |
| Interface        | `interface Foo`                         | `NodeKind: "interface"`                                                           |
| Abstract class   | `abstract class Foo`                    | `NodeKind: "abstract-class"`                                                      |
| Enum             | `enum Foo`                              | `NodeKind: "enum"`                                                                |
| Stereotype       | `class Foo <<service>>`                 | `node.stereotype = "service"`                                                     |
| Generics         | `class Foo<T, K extends Comparable<K>>` | `node.generics = ["T", "K extends Comparable<K>"]`                                |
| Package          | `package "com.bank" { … }`              | `GroupKind: "package"`                                                            |
| Inheritance      | `Foo --\|> Bar` or `Bar <\|-- Foo`      | `EdgeKind: "inheritance"`                                                         |
| Realization      | `Foo ..\|> Bar`                         | `EdgeKind: "realization"`                                                         |
| Composition      | `Foo *-- Bar`                           | `EdgeKind: "composition"`                                                         |
| Aggregation      | `Foo o-- Bar`                           | `EdgeKind: "aggregation"`                                                         |
| Association      | `Foo --> Bar` / `Foo -- Bar`            | `EdgeKind: "association"`                                                         |
| Dependency       | `Foo ..> Bar`                           | `EdgeKind: "dependency"`                                                          |
| Edge label       | `Foo --> Bar : transforms`              | `edge.label = "transforms"`                                                       |
| Per-end notation | `Account "1" --> "0..*" Tx : holds`     | `edge.ends = { source: { multiplicity: "1" }, target: { multiplicity: "0..*" } }` |

## Member bodies

```text
class Account {
  + {readonly} id : UUID
  + balance : Decimal = 0
  - secret : String
  ~ {static} TOTAL_LIMIT : Decimal
  + credit(amount : Decimal) : void
  + {abstract} validate() : Result
}
```

Class member-bodies are fully modelled:

- **Visibility** — `+` public, `-` private, `#` protected, `~` package.
- **Modifiers** — `{static}`, `{abstract}`, `{readonly}` (parser accepts in any order).
- **Multiplicity** — `[0..*]` after the type.
- **Defaults** — `= 0`, `= "foo"`.
- **Enum literals** — stored on `node.enumLiterals[] = [{ id, name }]`, NOT on `attributes` (see [ADR-0007](https://github.com/Salvadore1987/uml-drawerjs/blob/main/docs/adr/0007-class-enum-modelling.md)).
- **Interface methods** are implicitly abstract.
- **`abstract`** modifier is only allowed on `abstract-class` or `interface` operations.

The renderer paints visibility markers, italic for abstract, underline for static, dividers between attribute and operation compartments, and synthetic stereotype badges (`«interface»`, `«abstract»`, `«enum»`) for the corresponding kinds.

## Per-end edge endpoints

Class edges use the nested `ends?: { source?: EdgeEndpoint; target?: EdgeEndpoint }` shape from [ADR-0008](https://github.com/Salvadore1987/uml-drawerjs/blob/main/docs/adr/0008-class-edge-endpoints.md):

```ts
interface EdgeEndpoint {
  role?: string;
  multiplicity?: string;
  navigability?: "navigable" | "non-navigable" | "unspecified";
}
```

The generator emits `Foo "1" --> "0..*" Bar : label` for class edges; ER diagrams keep using the flat `cardinality` shape.

## Validators specific to class diagrams

- **Kind whitelist** — only `class`, `interface`, `abstract-class`, `enum`. Anything else flagged `CONSTRAINT_NODE_KIND_NOT_ALLOWED`.
- **Edge kind whitelist** — only the relationships above.
- **Enum body** — `CONSTRAINT_CLASS_ENUM_HAS_ATTRIBUTES`, `CONSTRAINT_CLASS_ENUM_HAS_OPERATIONS`, `CONSTRAINT_CLASS_ENUM_HAS_GENERICS` hard-error when an enum carries class-only payload.
- **Abstract modifier scope** — `CONSTRAINT_CLASS_ABSTRACT_OUTSIDE_ABSTRACT_OR_INTERFACE`.
- **Inheritance / realization cycle detection** — `LINT_INHERITANCE_CYCLE` (severity: error). Fixable by removing the offending edge.
- **Empty label** — `SEM_NODE_LABEL_EMPTY` with quick-fix "Set placeholder label".

## Sample

```text
@startuml
title Order Management

package "com.shop.billing" {
  abstract class Document {
    + {abstract} validate() : Result
  }

  class Invoice<T> {
    + {readonly} number : String
    + total : Decimal
    + lines : LineItem[]
    + render() : T
  }

  enum Status {
    DRAFT
    ISSUED
    PAID
    VOID
  }

  Document <|-- Invoice
  Invoice "1" --> "*" LineItem : contains
  Invoice --> Status : has
}
@enduml
```

Open this in the [Playground](/playground/) and pick **Class** from the breadcrumb.

## Recipes

- [Headless API — generating a class diagram from your codebase](../recipes/headless)
- [Embedding the editor inside a docs page](../recipes/)

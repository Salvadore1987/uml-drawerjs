import { describe, expect, it } from "vitest";

import { parsePlantUml } from "../parse.js";

/**
 * Counter-based id factory for deterministic snapshots; real parsing uses uuidv7.
 */
function deterministicIds(): () => string {
  let counter = 0;
  return () => `id-${++counter}`;
}

function parseClass(source: string) {
  return parsePlantUml(source, {
    diagramType: "class",
    diagramId: "diag",
    idFactory: deterministicIds(),
  });
}

describe("class member parser", () => {
  it("parses field with visibility, type, modifiers, multiplicity and default", () => {
    // Arrange
    const source = `@startuml
class Account {
  +balance: Decimal [0..1] = 0
  -password: String {readonly}
  {static} +VERSION: String = "1.0"
}
@enduml`;

    // Act
    const { ast, errors } = parseClass(source);

    // Assert
    expect(errors).toEqual([]);
    const account = ast.nodes.find((n) => n.label === "Account");
    expect(account?.attributes).toEqual([
      {
        id: expect.any(String),
        name: "balance",
        visibility: "public",
        type: "Decimal",
        multiplicity: "0..1",
        default: "0",
      },
      {
        id: expect.any(String),
        name: "password",
        visibility: "private",
        type: "String",
        readonly: true,
      },
      {
        id: expect.any(String),
        name: "VERSION",
        visibility: "public",
        type: "String",
        static: true,
        default: '"1.0"',
      },
    ]);
  });

  it("parses methods with visibility, modifiers, parameters with defaults, and return type", () => {
    // Arrange
    const source = `@startuml
abstract class AbstractEntity {
  {abstract} +validate(): void
  {static} +nextId(): String
  +greet(name: String = "world"): String
}
@enduml`;

    // Act
    const { ast, errors } = parseClass(source);

    // Assert
    expect(errors).toEqual([]);
    const entity = ast.nodes.find((n) => n.label === "AbstractEntity");
    expect(entity?.kind).toBe("abstract-class");
    expect(entity?.operations).toEqual([
      {
        id: expect.any(String),
        name: "validate",
        visibility: "public",
        abstract: true,
        returnType: "void",
      },
      {
        id: expect.any(String),
        name: "nextId",
        visibility: "public",
        static: true,
        returnType: "String",
      },
      {
        id: expect.any(String),
        name: "greet",
        visibility: "public",
        parameters: [{ name: "name", type: "String", default: '"world"' }],
        returnType: "String",
      },
    ]);
  });

  it("parses generic parameters on class declarations", () => {
    // Arrange
    const source = `@startuml
interface Repository<T>
class Cache<K, V extends Comparable<V>>
@enduml`;

    // Act
    const { ast, errors } = parseClass(source);

    // Assert
    expect(errors).toEqual([]);
    expect(ast.nodes.find((n) => n.label === "Repository")?.generics).toEqual(["T"]);
    expect(ast.nodes.find((n) => n.label === "Cache")?.generics).toEqual([
      "K",
      "V extends Comparable<V>",
    ]);
  });

  it("collects enum literals into enumLiterals (never into attributes)", () => {
    // Arrange
    const source = `@startuml
enum AccountStatus {
  ACTIVE
  FROZEN
  CLOSED
}
@enduml`;

    // Act
    const { ast, errors } = parseClass(source);

    // Assert
    expect(errors).toEqual([]);
    const e = ast.nodes.find((n) => n.label === "AccountStatus");
    expect(e?.kind).toBe("enum");
    expect(e?.attributes).toBeUndefined();
    expect(e?.enumLiterals).toEqual([
      { id: expect.any(String), name: "ACTIVE" },
      { id: expect.any(String), name: "FROZEN" },
      { id: expect.any(String), name: "CLOSED" },
    ]);
  });

  it("parses a package block and attaches contained classes as children", () => {
    // Arrange
    const source = `@startuml
package "com.bank" {
  class Account
  class Transaction
}
class Outside
@enduml`;

    // Act
    const { ast, errors } = parseClass(source);

    // Assert
    expect(errors).toEqual([]);
    const pkg = ast.groups.find((g) => g.kind === "package");
    expect(pkg).toBeDefined();
    expect(pkg?.label).toBe("com.bank");
    expect(pkg?.children).toHaveLength(2);
    const childLabels = pkg?.children.map((id) => ast.nodes.find((n) => n.id === id)?.label).sort();
    expect(childLabels).toEqual(["Account", "Transaction"]);
    // Outside class is at top level.
    expect(ast.nodes.find((n) => n.label === "Outside")).toBeDefined();
  });

  it("falls through unparseable member lines to opaque without losing the AST", () => {
    // Arrange
    const source = `@startuml
class Foo {
  +bar: Int
  this is not a valid member
}
@enduml`;

    // Act
    const { ast, errors } = parseClass(source);

    // Assert — `bar` parsed; the bad line is not silently lost.
    expect(errors).toEqual([]);
    const foo = ast.nodes.find((n) => n.label === "Foo");
    expect(foo?.attributes).toHaveLength(1);
    expect(foo?.attributes?.[0]?.name).toBe("bar");
  });
});

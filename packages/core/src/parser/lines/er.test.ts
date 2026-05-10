import { describe, expect, it } from "vitest";

import { parsePlantUml } from "../parse.js";

/**
 * Counter-based id factory for deterministic snapshots; real parsing uses uuidv7.
 */
function deterministicIds(): () => string {
  let counter = 0;
  return () => `id-${++counter}`;
}

function parseEr(source: string) {
  return parsePlantUml(source, {
    diagramType: "er",
    diagramId: "diag",
    idFactory: deterministicIds(),
  });
}

describe("ER entity-body parser", () => {
  it("parses primary key marker `*` as primaryKey + nullable=false", () => {
    // Arrange
    const source = `@startuml
entity Customer {
  * id : UUID
}
@enduml`;

    // Act
    const { ast, errors } = parseEr(source);

    // Assert
    expect(errors).toEqual([]);
    const customer = ast.nodes.find((n) => n.label === "Customer");
    expect(customer?.attributes).toEqual([
      {
        id: expect.any(String),
        name: "id",
        type: "UUID",
        primaryKey: true,
        nullable: false,
      },
    ]);
  });

  it("parses foreign key marker `+` as foreignKey", () => {
    // Arrange
    const source = `@startuml
entity Order {
  + customer_id : UUID
}
@enduml`;

    // Act
    const { ast, errors } = parseEr(source);

    // Assert
    expect(errors).toEqual([]);
    const order = ast.nodes.find((n) => n.label === "Order");
    expect(order?.attributes).toEqual([
      {
        id: expect.any(String),
        name: "customer_id",
        type: "UUID",
        foreignKey: true,
      },
    ]);
  });

  it("parses `<<NN>>` and `<<not null>>` stereotypes as nullable=false", () => {
    // Arrange — both forms supported.
    const source = `@startuml
entity Item {
  email : String <<NN>>
  total : Decimal <<not null>>
}
@enduml`;

    // Act
    const { ast, errors } = parseEr(source);

    // Assert
    expect(errors).toEqual([]);
    const item = ast.nodes.find((n) => n.label === "Item");
    expect(item?.attributes?.[0]?.nullable).toBe(false);
    expect(item?.attributes?.[1]?.nullable).toBe(false);
  });

  it("captures default values inside the entity body", () => {
    // Arrange
    const source = `@startuml
entity Settings {
  retries : Integer = 3
}
@enduml`;

    // Act
    const { ast, errors } = parseEr(source);

    // Assert
    expect(errors).toEqual([]);
    const settings = ast.nodes.find((n) => n.label === "Settings");
    expect(settings?.attributes?.[0]).toMatchObject({
      name: "retries",
      type: "Integer",
      default: "3",
    });
  });

  it("treats a closing `}` on its own line as the end of the entity body", () => {
    // Arrange — second entity must register at top-level, not as a nested
    // member of the first.
    const source = `@startuml
entity Alpha {
  * id : UUID
}
entity Beta
@enduml`;

    // Act
    const { ast, errors } = parseEr(source);

    // Assert
    expect(errors).toEqual([]);
    expect(ast.nodes.map((n) => n.label)).toEqual(["Alpha", "Beta"]);
    const beta = ast.nodes.find((n) => n.label === "Beta");
    expect(beta?.attributes).toBeUndefined();
  });

  it("parses an empty body as an entity without attributes", () => {
    // Arrange
    const source = `@startuml
entity Tag { }
@enduml`;

    // Act
    const { ast, errors } = parseEr(source);

    // Assert
    expect(errors).toEqual([]);
    const tag = ast.nodes.find((n) => n.label === "Tag");
    expect(tag?.attributes).toBeUndefined();
  });
});

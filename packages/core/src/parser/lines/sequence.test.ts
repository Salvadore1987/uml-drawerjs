import { describe, expect, it } from "vitest";

import { parsePlantUml } from "../parse.js";

/**
 * Counter-based id factory for deterministic snapshots; real parsing uses
 * uuidv7. Mirror of the helper used in the existing class / ER parser tests.
 */
function deterministicIds(): () => string {
  let counter = 0;
  return () => `id-${++counter}`;
}

function parseSequence(source: string) {
  return parsePlantUml(source, {
    diagramType: "sequence",
    diagramId: "diag",
    idFactory: deterministicIds(),
  });
}

describe("Sequence parser — lifeline kinds", () => {
  const cases: ReadonlyArray<{ keyword: string; kind: string }> = [
    { keyword: "actor", kind: "actor" },
    { keyword: "participant", kind: "lifeline" },
    { keyword: "boundary", kind: "lifeline-boundary" },
    { keyword: "control", kind: "lifeline-control" },
    { keyword: "entity", kind: "lifeline-entity" },
    { keyword: "database", kind: "database" },
    { keyword: "queue", kind: "queue" },
    { keyword: "collections", kind: "lifeline-collections" },
  ];

  for (const c of cases) {
    it(`maps '${c.keyword}' to NodeKind '${c.kind}'`, () => {
      // Arrange
      const source = `@startuml\n${c.keyword} Foo\n@enduml`;

      // Act
      const { ast, errors } = parseSequence(source);

      // Assert
      expect(errors).toEqual([]);
      expect(ast.nodes[0]?.kind).toBe(c.kind);
    });
  }
});

describe("Sequence parser — activation", () => {
  it("builds an ActivationInterval for an activate / deactivate pair", () => {
    // Arrange
    const source = `@startuml
actor User
participant Auth
User -> Auth : login
activate Auth
Auth -> Auth : check
deactivate Auth
@enduml`;

    // Act
    const { ast, errors } = parseSequence(source);

    // Assert
    expect(errors).toEqual([]);
    const auth = ast.nodes.find((n) => n.label === "Auth");
    expect(auth?.activations).toHaveLength(1);
    const interval = auth?.activations?.[0];
    expect(interval?.fromEdgeId).toBeDefined();
    expect(interval?.toEdgeId).toBeDefined();
  });

  it("treats `++` as activatesTarget and starts an activation", () => {
    // Arrange — the receiver becomes active on receipt.
    const source = `@startuml
actor User
participant Auth
User -> Auth ++ : login
@enduml`;

    // Act
    const { ast } = parseSequence(source);

    // Assert
    const edge = ast.edges[0];
    expect(edge?.activatesTarget).toBe(true);
    const auth = ast.nodes.find((n) => n.label === "Auth");
    expect(auth?.activations?.length).toBe(1);
  });

  it("treats `--` as deactivatesSource and closes the open activation", () => {
    // Arrange
    const source = `@startuml
actor User
participant Auth
User -> Auth ++ : login
Auth -> User -- : reply
@enduml`;

    // Act
    const { ast } = parseSequence(source);

    // Assert
    const reply = ast.edges[1];
    expect(reply?.deactivatesSource).toBe(true);
    const auth = ast.nodes.find((n) => n.label === "Auth");
    expect(auth?.activations?.[0]?.toEdgeId).toBe(reply?.id);
  });
});

describe("Sequence parser — combined fragments", () => {
  it("parses `alt … else … end` into two operands referencing the right edges", () => {
    // Arrange
    const source = `@startuml
actor A
participant B
alt success
  A -> B : ok
else failure
  A -> B : retry
end
@enduml`;

    // Act
    const { ast, errors } = parseSequence(source);

    // Assert
    expect(errors).toEqual([]);
    const fragment = ast.fragments?.[0];
    expect(fragment?.kind).toBe("alt");
    expect(fragment?.operands).toHaveLength(2);
    expect(fragment?.operands[0]?.guard).toBe("success");
    expect(fragment?.operands[1]?.guard).toBe("failure");
    expect(fragment?.operands[0]?.edges).toHaveLength(1);
    expect(fragment?.operands[1]?.edges).toHaveLength(1);
  });

  it("captures parent linkage for nested fragments", () => {
    // Arrange — opt nested inside alt.
    const source = `@startuml
actor A
participant B
alt yes
  opt logged
    A -> B : ping
  end
end
@enduml`;

    // Act
    const { ast } = parseSequence(source);

    // Assert
    const fragments = ast.fragments ?? [];
    expect(fragments).toHaveLength(2);
    const optFragment = fragments.find((f) => f.kind === "opt");
    const altFragment = fragments.find((f) => f.kind === "alt");
    expect(optFragment?.parentId).toBe(altFragment?.id);
  });
});

describe("Sequence parser — notes", () => {
  it("parses `note left of X : ...` into a single-participant note", () => {
    // Arrange
    const source = `@startuml
actor A
note left of A : hello
@enduml`;

    // Act
    const { ast } = parseSequence(source);

    // Assert
    const note = ast.notes?.[0];
    expect(note?.placement).toBe("left");
    expect(note?.text).toBe("hello");
    expect(note?.participants).toHaveLength(1);
  });

  it("parses `note over A, B : ...` into a multi-participant over-note", () => {
    // Arrange
    const source = `@startuml
actor A
participant B
note over A, B : shared
@enduml`;

    // Act
    const { ast } = parseSequence(source);

    // Assert
    const note = ast.notes?.[0];
    expect(note?.placement).toBe("over");
    expect(note?.participants).toHaveLength(2);
    expect(note?.text).toBe("shared");
  });

  it("accumulates multi-line note bodies until `end note`", () => {
    // Arrange
    const source = `@startuml
actor A
note over A
line one
line two
end note
@enduml`;

    // Act
    const { ast } = parseSequence(source);

    // Assert
    expect(ast.notes?.[0]?.text).toBe("line one\nline two");
  });
});

describe("Sequence parser — dividers and autonumber", () => {
  it("captures `==Phase==` as a divider", () => {
    // Arrange
    const source = `@startuml
actor A
== Authentication ==
@enduml`;

    // Act
    const { ast } = parseSequence(source);

    // Assert
    expect(ast.dividers?.[0]?.label).toBe("Authentication");
  });

  it("stores autonumber settings on diagram metadata", () => {
    // Arrange
    const source = `@startuml
autonumber 10 5 "<b>%02d</b>"
actor A
@enduml`;

    // Act
    const { ast } = parseSequence(source);

    // Assert
    expect(ast.metadata.sequenceAutoNumber).toEqual({
      start: 10,
      increment: 5,
      format: "<b>%02d</b>",
    });
  });
});

describe("Sequence parser — found / lost messages", () => {
  it("parses `[-> X` as a found-message edge with source===target", () => {
    // Arrange
    const source = `@startuml
actor A
[-> A : signal
@enduml`;

    // Act
    const { ast, errors } = parseSequence(source);

    // Assert
    expect(errors).toEqual([]);
    const edge = ast.edges[0];
    expect(edge?.kind).toBe("found-message");
    expect(edge?.source).toBe(edge?.target);
    expect(edge?.label).toBe("signal");
  });

  it("parses `X ->]` as a lost-message edge with source===target", () => {
    // Arrange
    const source = `@startuml
actor A
A ->] : timeout
@enduml`;

    // Act
    const { ast, errors } = parseSequence(source);

    // Assert
    expect(errors).toEqual([]);
    const edge = ast.edges[0];
    expect(edge?.kind).toBe("lost-message");
    expect(edge?.source).toBe(edge?.target);
    expect(edge?.label).toBe("timeout");
  });
});

describe("Sequence parser — create / destroy shortcuts", () => {
  it("parses `**` as a create-message", () => {
    // Arrange
    const source = `@startuml
actor A
participant B
A -> B ** : new
@enduml`;

    // Act
    const { ast } = parseSequence(source);

    // Assert
    expect(ast.edges[0]?.kind).toBe("create");
  });

  it("parses `!!` as a destroy-message", () => {
    // Arrange
    const source = `@startuml
actor A
participant B
A -> B !! : kill
@enduml`;

    // Act
    const { ast } = parseSequence(source);

    // Assert
    expect(ast.edges[0]?.kind).toBe("destroy");
  });
});

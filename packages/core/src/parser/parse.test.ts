import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { DiagramType } from "../model/types.js";
import { parsePlantUml } from "./parse.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "../../__fixtures__");

interface Fixture {
  type: DiagramType;
  folder: string;
}

const FIXTURES: Fixture[] = [
  { type: "c4-context", folder: "c4-context" },
  { type: "c4-container", folder: "c4-container" },
  { type: "c4-component", folder: "c4-component" },
  { type: "class", folder: "class" },
  { type: "er", folder: "er" },
  { type: "sequence", folder: "sequence" },
];

/**
 * Counter-based id factory used to produce deterministic AST snapshots in
 * fixture tests. Real parsing uses uuidv7.
 */
function makeDeterministicIdFactory(): () => string {
  let counter = 0;
  return () => `id-${++counter}`;
}

describe("parsePlantUml — fixture round-trip", () => {
  for (const fixture of FIXTURES) {
    it(`parses the ${fixture.type} fixture into the expected JSON snapshot`, () => {
      // Arrange
      const pumlPath = resolve(fixtureRoot, fixture.folder, "sample.puml");
      const jsonPath = resolve(fixtureRoot, fixture.folder, "sample.json");
      const text = readFileSync(pumlPath, "utf8");
      const expected: unknown = JSON.parse(readFileSync(jsonPath, "utf8"));

      // Act
      const { ast, errors } = parsePlantUml(text, {
        diagramType: fixture.type,
        diagramId: "diagram-fixture",
        idFactory: makeDeterministicIdFactory(),
      });

      // Assert
      expect(errors).toEqual([]);
      expect(ast).toEqual(expected);
    });
  }
});

describe("parsePlantUml — error handling", () => {
  it("emits SYNTAX_MISSING_MARKER when @startuml / @enduml are absent", () => {
    // Arrange — a body without markers
    const text = "class Foo\nclass Bar\nFoo --> Bar\n";

    // Act
    const { ast, errors } = parsePlantUml(text, {
      diagramType: "class",
      diagramId: "d",
      idFactory: makeDeterministicIdFactory(),
    });

    // Assert — AST is preserved (still parses what it can); two warnings
    expect(ast.nodes).toHaveLength(2);
    expect(ast.edges).toHaveLength(1);
    const codes = errors.map((e) => e.code).sort();
    expect(codes).toEqual(["SYNTAX_MISSING_MARKER", "SYNTAX_MISSING_MARKER"]);
    expect(errors.every((e) => e.severity === "warning")).toBe(true);
  });

  it("flags references to unknown aliases without losing the surrounding AST", () => {
    // Arrange
    const text = `@startuml\nclass Foo\nFoo --> Missing : x\n@enduml\n`;

    // Act
    const { ast, errors } = parsePlantUml(text, {
      diagramType: "class",
      diagramId: "d",
      idFactory: makeDeterministicIdFactory(),
    });

    // Assert
    expect(ast.nodes).toHaveLength(1);
    expect(ast.edges).toHaveLength(0);
    expect(errors).toHaveLength(1);
    const error = errors[0];
    expect(error?.code).toBe("SYNTAX_UNKNOWN_REFERENCE");
    expect(error?.range).toBeDefined();
    expect(error?.range?.from).toBeGreaterThanOrEqual(0);
    expect(error?.range?.to).toBeGreaterThan(error?.range?.from ?? 0);
  });

  it("captures unrecognised lines into metadata.opaque (not destroyed)", () => {
    // Arrange — `note left of Foo` is not modelled in the MVP
    const text = `@startuml\nclass Foo\nnote left of Foo : a note\n@enduml\n`;

    // Act
    const { ast, errors } = parsePlantUml(text, {
      diagramType: "class",
      diagramId: "d",
      idFactory: makeDeterministicIdFactory(),
    });

    // Assert
    expect(errors).toEqual([]);
    expect(ast.metadata.opaque).toEqual(["note left of Foo : a note"]);
    expect(ast.nodes).toHaveLength(1);
  });
});

describe("parsePlantUml — meta-comment decoding", () => {
  it("hydrates metadata.layoutOverrides + styles from ' @drawer:meta {...}'", () => {
    // Arrange
    const text = `@startuml\n' @drawer:meta {"layoutOverrides":{"a":{"x":10,"y":20}},"styles":{"a":{"fill":"#fff"}}}\nclass Foo\n@enduml\n`;

    // Act
    const { ast, errors } = parsePlantUml(text, {
      diagramType: "class",
      diagramId: "d",
      idFactory: makeDeterministicIdFactory(),
    });

    // Assert
    expect(errors).toEqual([]);
    expect(ast.metadata.layoutOverrides).toEqual({ a: { x: 10, y: 20 } });
    expect(ast.styles).toEqual({ a: { fill: "#fff" } });
  });

  it("emits SYNTAX_META on malformed meta-comment payload but keeps the AST", () => {
    // Arrange — payload is not valid JSON
    const text = `@startuml\n' @drawer:meta {not valid}\nclass Foo\n@enduml\n`;

    // Act
    const { ast, errors } = parsePlantUml(text, {
      diagramType: "class",
      diagramId: "d",
      idFactory: makeDeterministicIdFactory(),
    });

    // Assert
    expect(ast.nodes).toHaveLength(1);
    expect(errors.some((e) => e.code === "SYNTAX_META")).toBe(true);
  });
});

describe("parsePlantUml — C4 macro coverage", () => {
  it("Person_Ext lands as kind 'person-external' (separate from internal Person)", () => {
    // Arrange
    const text = `@startuml\nPerson(c, "Customer")\nPerson_Ext(a, "Auditor", "Reviews")\n@enduml\n`;

    // Act
    const { ast, errors } = parsePlantUml(text, {
      diagramType: "c4-context",
      diagramId: "d",
      idFactory: makeDeterministicIdFactory(),
    });

    // Assert
    expect(errors).toEqual([]);
    const kinds = ast.nodes.map((n) => n.kind);
    expect(kinds).toEqual(["person", "person-external"]);
  });

  it("SystemDb / SystemDb_Ext map to kind 'database' on a Context diagram", () => {
    // Arrange
    const text = `@startuml\nSystemDb(d1, "Audit Log", "Stores trails")\nSystemDb_Ext(d2, "Vendor DB")\n@enduml\n`;

    // Act
    const { ast, errors } = parsePlantUml(text, {
      diagramType: "c4-context",
      diagramId: "d",
      idFactory: makeDeterministicIdFactory(),
    });

    // Assert
    expect(errors).toEqual([]);
    expect(ast.nodes.map((n) => n.kind)).toEqual(["database", "database"]);
    expect(ast.nodes[0]?.description).toBe("Stores trails");
  });

  it("SystemQueue maps to kind 'queue' without a technology field", () => {
    // Arrange
    const text = `@startuml\nSystemQueue(q, "Events", "Domain bus")\n@enduml\n`;

    // Act
    const { ast, errors } = parsePlantUml(text, {
      diagramType: "c4-context",
      diagramId: "d",
      idFactory: makeDeterministicIdFactory(),
    });

    // Assert
    expect(errors).toEqual([]);
    expect(ast.nodes[0]?.kind).toBe("queue");
    expect(ast.nodes[0]?.description).toBe("Domain bus");
    expect(ast.nodes[0]?.technology).toBeUndefined();
  });

  it("System_Boundary { ... } populates group.children with the inner node ids", () => {
    // Arrange — boundary block with two containers inside; the parser
    // used to drop the inner `{}` block and leave `children` empty.
    const text = `@startuml\nSystem_Boundary(b, "Bank") {\n  Container(web, "Web")\n  Container(api, "API")\n}\n@enduml\n`;

    // Act
    const { ast, errors } = parsePlantUml(text, {
      diagramType: "c4-container",
      diagramId: "d",
      idFactory: makeDeterministicIdFactory(),
    });

    // Assert
    expect(errors).toEqual([]);
    expect(ast.groups).toHaveLength(1);
    const group = ast.groups[0]!;
    const ids = ast.nodes.map((n) => n.id);
    expect(group.children).toEqual(ids);
    expect(group.kind).toBe("boundary");
  });

  it("preserves the boundary's PlantUML alias on the parsed group", () => {
    // Arrange
    const text = `@startuml\nSystem_Boundary(bank, "Internet Banking System") {\n  Container(api, "API")\n}\n@enduml\n`;

    // Act
    const { ast, errors } = parsePlantUml(text, {
      diagramType: "c4-container",
      diagramId: "d",
      idFactory: makeDeterministicIdFactory(),
    });

    // Assert
    expect(errors).toEqual([]);
    expect(ast.groups[0]?.alias).toBe("bank");
    expect(ast.groups[0]?.label).toBe("Internet Banking System");
  });

  it("nodes outside the boundary block stay top-level", () => {
    // Arrange — one inside, one outside.
    const text = `@startuml\nSystem_Boundary(b, "Bank") {\n  Container(web, "Web")\n}\nPerson(c, "Customer")\n@enduml\n`;

    // Act
    const { ast } = parsePlantUml(text, {
      diagramType: "c4-container",
      diagramId: "d",
      idFactory: makeDeterministicIdFactory(),
    });

    // Assert
    const group = ast.groups[0]!;
    const personId = ast.nodes.find((n) => n.kind === "person")!.id;
    expect(group.children).not.toContain(personId);
    expect(group.children).toHaveLength(1);
  });

  it("Container_Ext lands as kind 'container-external' (separate from internal Container)", () => {
    // Arrange
    const text = `@startuml\nContainer(api, "API", "Java")\nContainer_Ext(pay, "Payments", "REST", "Third-party")\n@enduml\n`;

    // Act
    const { ast, errors } = parsePlantUml(text, {
      diagramType: "c4-container",
      diagramId: "d",
      idFactory: makeDeterministicIdFactory(),
    });

    // Assert
    expect(errors).toEqual([]);
    const kinds = ast.nodes.map((n) => n.kind);
    expect(kinds).toEqual(["container", "container-external"]);
    expect(ast.nodes[1]).toMatchObject({
      kind: "container-external",
      label: "Payments",
      technology: "REST",
      description: "Third-party",
    });
  });

  it("ContainerQueue carries the technology argument across", () => {
    // Arrange
    const text = `@startuml\nContainerQueue(q, "Events", "Kafka", "Order events")\n@enduml\n`;

    // Act
    const { ast, errors } = parsePlantUml(text, {
      diagramType: "c4-container",
      diagramId: "d",
      idFactory: makeDeterministicIdFactory(),
    });

    // Assert
    expect(errors).toEqual([]);
    expect(ast.nodes[0]).toMatchObject({
      kind: "queue",
      label: "Events",
      technology: "Kafka",
      description: "Order events",
    });
  });
});

import { describe, expect, it } from "vitest";

import { createEmptyDiagram } from "./factory.js";
import { uuidv7 } from "./ids.js";
import { SCHEMA_VERSION } from "./schema.js";
import type { Diagram, DiagramType } from "./types.js";
import { isCurrentSchemaVersion, parseDiagram, parseDiagramOrThrow } from "./validation.js";

const ALL_TYPES: DiagramType[] = [
  "c4-context",
  "c4-container",
  "c4-component",
  "class",
  "er",
  "sequence",
];

describe("parseDiagram (round-trip)", () => {
  it.each(ALL_TYPES)("accepts a freshly-created empty diagram for %s", (type) => {
    // Arrange
    const original = createEmptyDiagram(type);
    const text = JSON.stringify(original);
    const json: unknown = JSON.parse(text);

    // Act
    const result = parseDiagram(json);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diagram).toEqual(original);
    }
  });

  it("accepts a populated AST and preserves every field", () => {
    // Arrange
    const node1Id = uuidv7();
    const node2Id = uuidv7();
    const original: Diagram = {
      ...createEmptyDiagram("class"),
      title: "Sample",
      nodes: [
        {
          id: node1Id,
          kind: "class",
          label: "Foo",
          attributes: [{ id: uuidv7(), name: "value", type: "number", visibility: "public" }],
          operations: [
            {
              id: uuidv7(),
              name: "render",
              parameters: [{ name: "ctx", type: "Context" }],
              returnType: "void",
              visibility: "public",
            },
          ],
        },
        { id: node2Id, kind: "interface", label: "Renderable" },
      ],
      edges: [
        {
          id: uuidv7(),
          source: node1Id,
          target: node2Id,
          kind: "realization",
          style: { stroke: "#abc", strokeDasharray: "3 3", arrowEnd: "open-triangle" },
        },
      ],
      groups: [{ id: uuidv7(), kind: "package", label: "ui", children: [node1Id, node2Id] }],
      metadata: {
        schemaVersion: SCHEMA_VERSION,
        layoutOverrides: {
          [node1Id]: { x: 100, y: 200 },
          [node2Id]: { x: 300, y: 200 },
        },
      },
    };

    // Act
    const result = parseDiagram(JSON.parse(JSON.stringify(original)) as unknown);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diagram).toEqual(original);
    }
  });
});

describe("parseDiagram (rejection cases)", () => {
  it("rejects a missing required field", () => {
    // Arrange
    const broken = { id: "x", type: "class", nodes: [], edges: [], groups: [] };

    // Act
    const result = parseDiagram(broken);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.path.includes("metadata"))).toBe(true);
    }
  });

  it("rejects unknown additional properties at the top level", () => {
    // Arrange
    const broken = {
      ...createEmptyDiagram("class"),
      bonus: "should not be allowed",
    };

    // Act
    const result = parseDiagram(broken);

    // Assert
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown NodeKind", () => {
    // Arrange
    const broken: unknown = {
      ...createEmptyDiagram("class"),
      nodes: [{ id: uuidv7(), kind: "wormhole", label: "X" }],
    };

    // Act
    const result = parseDiagram(broken);

    // Assert
    expect(result.ok).toBe(false);
  });

  it("rejects edges referencing wrong types of values (typed by zod, semantic checks come later)", () => {
    // Arrange
    const broken: unknown = {
      ...createEmptyDiagram("class"),
      edges: [{ id: uuidv7(), source: 42, target: "x", kind: "association" }],
    };

    // Act
    const result = parseDiagram(broken);

    // Assert
    expect(result.ok).toBe(false);
  });
});

describe("parseDiagramOrThrow", () => {
  it("returns the typed diagram on valid input", () => {
    // Arrange
    const original = createEmptyDiagram("er");

    // Act
    const parsed = parseDiagramOrThrow(JSON.parse(JSON.stringify(original)) as unknown);

    // Assert
    expect(parsed).toEqual(original);
  });

  it("throws with a concatenated path/message summary on invalid input", () => {
    // Arrange & Act & Assert
    expect(() => parseDiagramOrThrow({ wrong: true })).toThrowError(/Invalid diagram:/u);
  });
});

describe("isCurrentSchemaVersion", () => {
  it("recognises the current SCHEMA_VERSION", () => {
    expect(isCurrentSchemaVersion(SCHEMA_VERSION)).toBe(true);
  });

  it("rejects unknown versions", () => {
    expect(isCurrentSchemaVersion("9.9.9")).toBe(false);
  });
});

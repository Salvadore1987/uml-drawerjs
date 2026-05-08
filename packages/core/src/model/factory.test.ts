import { describe, expect, it } from "vitest";

import { createEmptyDiagram } from "./factory.js";
import { isUuidv7 } from "./ids.js";
import { SCHEMA_VERSION } from "./schema.js";
import type { DiagramType } from "./types.js";

const ALL_TYPES: DiagramType[] = [
  "c4-context",
  "c4-container",
  "c4-component",
  "class",
  "er",
  "sequence",
];

describe("createEmptyDiagram", () => {
  it.each(ALL_TYPES)("creates a structurally-valid empty diagram for %s", (type) => {
    // Arrange & Act
    const diagram = createEmptyDiagram(type);

    // Assert
    expect(diagram.type).toBe(type);
    expect(isUuidv7(diagram.id)).toBe(true);
    expect(diagram.nodes).toEqual([]);
    expect(diagram.edges).toEqual([]);
    expect(diagram.groups).toEqual([]);
    expect(diagram.metadata.schemaVersion).toBe(SCHEMA_VERSION);
    expect(diagram.metadata).not.toHaveProperty("layoutOverrides");
    expect(diagram).not.toHaveProperty("title");
    expect(diagram).not.toHaveProperty("styles");
  });

  it("returns an independent instance on every call", () => {
    // Arrange & Act
    const a = createEmptyDiagram("class");
    const b = createEmptyDiagram("class");

    // Assert
    expect(a).not.toBe(b);
    expect(a.id).not.toBe(b.id);
    expect(a.nodes).not.toBe(b.nodes);
  });

  it("survives JSON round-trip without losing structural fields", () => {
    // Arrange
    const diagram = createEmptyDiagram("er");

    // Act
    const text = JSON.stringify(diagram);
    const parsed: unknown = JSON.parse(text);

    // Assert
    expect(parsed).toEqual(diagram);
  });
});

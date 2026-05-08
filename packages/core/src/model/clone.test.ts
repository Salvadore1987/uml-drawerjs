import { describe, expect, it } from "vitest";

import { cloneDiagram } from "./clone.js";
import { createEmptyDiagram } from "./factory.js";
import { uuidv7 } from "./ids.js";
import type { Diagram } from "./types.js";

describe("cloneDiagram", () => {
  it("produces a deep copy that is structurally equal but referentially distinct", () => {
    // Arrange
    const original: Diagram = {
      ...createEmptyDiagram("class"),
      title: "Sample",
      nodes: [{ id: uuidv7(), kind: "class", label: "Foo" }],
      metadata: {
        schemaVersion: "0.1.0",
        layoutOverrides: { foo: { x: 10, y: 20 } },
      },
    };

    // Act
    const clone = cloneDiagram(original);

    // Assert — equal
    expect(clone).toEqual(original);
    // Assert — distinct references all the way down
    expect(clone).not.toBe(original);
    expect(clone.nodes).not.toBe(original.nodes);
    expect(clone.nodes[0]).not.toBe(original.nodes[0]);
    expect(clone.metadata).not.toBe(original.metadata);
    expect(clone.metadata.layoutOverrides).not.toBe(original.metadata.layoutOverrides);
  });

  it("isolates mutations of the clone from the original", () => {
    // Arrange
    const original = createEmptyDiagram("er");

    // Act
    const clone = cloneDiagram(original);
    clone.nodes.push({ id: uuidv7(), kind: "entity", label: "Mutant" });

    // Assert
    expect(original.nodes).toEqual([]);
    expect(clone.nodes).toHaveLength(1);
  });
});

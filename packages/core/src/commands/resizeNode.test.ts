import { describe, expect, it } from "vitest";

import { createEmptyDiagram } from "../model/factory.js";
import type { Diagram } from "../model/types.js";
import { resizeNodeCommand } from "./resizeNode.js";

function diagramWithOneNode(): Diagram {
  const empty = createEmptyDiagram("class");
  return {
    ...empty,
    nodes: [{ id: "a", kind: "class", label: "A" }],
    edges: [],
    groups: [],
    metadata: {
      ...empty.metadata,
      layoutOverrides: { a: { x: 10, y: 20 } },
    },
  };
}

describe("commands/resizeNode", () => {
  it("apply writes x/y/width/height into layoutOverrides", () => {
    // Arrange
    const diagram = diagramWithOneNode();
    const cmd = resizeNodeCommand("a", { x: 12, y: 24, width: 264, height: 96 }, diagram);

    // Act
    const next = cmd.apply(diagram);

    // Assert
    expect(next.metadata.layoutOverrides?.["a"]).toEqual({
      x: 12,
      y: 24,
      width: 264,
      height: 96,
    });
  });

  it("invert restores the previous override (when one existed)", () => {
    // Arrange
    const diagram = diagramWithOneNode();
    const cmd = resizeNodeCommand("a", { x: 12, y: 24, width: 264, height: 96 }, diagram);
    const after = cmd.apply(diagram);

    // Act
    const reverted = cmd.invert(after);

    // Assert
    expect(reverted.metadata.layoutOverrides?.["a"]).toEqual({ x: 10, y: 20 });
  });

  it("invert removes the override when there was none before", () => {
    // Arrange — a node without any prior layout entry
    const empty = createEmptyDiagram("class");
    const diagram: Diagram = {
      ...empty,
      nodes: [{ id: "b", kind: "class", label: "B" }],
      metadata: empty.metadata,
    };
    const cmd = resizeNodeCommand("b", { x: 0, y: 0, width: 200, height: 80 }, diagram);
    const after = cmd.apply(diagram);

    // Act
    const reverted = cmd.invert(after);

    // Assert
    expect(reverted.metadata.layoutOverrides?.["b"]).toBeUndefined();
  });

  it("apply → invert produces an equivalent diagram (state-equal)", () => {
    // Arrange
    const diagram = diagramWithOneNode();
    const cmd = resizeNodeCommand("a", { x: 100, y: 100, width: 320, height: 200 }, diagram);

    // Act
    const next = cmd.apply(diagram);
    const back = cmd.invert(next);

    // Assert — overrides match the starting state.
    expect(back.metadata.layoutOverrides).toEqual(diagram.metadata.layoutOverrides);
  });
});

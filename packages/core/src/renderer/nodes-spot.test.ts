import { describe, expect, it } from "vitest";

import { renderDiagram } from "./index.js";
import type { VNode } from "./types.js";
import type { Diagram, NodeKind } from "../model/types.js";

function diagramWith(overrides: Partial<Diagram>): Diagram {
  return {
    id: "doc",
    type: "class",
    nodes: [],
    edges: [],
    groups: [],
    metadata: { schemaVersion: "1.0.0", layoutOverrides: {} },
    ...overrides,
  };
}

function findNodeVNode(root: VNode, id: string): VNode {
  const stack: VNode[] = [root];
  while (stack.length > 0) {
    const node = stack.shift()!;
    const isMatch =
      node.tag === "g" &&
      (node.attrs as Record<string, unknown> | undefined)?.["data-node-id"] === id;
    if (isMatch) return node;
    if (node.children) stack.push(...node.children);
  }
  throw new Error(`renderer test helper: node ${id} not found in tree`);
}

function spotGroup(node: VNode): VNode | undefined {
  return node.children?.find(
    (c) => c.tag === "g" && (c.attrs as Record<string, unknown> | undefined)?.["data-uml-spot"],
  );
}

describe("renderer/nodes — class-like kind spot", () => {
  const cases: ReadonlyArray<{ kind: NodeKind; letter: string }> = [
    { kind: "class", letter: "C" },
    { kind: "interface", letter: "I" },
    { kind: "abstract-class", letter: "A" },
    { kind: "enum", letter: "E" },
  ];

  for (const { kind, letter } of cases) {
    it(`${kind} renders a circled "${letter}" spot`, () => {
      // Arrange
      const diagram = diagramWith({
        nodes: [{ id: "n1", kind, label: "Sample" }],
        metadata: { schemaVersion: "1.0.0", layoutOverrides: { n1: { x: 0, y: 0 } } },
      });

      // Act
      const rendered = renderDiagram(diagram, { coordinates: { n1: { x: 0, y: 0 } } });
      const node = findNodeVNode(rendered.root, "n1");
      const spot = spotGroup(node);

      // Assert — spot group carries the kind and holds a circle + the letter text.
      expect(spot, `${kind} should emit a kind-spot group`).toBeTruthy();
      expect((spot?.attrs as Record<string, unknown>)["data-uml-spot"]).toBe(kind);
      const tags = (spot?.children ?? []).map((c) => c.tag);
      expect(tags).toContain("circle");
      expect(tags).toContain("text");
      const text = spot?.children?.find((c) => c.tag === "text");
      expect(text?.text).toBe(letter);
    });
  }

  it("does not render a spot for non-class-like kinds", () => {
    // Arrange
    const diagram = diagramWith({
      type: "c4-context",
      nodes: [{ id: "c1", kind: "component", label: "API" }],
      metadata: { schemaVersion: "1.0.0", layoutOverrides: { c1: { x: 0, y: 0 } } },
    });

    // Act
    const rendered = renderDiagram(diagram, { coordinates: { c1: { x: 0, y: 0 } } });
    const node = findNodeVNode(rendered.root, "c1");

    // Assert
    expect(spotGroup(node)).toBeUndefined();
  });
});

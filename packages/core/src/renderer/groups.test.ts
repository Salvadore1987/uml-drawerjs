import { describe, expect, it } from "vitest";

import type { Diagram } from "../model/types.js";
import { renderDiagram } from "./index.js";

function diagramWith(overrides: Partial<Diagram>): Diagram {
  return {
    id: "doc",
    type: "c4-container",
    nodes: [],
    edges: [],
    groups: [],
    metadata: { schemaVersion: "1.0.0", layoutOverrides: {} },
    ...overrides,
  };
}

function findGroupVNode(root: ReturnType<typeof renderDiagram>["root"], id: string) {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.shift()!;
    const isMatch =
      node.tag === "g" &&
      node.attrs &&
      (node.attrs as Record<string, unknown>)["data-group-id"] === id;
    if (isMatch) return node;
    if (node.children) stack.push(...node.children);
  }
  return null;
}

describe("renderer/groups — boundary layer", () => {
  it("emits a <g data-uml-layer='groups'> with one rect+label per boundary", () => {
    // Arrange — boundary owning two children that have explicit layout
    const diagram = diagramWith({
      groups: [{ id: "g", kind: "boundary", label: "Bank", children: ["n1", "n2"] }],
      nodes: [
        { id: "n1", kind: "container", label: "Web" },
        { id: "n2", kind: "container", label: "API" },
      ],
      metadata: {
        schemaVersion: "1.0.0",
        layoutOverrides: { n1: { x: 0, y: 0 }, n2: { x: 240, y: 0 } },
      },
    });

    // Act
    const rendered = renderDiagram(diagram, {
      coordinates: { n1: { x: 0, y: 0 }, n2: { x: 240, y: 0 } },
    });
    const groupNode = findGroupVNode(rendered.root, "g");

    // Assert
    expect(groupNode).not.toBeNull();
    const rect = groupNode!.children?.find((c) => c.tag === "rect");
    const labels = (groupNode!.children ?? []).filter((c) => c.tag === "text");
    expect(rect).toBeTruthy();
    expect((rect?.attrs as Record<string, unknown> | undefined)?.["stroke-dasharray"]).toBe("10 6");
    expect(labels.map((l) => l.text)).toEqual(["Bank", "[Boundary]"]);
  });

  it("auto-fits the rect from children when no override is supplied", () => {
    // Arrange — children at known positions; expect bbox to envelope them
    const diagram = diagramWith({
      groups: [{ id: "g", kind: "boundary", label: "B", children: ["n1", "n2"] }],
      nodes: [
        { id: "n1", kind: "container", label: "A" },
        { id: "n2", kind: "container", label: "B" },
      ],
      metadata: {
        schemaVersion: "1.0.0",
        layoutOverrides: { n1: { x: 100, y: 100 }, n2: { x: 400, y: 100 } },
      },
    });

    // Act
    const rendered = renderDiagram(diagram, {
      coordinates: { n1: { x: 100, y: 100 }, n2: { x: 400, y: 100 } },
    });
    const groupNode = findGroupVNode(rendered.root, "g");
    const rect = groupNode?.children?.find((c) => c.tag === "rect");
    const attrs = rect?.attrs as Record<string, number> | undefined;

    // Assert — bbox at least encloses the children
    expect(attrs).toBeTruthy();
    const x = attrs?.x ?? 0;
    const y = attrs?.y ?? 0;
    const width = attrs?.width ?? 0;
    expect(x).toBeLessThanOrEqual(100);
    expect(y).toBeLessThanOrEqual(100);
    expect(x + width).toBeGreaterThanOrEqual(400);
  });

  it("uses an explicit layoutOverride rect when provided", () => {
    // Arrange — group has explicit override; children ignored for sizing
    const diagram = diagramWith({
      groups: [{ id: "g", kind: "boundary", label: "B", children: [] }],
      metadata: {
        schemaVersion: "1.0.0",
        layoutOverrides: { g: { x: 50, y: 60, width: 400, height: 250 } },
      },
    });

    // Act
    const rendered = renderDiagram(diagram, { coordinates: {} });
    const groupNode = findGroupVNode(rendered.root, "g");
    const rect = groupNode?.children?.find((c) => c.tag === "rect");
    const attrs = rect?.attrs as Record<string, number> | undefined;

    // Assert
    expect(attrs?.x).toBe(50);
    expect(attrs?.y).toBe(60);
    expect(attrs?.width).toBe(400);
    expect(attrs?.height).toBe(250);
  });

  it("renders a default-sized empty boundary when there are no children", () => {
    // Arrange — boundary just dropped from the palette
    const diagram = diagramWith({
      groups: [{ id: "g", kind: "boundary", label: "Empty", children: [] }],
    });

    // Act
    const rendered = renderDiagram(diagram, { coordinates: {} });
    const groupNode = findGroupVNode(rendered.root, "g");
    const rect = groupNode?.children?.find((c) => c.tag === "rect");
    const attrs = rect?.attrs as Record<string, number> | undefined;

    // Assert — non-zero default rect appears so the user can see/drag it
    expect(attrs?.width).toBeGreaterThan(0);
    expect(attrs?.height).toBeGreaterThan(0);
  });
});

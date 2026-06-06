import { describe, expect, it } from "vitest";

import { createEmptyDiagram } from "../model/factory.js";
import type { Diagram } from "../model/types.js";
import { renderDiagram } from "./index.js";
import { portSnap } from "./edges.js";
import { computeNodeGeometry } from "./nodes.js";
import { createSelectionModel } from "./selection.js";
import { summarizeForA11y } from "./a11y.js";
import { renderMinimap } from "./minimap.js";

function classDiagramWith(overrides: Partial<Diagram>): Diagram {
  return { ...createEmptyDiagram("class"), ...overrides };
}

describe("renderDiagram — vnode tree shape", () => {
  it("returns an <svg> root with edge + node layers and a defs section", () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [
        { id: "a", kind: "class", label: "A" },
        { id: "b", kind: "class", label: "B" },
      ],
      edges: [{ id: "e", source: "a", target: "b", kind: "association" }],
    });

    // Act
    const rendered = renderDiagram(diagram);

    // Assert
    expect(rendered.root.tag).toBe("svg");
    expect(rendered.root.children?.[0]?.tag).toBe("defs");
    const content = rendered.root.children?.[1];
    expect(content?.tag).toBe("g");
    const layers = content?.children ?? [];
    expect(layers.find((l) => l.attrs?.["data-uml-layer"] === "edges")).toBeDefined();
    expect(layers.find((l) => l.attrs?.["data-uml-layer"] === "nodes")).toBeDefined();
  });

  it("emits one <g data-node-id> per node and one <g data-edge-id> per edge", () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [
        { id: "a", kind: "class", label: "A" },
        { id: "b", kind: "class", label: "B" },
      ],
      edges: [{ id: "e", source: "a", target: "b", kind: "association" }],
    });

    // Act
    const rendered = renderDiagram(diagram);

    // Assert
    const flat = flattenNodes(rendered.root);
    const nodeMatches = flat.filter((n) => n.attrs?.["data-node-id"] !== undefined);
    const edgeMatches = flat.filter((n) => n.attrs?.["data-edge-id"] !== undefined);
    expect(nodeMatches.map((n) => n.attrs?.["data-node-id"]).sort()).toEqual(["a", "b"]);
    expect(edgeMatches.map((n) => n.attrs?.["data-edge-id"])).toEqual(["e"]);
  });

  it("renders a C4 Rel technology as a second italic [bracketed] label line", () => {
    // Arrange
    const diagram: Diagram = {
      ...createEmptyDiagram("c4-context"),
      nodes: [
        { id: "a", kind: "person", label: "Customer" },
        { id: "b", kind: "system", label: "Banking" },
      ],
      edges: [
        { id: "e", source: "a", target: "b", kind: "uses", label: "Uses", technology: "HTTPS" },
      ],
    };

    // Act
    const rendered = renderDiagram(diagram);
    const flat = flattenNodes(rendered.root);

    // Assert — both the action-name line and the technology line are present;
    // the technology line is italic and wrapped in brackets.
    const action = flat.find((n) => (n.classes ?? []).includes("uml-edge-label-text"));
    const tech = flat.find((n) => (n.classes ?? []).includes("uml-edge-label-tech"));
    expect(action?.text).toBe("Uses");
    expect(tech?.text).toBe("[HTTPS]");
    expect((tech?.attrs as Record<string, unknown> | undefined)?.["font-style"]).toBe("italic");
  });

  it("renders ER cardinality labels for both endpoints", () => {
    // Arrange
    const diagram: Diagram = {
      ...createEmptyDiagram("er"),
      nodes: [
        { id: "x", kind: "entity", label: "X" },
        { id: "y", kind: "entity", label: "Y" },
      ],
      edges: [
        {
          id: "e",
          source: "x",
          target: "y",
          kind: "one-to-many",
          cardinality: { source: "1", target: "0..*" },
        },
      ],
    };

    // Act
    const rendered = renderDiagram(diagram);

    // Assert
    const cardinality = flattenNodes(rendered.root).filter((n) =>
      n.classes?.some((c) => c.startsWith("uml-edge-cardinality")),
    );
    expect(cardinality.map((n) => n.text).sort()).toEqual(["0..*", "1"]);
  });

  it("never produces hex colour literals — every visual attribute uses --uml-* refs", () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [
        { id: "a", kind: "class", label: "A" },
        { id: "b", kind: "class", label: "B" },
      ],
      edges: [{ id: "e", source: "a", target: "b", kind: "association" }],
    });

    // Act — serialise the entire vnode tree to a single string and grep
    const rendered = renderDiagram(diagram);
    const serialised = JSON.stringify(rendered.root);

    // Assert — no `#abc`, `#abcdef` literals; only `var(--uml-*)`.
    expect(/#[0-9a-fA-F]{3,8}\b/u.test(serialised)).toBe(false);
  });
});

describe("portSnap — edge geometry", () => {
  it("snaps endpoints to the boundaries of the source / target rectangles", () => {
    // Arrange — two horizontally-separated rectangles
    const source = { id: "a", x: 0, y: 0, width: 100, height: 60 };
    const target = { id: "b", x: 300, y: 0, width: 100, height: 60 };

    // Act
    const { from, to } = portSnap(source, target);

    // Assert — `from` lies on the right edge of A; `to` lies on the left edge of B
    expect(from).toEqual({ x: 100, y: 30 });
    expect(to).toEqual({ x: 300, y: 30 });
  });

  it("clamps to centre when the rectangles overlap (degenerate ray)", () => {
    // Arrange
    const source = { id: "a", x: 0, y: 0, width: 100, height: 60 };
    const target = { id: "b", x: 0, y: 0, width: 100, height: 60 };

    // Act
    const { from, to } = portSnap(source, target);

    // Assert — same centre means the segment collapses to a point
    expect(from).toEqual(to);
  });
});

describe("computeNodeGeometry — class members grow the box", () => {
  it("grows class-node height to fit attributes + operations", () => {
    // Arrange
    const tall = computeNodeGeometry({
      node: {
        id: "n",
        kind: "class",
        label: "Big",
        attributes: [
          { id: "a1", name: "x" },
          { id: "a2", name: "y" },
          { id: "a3", name: "z" },
        ],
        operations: [{ id: "o1", name: "step" }],
      },
      x: 0,
      y: 0,
      width: 200,
      height: 80,
    });

    // Act / Assert
    expect(tall.height).toBeGreaterThan(80);
  });
});

describe("createSelectionModel — store API", () => {
  it("notifies listeners on add / remove / toggle", () => {
    // Arrange
    const model = createSelectionModel();
    const events: string[] = [];
    model.subscribe((next) => events.push([...next].join(",")));

    // Act
    model.add("a");
    model.add("b");
    model.toggle("a");
    model.clear();

    // Assert
    expect(events).toEqual(["a", "a,b", "b", ""]);
  });

  it("is idempotent on no-op add / remove", () => {
    // Arrange
    const model = createSelectionModel(["a"]);
    const events: number[] = [];
    model.subscribe(() => events.push(events.length));

    // Act
    model.add("a"); // already present — no event
    model.remove("z"); // not present — no event

    // Assert
    expect(events).toEqual([]);
  });
});

describe("renderMinimap", () => {
  it("emits a small SVG with a rect per laid-out node", () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [
        { id: "a", kind: "class", label: "A" },
        { id: "b", kind: "class", label: "B" },
      ],
    });
    const rendered = renderDiagram(diagram);

    // Act
    const minimap = renderMinimap(diagram, rendered);

    // Assert — every node gets a corresponding rect inside the minimap
    expect(minimap.tag).toBe("svg");
    const rectCount = (minimap.children ?? []).filter((c) => c.tag === "rect").length;
    expect(rectCount).toBeGreaterThanOrEqual(diagram.nodes.length);
  });

  it("draws a viewport rect when transform + canvas dimensions are supplied", () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [{ id: "a", kind: "class", label: "A" }],
    });
    const rendered = renderDiagram(diagram);

    // Act
    const minimap = renderMinimap(diagram, rendered, {
      transform: { scale: 1, translateX: 0, translateY: 0 },
      canvasWidth: 800,
      canvasHeight: 600,
    });

    // Assert
    const viewport = (minimap.children ?? []).find((c) =>
      c.classes?.includes("uml-minimap-viewport"),
    );
    expect(viewport).toBeDefined();
  });
});

describe("summarizeForA11y", () => {
  it("produces a deterministic plain-text summary listing nodes + edges", () => {
    // Arrange
    const diagram = classDiagramWith({
      title: "Hierarchy",
      nodes: [
        { id: "a", kind: "interface", label: "Renderable" },
        { id: "b", kind: "abstract-class", label: "Shape" },
      ],
      edges: [{ id: "e", source: "b", target: "a", kind: "realization" }],
    });

    // Act
    const summary = summarizeForA11y(diagram);

    // Assert
    expect(summary).toContain("Class diagram: Hierarchy");
    expect(summary).toContain("Renderable");
    expect(summary).toContain("Shape implements Renderable");
  });
});

function flattenNodes(node: { tag: string; children?: readonly { tag: string }[] }): {
  tag: string;
  attrs?: Record<string, string | number | boolean | undefined>;
  classes?: readonly string[];
  text?: string;
}[] {
  // The vnode tree is small enough that an iterative DFS is plenty fast.
  const out: ReturnType<typeof flattenNodes> = [];
  const stack: { tag: string; children?: readonly { tag: string }[] }[] = [node];
  while (stack.length > 0) {
    const current = stack.pop()!;
    out.push(current as ReturnType<typeof flattenNodes>[number]);
    for (const child of (current as { children?: readonly { tag: string }[] }).children ?? []) {
      stack.push(child);
    }
  }
  return out;
}

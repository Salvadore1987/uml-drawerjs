import { afterEach, describe, expect, it } from "vitest";

import { applyLayoutCommand } from "../commands/applyLayout.js";
import { createEmptyDiagram } from "../model/factory.js";
import type { Diagram } from "../model/types.js";
import {
  LAYOUT_DEFAULTS,
  layoutGrid,
  layoutSequence,
  resetElkLoader,
  runAutoLayout,
  runElkLayout,
} from "./index.js";
import type { ElkConstructorLike, ElkLike, ElkNodeLike } from "./types.js";

afterEach(() => {
  resetElkLoader();
});

function classDiagramWith(overrides: Partial<Diagram>): Diagram {
  return { ...createEmptyDiagram("class"), ...overrides };
}

function sequenceDiagramWith(overrides: Partial<Diagram>): Diagram {
  return { ...createEmptyDiagram("sequence"), ...overrides };
}

function c4DiagramWith(overrides: Partial<Diagram>): Diagram {
  return { ...createEmptyDiagram("c4-context"), ...overrides };
}

/**
 * Build a stub ELK constructor whose `layout(graph)` recursively assigns
 * deterministic coordinates: each node gets `(index * 250, depth * 100)`.
 * That keeps tests fast and platform-independent — no Worker, no real
 * algorithm — while still proving the adapter wires sources/targets and
 * boundary nesting correctly.
 */
function makeStubElk(): ElkConstructorLike {
  return class StubElk implements ElkLike {
    async layout(graph: ElkNodeLike): Promise<ElkNodeLike> {
      const assign = (node: ElkNodeLike, depth: number): void => {
        (node.children ?? []).forEach((child, index) => {
          child.x = index * 250;
          child.y = depth * 100;
          assign(child, depth + 1);
        });
      };
      assign(graph, 1);
      graph.width = 800;
      graph.height = 400;
      return graph;
    }
  } as unknown as ElkConstructorLike;
}

describe("layoutGrid — fallback", () => {
  it("returns an empty result for an empty diagram", () => {
    // Arrange / Act
    const result = layoutGrid(classDiagramWith({}));

    // Assert
    expect(result.coordinates).toEqual({});
    expect(result.engine).toBe("grid");
  });

  it("places nodes in a roughly square grid with deterministic spacing", () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [
        { id: "a", kind: "class", label: "A" },
        { id: "b", kind: "class", label: "B" },
        { id: "c", kind: "class", label: "C" },
        { id: "d", kind: "class", label: "D" },
      ],
    });

    // Act
    const result = layoutGrid(diagram);

    // Assert — 4 nodes → 2 columns, 2 rows
    const stepX = LAYOUT_DEFAULTS.nodeWidth + LAYOUT_DEFAULTS.spacing;
    const stepY = LAYOUT_DEFAULTS.nodeHeight + LAYOUT_DEFAULTS.spacing;
    expect(result.coordinates).toEqual({
      a: { x: 0, y: 0 },
      b: { x: stepX, y: 0 },
      c: { x: 0, y: stepY },
      d: { x: stepX, y: stepY },
    });
  });
});

describe("layoutSequence — custom algorithm", () => {
  it("places lifelines on a horizontal axis with y=0 and width covering all of them", () => {
    // Arrange
    const diagram = sequenceDiagramWith({
      nodes: [
        { id: "u", kind: "actor", label: "User" },
        { id: "a", kind: "lifeline", label: "Auth" },
        { id: "d", kind: "lifeline", label: "DB" },
      ],
      edges: [
        { id: "e1", source: "u", target: "a", kind: "sync-call" },
        { id: "e2", source: "a", target: "d", kind: "sync-call" },
      ],
    });

    // Act
    const result = layoutSequence(diagram);

    // Assert
    expect(result.engine).toBe("sequence");
    const xs = Object.values(result.coordinates).map((c) => c.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b)); // monotonic by node order
    expect(Object.values(result.coordinates).every((c) => c.y === 0)).toBe(true);
    expect(result.height).toBeGreaterThan(LAYOUT_DEFAULTS.nodeHeight);
  });

  it("returns an empty result when the diagram has no participants", () => {
    // Arrange / Act
    const result = layoutSequence(sequenceDiagramWith({}));

    // Assert
    expect(result.coordinates).toEqual({});
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });
});

describe("runElkLayout — adapter", () => {
  it("uses the supplied loader (no real elkjs import) and produces coordinates for every node", async () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [
        { id: "a", kind: "class", label: "A" },
        { id: "b", kind: "class", label: "B" },
      ],
      edges: [{ id: "e", source: "a", target: "b", kind: "association" }],
    });

    // Act
    const result = await runElkLayout(diagram, { elkLoader: () => Promise.resolve(makeStubElk()) });

    // Assert
    expect(result.engine).toBe("elk");
    expect(Object.keys(result.coordinates).sort()).toEqual(["a", "b"]);
  });

  it("nests boundary children so ELK lays them out inside the boundary box", async () => {
    // Arrange
    const diagram = c4DiagramWith({
      nodes: [
        { id: "p", kind: "person", label: "User" },
        { id: "s", kind: "system", label: "System" },
      ],
      groups: [{ id: "b", kind: "boundary", label: "Org", children: ["s"] }],
    });

    // Act
    const result = await runElkLayout(diagram, { elkLoader: () => Promise.resolve(makeStubElk()) });

    // Assert — boundary group has its own coordinate, and the nested
    // child's coordinate is offset by the boundary's origin (because the
    // adapter walks the tree depth-first and accumulates parent offsets).
    expect(result.coordinates["b"]).toBeDefined();
    expect(result.coordinates["s"]).toBeDefined();
    expect(result.coordinates["p"]).toBeDefined();
    expect(result.coordinates["s"]?.x).toBeGreaterThanOrEqual(result.coordinates["b"]!.x);
  });

  it("propagates the supplied algorithm option to ELK", async () => {
    // Arrange — capture the layoutOptions ELK would receive
    let capturedAlgorithm: string | undefined;
    const probingElk = class ProbingElk implements ElkLike {
      async layout(graph: ElkNodeLike): Promise<ElkNodeLike> {
        capturedAlgorithm = graph.layoutOptions?.["elk.algorithm"];
        return graph;
      }
    } as unknown as ElkConstructorLike;
    const diagram = classDiagramWith({
      nodes: [{ id: "a", kind: "class", label: "A" }],
    });

    // Act
    await runElkLayout(diagram, {
      elkLoader: () => Promise.resolve(probingElk),
      algorithm: "force",
    });

    // Assert
    expect(capturedAlgorithm).toBe("force");
  });
});

describe("runAutoLayout — dispatcher", () => {
  it("uses the sequence engine for sequence diagrams (no ELK import)", async () => {
    // Arrange
    const diagram = sequenceDiagramWith({
      nodes: [
        { id: "u", kind: "actor", label: "User" },
        { id: "a", kind: "lifeline", label: "Auth" },
      ],
    });

    // Act
    const result = await runAutoLayout(diagram);

    // Assert
    expect(result.engine).toBe("sequence");
  });

  it("falls back to grid when the ELK loader rejects", async () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [
        { id: "a", kind: "class", label: "A" },
        { id: "b", kind: "class", label: "B" },
        { id: "c", kind: "class", label: "C" },
      ],
    });

    // Act
    const result = await runAutoLayout(diagram, {
      elkLoader: () => Promise.reject(new Error("no elk in this env")),
    });

    // Assert
    expect(result.engine).toBe("grid");
    expect(Object.keys(result.coordinates).sort()).toEqual(["a", "b", "c"]);
  });

  it("integrates with applyLayoutCommand: dispatching the result records overrides", async () => {
    // Arrange
    const initial = classDiagramWith({
      nodes: [
        { id: "a", kind: "class", label: "A" },
        { id: "b", kind: "class", label: "B" },
      ],
    });
    const result = await runAutoLayout(initial, {
      elkLoader: () => Promise.resolve(makeStubElk()),
    });

    // Act
    const command = applyLayoutCommand(result.coordinates, initial);
    const next = command.apply(initial);

    // Assert
    expect(next.metadata.layoutOverrides).toEqual(result.coordinates);
    // Round-trip — invert restores the absent-overrides state byte-equal.
    const restored = command.invert(next);
    expect(restored.metadata.layoutOverrides).toBeUndefined();
  });
});

describe("performance — auto-layout budget", () => {
  it("lays out a 200-node graph in under 50ms (grid path is the budget guard)", () => {
    // Arrange — 200 disconnected nodes go through the synchronous grid
    // engine (the sequence engine already covers the synchronous-200
    // case for its own diagram type).
    const nodes = Array.from({ length: 200 }, (_, i) => ({
      id: `n${i}`,
      kind: "class" as const,
      label: `N${i}`,
    }));
    const diagram = classDiagramWith({ nodes });

    // Act
    const start = performance.now();
    const result = layoutGrid(diagram);
    const elapsed = performance.now() - start;

    // Assert — well under the 50ms NFR; runs in single-digit ms locally.
    expect(elapsed).toBeLessThan(50);
    expect(Object.keys(result.coordinates)).toHaveLength(200);
  });
});

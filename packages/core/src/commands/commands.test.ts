import { describe, expect, it } from "vitest";

import { createEmptyDiagram } from "../model/factory.js";
import { uuidv7 } from "../model/ids.js";
import type { Diagram, DiagramEdge, DiagramGroup, DiagramNode } from "../model/types.js";
import { addEdgeCommand } from "./addEdge.js";
import { addNodeCommand } from "./addNode.js";
import { applyLayoutCommand } from "./applyLayout.js";
import {
  addGroupCommand,
  addNodeToGroupCommand,
  removeGroupCommand,
  removeNodeFromGroupCommand,
  updateGroupCommand,
} from "./group.js";
import { moveGroupCommand } from "./moveGroup.js";
import { resizeGroupCommand } from "./resizeGroup.js";
import { importTextCommand } from "./importText.js";
import { moveEdgeLabelCommand } from "./moveEdgeLabel.js";
import { moveNodeCommand } from "./moveNode.js";
import { removeEdgeCommand } from "./removeEdge.js";
import { removeNodeCommand } from "./removeNode.js";
import { updateEdgeCommand } from "./updateEdge.js";
import { updateNodeCommand } from "./updateNode.js";

function makeNode(label: string): DiagramNode {
  return { id: uuidv7(), kind: "class", label };
}

function makeEdge(source: string, target: string): DiagramEdge {
  return { id: uuidv7(), source, target, kind: "association" };
}

function makeGroup(label: string, children: string[] = []): DiagramGroup {
  return { id: uuidv7(), kind: "package", label, children };
}

/** Shared assertion: command's apply → invert returns a JSON-byte-equal AST. */
function expectRoundTrip(
  initial: Diagram,
  build: (d: Diagram) => {
    apply(d: Diagram): Diagram;
    invert(d: Diagram): Diagram;
  },
): void {
  const before = JSON.stringify(initial);
  const command = build(initial);
  const after = command.apply(initial);
  const restored = command.invert(after);
  expect(JSON.stringify(restored)).toBe(before);
}

describe("addNodeCommand", () => {
  it("adds the node on apply and removes it on invert (byte-equal round-trip)", () => {
    // Arrange
    const initial = createEmptyDiagram("class");
    const node = makeNode("Foo");

    // Act + Assert
    expectRoundTrip(initial, () => addNodeCommand(node));

    // And: apply moves us forward to the expected shape
    const cmd = addNodeCommand(node);
    expect(cmd.apply(initial).nodes).toEqual([node]);
    expect(cmd.kind).toBe("AddNode");
  });

  it("clones the input node so caller mutations don't leak in", () => {
    // Arrange
    const node = makeNode("Foo");

    // Act
    const cmd = addNodeCommand(node);
    node.label = "Mutant";

    // Assert
    expect(cmd.payload.node.label).toBe("Foo");
  });
});

describe("removeNodeCommand", () => {
  it("removes node + cascaded edges + saved layout, fully reversible", () => {
    // Arrange
    const a = makeNode("A");
    const b = makeNode("B");
    const c = makeNode("C");
    const e1 = makeEdge(a.id, b.id);
    const e2 = makeEdge(c.id, a.id);
    const initial: Diagram = {
      ...createEmptyDiagram("class"),
      nodes: [a, b, c],
      edges: [e1, e2],
      metadata: {
        schemaVersion: "0.1.0",
        layoutOverrides: { [a.id]: { x: 10, y: 20 } },
      },
    };

    // Act
    const before = JSON.stringify(initial);
    const cmd = removeNodeCommand(a.id, initial);
    const post = cmd.apply(initial);

    // Assert — the post-state has a removed
    expect(post.nodes.map((n) => n.id)).toEqual([b.id, c.id]);
    expect(post.edges).toEqual([]);
    expect(post.metadata.layoutOverrides).toBeUndefined();

    // Assert — invert restores byte-for-byte
    expect(JSON.stringify(cmd.invert(post))).toBe(before);
  });

  it("throws if the target node does not exist", () => {
    // Arrange
    const diagram = createEmptyDiagram("class");

    // Act + Assert
    expect(() => removeNodeCommand("missing", diagram)).toThrowError(/not found/u);
  });
});

describe("moveNodeCommand", () => {
  it("writes new coordinates and inverts back to absent override (round-trip)", () => {
    // Arrange — diagram with no layout overrides
    const a = makeNode("A");
    const initial: Diagram = {
      ...createEmptyDiagram("class"),
      nodes: [a],
    };

    // Act + Assert
    expectRoundTrip(initial, (d) => moveNodeCommand(a.id, { x: 100, y: 200 }, d));
  });

  it("inverts back to a previous coordinate when the node already had a position", () => {
    // Arrange
    const a = makeNode("A");
    const initial: Diagram = {
      ...createEmptyDiagram("class"),
      nodes: [a],
      metadata: { schemaVersion: "0.1.0", layoutOverrides: { [a.id]: { x: 10, y: 20 } } },
    };

    // Act
    const before = JSON.stringify(initial);
    const cmd = moveNodeCommand(a.id, { x: 100, y: 200 }, initial);
    const post = cmd.apply(initial);

    // Assert
    expect(post.metadata.layoutOverrides?.[a.id]).toEqual({ x: 100, y: 200 });
    expect(JSON.stringify(cmd.invert(post))).toBe(before);
  });

  it("preserves a manually-resized width/height when only x/y are updated", () => {
    // Arrange — node has a previous override with explicit size from a resize
    const a = makeNode("A");
    const initial: Diagram = {
      ...createEmptyDiagram("class"),
      nodes: [a],
      metadata: {
        schemaVersion: "0.1.0",
        layoutOverrides: { [a.id]: { x: 10, y: 20, width: 320, height: 200 } },
      },
    };

    // Act — move to new coordinates without touching size
    const cmd = moveNodeCommand(a.id, { x: 100, y: 200 }, initial);
    const post = cmd.apply(initial);

    // Assert — width/height carry over so the node doesn't resize back to auto
    expect(post.metadata.layoutOverrides?.[a.id]).toEqual({
      x: 100,
      y: 200,
      width: 320,
      height: 200,
    });
  });
});

describe("updateNodeCommand", () => {
  it("applies a partial patch; invert restores the full original snapshot", () => {
    // Arrange
    const a: DiagramNode = { id: uuidv7(), kind: "class", label: "Old" };
    const initial: Diagram = { ...createEmptyDiagram("class"), nodes: [a] };

    // Act + Assert
    expectRoundTrip(initial, (d) =>
      updateNodeCommand(a.id, { label: "New", stereotype: "service" }, d),
    );

    const cmd = updateNodeCommand(a.id, { label: "New", stereotype: "service" }, initial);
    const post = cmd.apply(initial);
    expect(post.nodes[0]?.label).toBe("New");
    expect(post.nodes[0]?.stereotype).toBe("service");
  });

  it("ignores explicit undefined patch values (exactOptionalPropertyTypes friendly)", () => {
    // Arrange
    const a: DiagramNode = { id: uuidv7(), kind: "class", label: "X" };
    const initial: Diagram = { ...createEmptyDiagram("class"), nodes: [a] };
    // Patches that arrive from JSON / dynamic sources may carry explicit
    // `undefined` values; the runtime contract says those are ignored.
    const dynamicPatch = { label: undefined, description: "set" } as unknown as Parameters<
      typeof updateNodeCommand
    >[1];

    // Act
    const cmd = updateNodeCommand(a.id, dynamicPatch, initial);
    const post = cmd.apply(initial);

    // Assert — label preserved (undefined did not overwrite), description added
    expect(post.nodes[0]?.label).toBe("X");
    expect(post.nodes[0]?.description).toBe("set");
  });

  it("throws if the target node does not exist", () => {
    expect(() =>
      updateNodeCommand("missing", { label: "x" }, createEmptyDiagram("class")),
    ).toThrowError(/not found/u);
  });
});

describe("addEdgeCommand / removeEdgeCommand / updateEdgeCommand", () => {
  it("adds and removes edges round-trip", () => {
    // Arrange
    const a = makeNode("A");
    const b = makeNode("B");
    const initial: Diagram = { ...createEmptyDiagram("class"), nodes: [a, b] };

    // Act + Assert
    const edge = makeEdge(a.id, b.id);
    expectRoundTrip(initial, () => addEdgeCommand(edge));

    const withEdge: Diagram = { ...initial, edges: [edge] };
    expectRoundTrip(withEdge, (d) => removeEdgeCommand(edge.id, d));
  });

  it("updates an edge via patch round-trip", () => {
    // Arrange
    const a = makeNode("A");
    const b = makeNode("B");
    const edge = makeEdge(a.id, b.id);
    const initial: Diagram = { ...createEmptyDiagram("class"), nodes: [a, b], edges: [edge] };

    // Act + Assert
    expectRoundTrip(initial, (d) =>
      updateEdgeCommand(edge.id, { kind: "inheritance", label: "extends" }, d),
    );
  });
});

describe("moveEdgeLabelCommand", () => {
  it("writes a new offset on apply and inverts back to absent override", () => {
    // Arrange — edge with no label override
    const a = makeNode("A");
    const b = makeNode("B");
    const edge = makeEdge(a.id, b.id);
    const initial: Diagram = { ...createEmptyDiagram("class"), nodes: [a, b], edges: [edge] };

    // Act + Assert — round-trip back to no edgeLayoutOverrides field
    expectRoundTrip(initial, (d) =>
      moveEdgeLabelCommand(edge.id, { labelOffsetX: 40, labelOffsetY: -24 }, d),
    );

    const cmd = moveEdgeLabelCommand(edge.id, { labelOffsetX: 40, labelOffsetY: -24 }, initial);
    expect(cmd.kind).toBe("MoveEdgeLabel");
    expect(cmd.apply(initial).metadata.edgeLayoutOverrides?.[edge.id]).toEqual({
      labelOffsetX: 40,
      labelOffsetY: -24,
    });
  });

  it("inverts back to a previous offset when the edge already had one", () => {
    // Arrange
    const a = makeNode("A");
    const b = makeNode("B");
    const edge = makeEdge(a.id, b.id);
    const initial: Diagram = {
      ...createEmptyDiagram("class"),
      nodes: [a, b],
      edges: [edge],
      metadata: {
        schemaVersion: "0.1.0",
        edgeLayoutOverrides: { [edge.id]: { labelOffsetX: 10, labelOffsetY: 0 } },
      },
    };

    // Act
    const before = JSON.stringify(initial);
    const cmd = moveEdgeLabelCommand(edge.id, { labelOffsetX: 100, labelOffsetY: 200 }, initial);
    const post = cmd.apply(initial);

    // Assert
    expect(post.metadata.edgeLayoutOverrides?.[edge.id]).toEqual({
      labelOffsetX: 100,
      labelOffsetY: 200,
    });
    expect(JSON.stringify(cmd.invert(post))).toBe(before);
  });
});

describe("group commands", () => {
  it("addGroupCommand round-trip", () => {
    // Arrange
    const initial = createEmptyDiagram("class");
    const group = makeGroup("ui");

    // Act + Assert
    expectRoundTrip(initial, () => addGroupCommand(group));
  });

  it("updateGroupCommand round-trip", () => {
    // Arrange
    const group = makeGroup("ui", ["n1"]);
    const initial: Diagram = { ...createEmptyDiagram("class"), groups: [group] };

    // Act + Assert
    expectRoundTrip(initial, (d) =>
      updateGroupCommand(group.id, { label: "renamed", children: ["n1", "n2"] }, d),
    );
  });

  it("removeGroupCommand restores the original index", () => {
    // Arrange
    const g1 = makeGroup("g1");
    const g2 = makeGroup("g2");
    const g3 = makeGroup("g3");
    const initial: Diagram = { ...createEmptyDiagram("class"), groups: [g1, g2, g3] };

    // Act + Assert
    expectRoundTrip(initial, (d) => removeGroupCommand(g2.id, d));
  });

  it("addNodeToGroupCommand inserts a child id and is idempotent", () => {
    // Arrange
    const group = makeGroup("g", ["n1"]);
    const diagram: Diagram = { ...createEmptyDiagram("class"), groups: [group] };

    // Act — first call adds, second is a no-op
    const cmd = addNodeToGroupCommand("n2", group.id, diagram);
    expect(cmd).not.toBeNull();
    const after = cmd!.apply(diagram);
    expect(after.groups[0]?.children).toEqual(["n1", "n2"]);
    expect(addNodeToGroupCommand("n2", group.id, after)).toBeNull();
  });

  it("removeNodeFromGroupCommand drops a child id and is idempotent", () => {
    // Arrange
    const group = makeGroup("g", ["n1", "n2"]);
    const diagram: Diagram = { ...createEmptyDiagram("class"), groups: [group] };

    // Act
    const cmd = removeNodeFromGroupCommand("n1", group.id, diagram);
    expect(cmd).not.toBeNull();
    const after = cmd!.apply(diagram);
    expect(after.groups[0]?.children).toEqual(["n2"]);
    expect(removeNodeFromGroupCommand("n1", group.id, after)).toBeNull();
  });

  it("addGroupCommand with layout writes layoutOverrides[groupId] in the same frame", () => {
    // Arrange
    const initial = createEmptyDiagram("c4-context");

    // Act
    const cmd = addGroupCommand(
      { id: "g1", kind: "boundary", label: "B", children: [] },
      { x: 100, y: 200, width: 320, height: 200 },
    );
    const after = cmd.apply(initial);

    // Assert
    expect(after.groups[0]?.id).toBe("g1");
    expect(after.metadata.layoutOverrides?.["g1"]).toEqual({
      x: 100,
      y: 200,
      width: 320,
      height: 200,
    });

    // Invert restores the empty state
    const reverted = cmd.invert(after);
    expect(reverted.groups).toEqual([]);
    expect(reverted.metadata.layoutOverrides?.["g1"]).toBeUndefined();
  });

  it("moveGroupCommand round-trip writes/restores layoutOverrides[groupId]", () => {
    // Arrange — group already in diagram, no override yet
    const group = makeGroup("g", []);
    const initial: Diagram = { ...createEmptyDiagram("c4-context"), groups: [group] };

    // Act
    const cmd = moveGroupCommand(group.id, { x: 50, y: 60 }, initial);
    const after = cmd.apply(initial);

    // Assert
    expect(after.metadata.layoutOverrides?.[group.id]).toEqual({ x: 50, y: 60 });
    const reverted = cmd.invert(after);
    expect(reverted.metadata.layoutOverrides?.[group.id]).toBeUndefined();
  });

  it("resizeGroupCommand persists the full rect and inverts cleanly", () => {
    // Arrange
    const group = makeGroup("g", []);
    const initial: Diagram = {
      ...createEmptyDiagram("c4-context"),
      groups: [group],
      metadata: {
        schemaVersion: "1.0.0",
        layoutOverrides: { [group.id]: { x: 0, y: 0, width: 320, height: 200 } },
      },
    };

    // Act
    const cmd = resizeGroupCommand(group.id, { x: 0, y: 0, width: 640, height: 400 }, initial);
    const after = cmd.apply(initial);

    // Assert
    expect(after.metadata.layoutOverrides?.[group.id]).toEqual({
      x: 0,
      y: 0,
      width: 640,
      height: 400,
    });
    const reverted = cmd.invert(after);
    expect(reverted.metadata.layoutOverrides?.[group.id]).toEqual({
      x: 0,
      y: 0,
      width: 320,
      height: 200,
    });
  });
});

describe("applyLayoutCommand", () => {
  it("replaces every layout override; invert restores absent state", () => {
    // Arrange
    const initial = createEmptyDiagram("class");

    // Act + Assert
    expectRoundTrip(initial, (d) => applyLayoutCommand({ a: { x: 1, y: 2 } }, d));
  });

  it("invert restores prior overrides when they existed", () => {
    // Arrange
    const initial: Diagram = {
      ...createEmptyDiagram("class"),
      metadata: { schemaVersion: "0.1.0", layoutOverrides: { foo: { x: 5, y: 5 } } },
    };

    // Act + Assert
    expectRoundTrip(initial, (d) =>
      applyLayoutCommand({ foo: { x: 99, y: 99 }, bar: { x: 10, y: 10 } }, d),
    );
  });
});

describe("importTextCommand", () => {
  it("replaces the whole AST; invert restores the original", () => {
    // Arrange
    const before: Diagram = {
      ...createEmptyDiagram("class"),
      title: "Before",
    };
    const after: Diagram = {
      ...createEmptyDiagram("er"),
      title: "After",
      nodes: [{ id: uuidv7(), kind: "entity", label: "User" }],
    };

    // Act
    const cmd = importTextCommand(after, before);

    // Assert — apply yields after-shape, invert returns before
    expect(cmd.apply(before)).toEqual(after);
    expect(cmd.invert(after)).toEqual(before);
    // Round-trip preserves the original by-value
    expect(JSON.stringify(cmd.invert(cmd.apply(before)))).toBe(JSON.stringify(before));
  });

  it("works against an arbitrary current state (apply ignores the input AST)", () => {
    // Arrange
    const start = createEmptyDiagram("class");
    const target = createEmptyDiagram("er");
    const noise = { ...start, title: "noisy" };

    // Act
    const cmd = importTextCommand(target, start);

    // Assert
    expect(cmd.apply(noise)).toEqual(target);
  });
});

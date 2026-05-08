import { describe, expect, it } from "vitest";

import { createEmptyDiagram } from "./factory.js";
import { uuidv7 } from "./ids.js";
import {
  findEdge,
  findGroup,
  findNode,
  getEdgesOfNode,
  getIncomingEdges,
  getOutgoingEdges,
  getParentGroups,
} from "./query.js";
import type { Diagram, DiagramEdge, DiagramGroup, DiagramNode } from "./types.js";

function makeNode(label: string): DiagramNode {
  return { id: uuidv7(), kind: "class", label };
}

function makeEdge(source: string, target: string): DiagramEdge {
  return { id: uuidv7(), source, target, kind: "association" };
}

function makeGroup(label: string, children: string[]): DiagramGroup {
  return { id: uuidv7(), kind: "package", label, children };
}

function fixture(): {
  diagram: Diagram;
  alice: DiagramNode;
  bob: DiagramNode;
  carol: DiagramNode;
  e1: DiagramEdge;
  e2: DiagramEdge;
  pkg: DiagramGroup;
} {
  const alice = makeNode("Alice");
  const bob = makeNode("Bob");
  const carol = makeNode("Carol");
  const e1 = makeEdge(alice.id, bob.id);
  const e2 = makeEdge(carol.id, alice.id);
  const pkg = makeGroup("p", [alice.id, bob.id]);

  const diagram: Diagram = {
    ...createEmptyDiagram("class"),
    nodes: [alice, bob, carol],
    edges: [e1, e2],
    groups: [pkg],
  };

  return { diagram, alice, bob, carol, e1, e2, pkg };
}

describe("findNode / findEdge / findGroup", () => {
  it("returns the matching element by id", () => {
    // Arrange
    const { diagram, alice, e1, pkg } = fixture();

    // Act & Assert
    expect(findNode(diagram, alice.id)).toBe(alice);
    expect(findEdge(diagram, e1.id)).toBe(e1);
    expect(findGroup(diagram, pkg.id)).toBe(pkg);
  });

  it("returns undefined for unknown ids", () => {
    // Arrange
    const { diagram } = fixture();

    // Act & Assert
    expect(findNode(diagram, "missing")).toBeUndefined();
    expect(findEdge(diagram, "missing")).toBeUndefined();
    expect(findGroup(diagram, "missing")).toBeUndefined();
  });
});

describe("edge queries", () => {
  it("returns all edges touching a node — incoming + outgoing", () => {
    // Arrange
    const { diagram, alice, e1, e2 } = fixture();

    // Act
    const edges = getEdgesOfNode(diagram, alice.id);

    // Assert
    expect(edges).toEqual([e1, e2]);
  });

  it("splits incoming and outgoing edges", () => {
    // Arrange
    const { diagram, alice, e1, e2 } = fixture();

    // Act & Assert
    expect(getOutgoingEdges(diagram, alice.id)).toEqual([e1]);
    expect(getIncomingEdges(diagram, alice.id)).toEqual([e2]);
  });

  it("returns an empty list for an unknown or isolated node", () => {
    // Arrange
    const { diagram } = fixture();

    // Act & Assert
    expect(getEdgesOfNode(diagram, "missing")).toEqual([]);
  });
});

describe("getParentGroups", () => {
  it("returns groups directly containing the element", () => {
    // Arrange
    const { diagram, alice, pkg } = fixture();

    // Act
    const parents = getParentGroups(diagram, alice.id);

    // Assert
    expect(parents).toEqual([pkg]);
  });

  it("returns an empty list for ungrouped elements", () => {
    // Arrange
    const { diagram, carol } = fixture();

    // Act & Assert
    expect(getParentGroups(diagram, carol.id)).toEqual([]);
  });
});

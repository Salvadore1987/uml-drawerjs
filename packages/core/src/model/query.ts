import type { Diagram, DiagramEdge, DiagramGroup, DiagramNode } from "./types.js";

/** Returns the node with the given id, or `undefined` if not found. */
export function findNode(diagram: Diagram, nodeId: string): DiagramNode | undefined {
  return diagram.nodes.find((node) => node.id === nodeId);
}

/** Returns the edge with the given id, or `undefined` if not found. */
export function findEdge(diagram: Diagram, edgeId: string): DiagramEdge | undefined {
  return diagram.edges.find((edge) => edge.id === edgeId);
}

/** Returns the group with the given id, or `undefined` if not found. */
export function findGroup(diagram: Diagram, groupId: string): DiagramGroup | undefined {
  return diagram.groups.find((group) => group.id === groupId);
}

/**
 * Returns every edge that touches the given node — outgoing or incoming.
 * Order matches the order in `diagram.edges`.
 */
export function getEdgesOfNode(diagram: Diagram, nodeId: string): DiagramEdge[] {
  return diagram.edges.filter((edge) => edge.source === nodeId || edge.target === nodeId);
}

/** Returns every edge with `nodeId` as its source. */
export function getOutgoingEdges(diagram: Diagram, nodeId: string): DiagramEdge[] {
  return diagram.edges.filter((edge) => edge.source === nodeId);
}

/** Returns every edge with `nodeId` as its target. */
export function getIncomingEdges(diagram: Diagram, nodeId: string): DiagramEdge[] {
  return diagram.edges.filter((edge) => edge.target === nodeId);
}

/**
 * Returns every group that directly contains the given element id.
 * Walks groups via `children`, no transitive ancestry.
 */
export function getParentGroups(diagram: Diagram, elementId: string): DiagramGroup[] {
  return diagram.groups.filter((group) => group.children.includes(elementId));
}

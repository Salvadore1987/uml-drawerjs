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
 * The C4-PlantUML relationship tag that marks an interaction as
 * asynchronous. Edges carrying it render with a dashed stroke; the
 * generator emits `$tags="async"` plus an `AddRelTag("async", ...)`
 * header so external PlantUML renderers draw the same dash.
 */
export const ASYNC_EDGE_TAG = "async";

/** True when the edge carries the C4 "async" tag (dashed interaction). */
export function hasAsyncTag(edge: DiagramEdge): boolean {
  return edge.tags?.includes(ASYNC_EDGE_TAG) ?? false;
}

/**
 * Returns every group that directly contains the given element id.
 * Walks groups via `children`, no transitive ancestry.
 */
export function getParentGroups(diagram: Diagram, elementId: string): DiagramGroup[] {
  return diagram.groups.filter((group) => group.children.includes(elementId));
}

/**
 * Recursively collect every element contained in `groupId`, classified as
 * node vs nested group. `group.children` holds node ids AND nested group ids;
 * this walks the whole subtree so a parent move can carry all descendants.
 * The root group itself is excluded. `seen` guards against malformed cycles.
 */
export function collectGroupDescendants(
  diagram: Diagram,
  groupId: string,
): { nodeIds: string[]; groupIds: string[] } {
  const groupById = new Map(diagram.groups.map((g) => [g.id, g]));
  const isNode = new Set(diagram.nodes.map((n) => n.id));
  const nodeIds: string[] = [];
  const groupIds: string[] = [];
  // Seed with the root so it can never re-enter as its own descendant via a
  // malformed cycle (a→b→a).
  const seen = new Set<string>([groupId]);
  const walk = (gid: string): void => {
    const group = groupById.get(gid);
    if (!group) return;
    for (const childId of group.children) {
      if (seen.has(childId)) continue;
      seen.add(childId);
      if (groupById.has(childId)) {
        groupIds.push(childId);
        walk(childId);
      } else if (isNode.has(childId)) {
        nodeIds.push(childId);
      }
    }
  };
  walk(groupId);
  return { nodeIds, groupIds };
}

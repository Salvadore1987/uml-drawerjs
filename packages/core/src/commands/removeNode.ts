import { findNode } from "../model/query.js";
import type { Diagram, DiagramEdge, DiagramNode } from "../model/types.js";
import { dropEdge, dropNode, setLayoutOverride } from "./base.js";
import type { Command } from "./base.js";

export interface RemovedEdgeRecord {
  readonly index: number;
  readonly edge: DiagramEdge;
}

export interface RemoveNodePayload {
  readonly nodeId: string;
  /** Snapshot of the node — restored on invert. */
  readonly node: DiagramNode;
  /** Original position of the node in `diagram.nodes`. */
  readonly nodeIndex: number;
  /** Edges touching the node — cascaded out and back at original indices. */
  readonly cascadedEdges: readonly RemovedEdgeRecord[];
  /** Position from `metadata.layoutOverrides` at remove time, or null if none. */
  readonly previousPosition: { x: number; y: number } | null;
}

export type RemoveNodeCommand = Command<"RemoveNode", RemoveNodePayload>;

/**
 * Remove the node with `nodeId` from the diagram, cascading every edge that
 * touches it. Inverse re-inserts the node and the cascaded edges at their
 * original array indices and (if any) restores the saved layout override —
 * yielding a JSON-byte-equal pre-state.
 */
export function removeNodeCommand(nodeId: string, diagram: Diagram): RemoveNodeCommand {
  const nodeIndex = diagram.nodes.findIndex((n) => n.id === nodeId);
  if (nodeIndex === -1) {
    throw new Error(`removeNodeCommand: node ${nodeId} not found`);
  }
  const node = findNode(diagram, nodeId);
  if (!node) {
    throw new Error(`removeNodeCommand: node ${nodeId} not found`);
  }

  const cascadedEdges: RemovedEdgeRecord[] = [];
  for (let i = 0; i < diagram.edges.length; i++) {
    const edge = diagram.edges[i];
    if (!edge) continue;
    if (edge.source === nodeId || edge.target === nodeId) {
      cascadedEdges.push({ index: i, edge: structuredClone(edge) });
    }
  }

  const savedPosition = diagram.metadata.layoutOverrides?.[nodeId];
  const payload: RemoveNodePayload = {
    nodeId,
    node: structuredClone(node),
    nodeIndex,
    cascadedEdges,
    previousPosition: savedPosition ? { ...savedPosition } : null,
  };

  return {
    kind: "RemoveNode",
    payload,
    apply(input: Diagram): Diagram {
      let next = dropNode(input, payload.nodeId);
      for (const record of payload.cascadedEdges) {
        next = dropEdge(next, record.edge.id);
      }
      if (payload.previousPosition) {
        next = setLayoutOverride(next, payload.nodeId, undefined);
      }
      return next;
    },
    invert(input: Diagram): Diagram {
      // Re-insert the node at its original index.
      const nodes = [
        ...input.nodes.slice(0, payload.nodeIndex),
        payload.node,
        ...input.nodes.slice(payload.nodeIndex),
      ];

      // Re-insert each cascaded edge at its original index. Sorting ascending
      // means earlier indices land first; subsequent inserts shift later ones
      // forward — which is exactly the original insertion order.
      const edges = [...input.edges];
      const sorted = [...payload.cascadedEdges].sort((a, b) => a.index - b.index);
      for (const record of sorted) {
        edges.splice(record.index, 0, record.edge);
      }

      let next: Diagram = { ...input, nodes, edges };
      if (payload.previousPosition) {
        next = setLayoutOverride(next, payload.nodeId, { ...payload.previousPosition });
      }
      return next;
    },
  };
}

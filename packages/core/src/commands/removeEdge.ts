import { findEdge } from "../model/query.js";
import type { Diagram, DiagramEdge } from "../model/types.js";
import { appendEdge, dropEdge } from "./base.js";
import type { Command } from "./base.js";

export interface RemoveEdgePayload {
  readonly edgeId: string;
  readonly edge: DiagramEdge;
}

export type RemoveEdgeCommand = Command<"RemoveEdge", RemoveEdgePayload>;

export function removeEdgeCommand(edgeId: string, diagram: Diagram): RemoveEdgeCommand {
  const edge = findEdge(diagram, edgeId);
  if (!edge) {
    throw new Error(`removeEdgeCommand: edge ${edgeId} not found`);
  }
  const payload: RemoveEdgePayload = { edgeId, edge: structuredClone(edge) };
  return {
    kind: "RemoveEdge",
    payload,
    apply(input: Diagram): Diagram {
      return dropEdge(input, payload.edgeId);
    },
    invert(input: Diagram): Diagram {
      return appendEdge(input, payload.edge);
    },
  };
}

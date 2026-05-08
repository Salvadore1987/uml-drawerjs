import { findEdge } from "../model/query.js";
import type { Diagram, DiagramEdge } from "../model/types.js";
import { applyPatch, replaceEdge } from "./base.js";
import type { Command } from "./base.js";

export type EdgePatch = Partial<Omit<DiagramEdge, "id">>;

export interface UpdateEdgePayload {
  readonly edgeId: string;
  readonly before: DiagramEdge;
  readonly after: DiagramEdge;
}

export type UpdateEdgeCommand = Command<"UpdateEdge", UpdateEdgePayload>;

export function updateEdgeCommand(
  edgeId: string,
  patch: EdgePatch,
  diagram: Diagram,
): UpdateEdgeCommand {
  const before = findEdge(diagram, edgeId);
  if (!before) {
    throw new Error(`updateEdgeCommand: edge ${edgeId} not found`);
  }
  const beforeSnap = structuredClone(before);
  const afterSnap = structuredClone(applyPatch(before, patch as Partial<DiagramEdge>));
  const payload: UpdateEdgePayload = { edgeId, before: beforeSnap, after: afterSnap };
  return {
    kind: "UpdateEdge",
    payload,
    apply(input: Diagram): Diagram {
      return replaceEdge(input, payload.after);
    },
    invert(input: Diagram): Diagram {
      return replaceEdge(input, payload.before);
    },
  };
}

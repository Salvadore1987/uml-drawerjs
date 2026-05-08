import type { Diagram, DiagramEdge } from "../model/types.js";
import { appendEdge, dropEdge } from "./base.js";
import type { Command } from "./base.js";

export interface AddEdgePayload {
  readonly edge: DiagramEdge;
}

export type AddEdgeCommand = Command<"AddEdge", AddEdgePayload>;

export function addEdgeCommand(edge: DiagramEdge): AddEdgeCommand {
  const payload: AddEdgePayload = { edge: structuredClone(edge) };
  return {
    kind: "AddEdge",
    payload,
    apply(diagram: Diagram): Diagram {
      return appendEdge(diagram, payload.edge);
    },
    invert(diagram: Diagram): Diagram {
      return dropEdge(diagram, payload.edge.id);
    },
  };
}

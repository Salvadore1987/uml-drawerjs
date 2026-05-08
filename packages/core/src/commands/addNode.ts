import type { Diagram, DiagramNode } from "../model/types.js";
import { appendNode, dropNode } from "./base.js";
import type { Command } from "./base.js";

export interface AddNodePayload {
  readonly node: DiagramNode;
}

export type AddNodeCommand = Command<"AddNode", AddNodePayload>;

/**
 * Append `node` to `diagram.nodes`. The node is supplied fully formed by the
 * caller (the renderer/factory generates the id), so the inverse simply
 * drops it by id.
 */
export function addNodeCommand(node: DiagramNode): AddNodeCommand {
  const payload: AddNodePayload = { node: structuredClone(node) };
  return {
    kind: "AddNode",
    payload,
    apply(diagram: Diagram): Diagram {
      return appendNode(diagram, payload.node);
    },
    invert(diagram: Diagram): Diagram {
      return dropNode(diagram, payload.node.id);
    },
  };
}

import { findNode } from "../model/query.js";
import type { Diagram, DiagramNode } from "../model/types.js";
import { applyPatch, replaceNode } from "./base.js";
import type { Command } from "./base.js";

/**
 * Patch shape — a subset of `DiagramNode` where every field is optional.
 * `id` is intentionally omitted: the command targets a node by id and
 * never rewrites it, which keeps invariants stable for downstream code.
 */
export type NodePatch = Partial<Omit<DiagramNode, "id">>;

export interface UpdateNodePayload {
  readonly nodeId: string;
  /** Full snapshot before the update — invert restores this verbatim. */
  readonly before: DiagramNode;
  /** Full snapshot after the update — apply replaces with this. */
  readonly after: DiagramNode;
}

export type UpdateNodeCommand = Command<"UpdateNode", UpdateNodePayload>;

export function updateNodeCommand(
  nodeId: string,
  patch: NodePatch,
  diagram: Diagram,
): UpdateNodeCommand {
  const before = findNode(diagram, nodeId);
  if (!before) {
    throw new Error(`updateNodeCommand: node ${nodeId} not found`);
  }
  const beforeSnap = structuredClone(before);
  const afterSnap = structuredClone(applyPatch(before, patch as Partial<DiagramNode>));
  const payload: UpdateNodePayload = {
    nodeId,
    before: beforeSnap,
    after: afterSnap,
  };

  return {
    kind: "UpdateNode",
    payload,
    apply(input: Diagram): Diagram {
      return replaceNode(input, payload.after);
    },
    invert(input: Diagram): Diagram {
      return replaceNode(input, payload.before);
    },
  };
}

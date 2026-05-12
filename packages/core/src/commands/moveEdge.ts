import type { Diagram } from "../model/types.js";
import type { Command } from "./base.js";

/**
 * Reorder a single edge inside `diagram.edges`. Sequence diagrams care
 * about the array order — it's the chronological message order — so this
 * command is the AST-level primitive behind the drag-to-reorder gesture
 * in `interactions.ts`.
 *
 * `fromIndex` and `toIndex` are captured at construction time so
 * `apply` / `invert` round-trip byte-equal even after intermediate
 * commands. Out-of-range indices are clamped to keep the command total
 * — callers don't need to second-guess the current diagram's length.
 */
export interface MoveEdgePayload {
  readonly edgeId: string;
  readonly fromIndex: number;
  readonly toIndex: number;
}

export type MoveEdgeCommand = Command<"MoveEdge", MoveEdgePayload>;

export function moveEdgeCommand(
  edgeId: string,
  toIndex: number,
  diagram: Diagram,
): MoveEdgeCommand {
  const fromIndex = diagram.edges.findIndex((e) => e.id === edgeId);
  if (fromIndex < 0) {
    throw new Error(`moveEdgeCommand: edge ${edgeId} not found`);
  }
  const clamped = Math.max(0, Math.min(toIndex, diagram.edges.length - 1));
  const payload: MoveEdgePayload = { edgeId, fromIndex, toIndex: clamped };
  return {
    kind: "MoveEdge",
    payload,
    apply(input): Diagram {
      return reorder(input, payload.fromIndex, payload.toIndex);
    },
    invert(input): Diagram {
      return reorder(input, payload.toIndex, payload.fromIndex);
    },
  };
}

function reorder(diagram: Diagram, from: number, to: number): Diagram {
  if (from === to) return diagram;
  const next = [...diagram.edges];
  const [moved] = next.splice(from, 1);
  if (!moved) return diagram;
  next.splice(to, 0, moved);
  return { ...diagram, edges: next };
}

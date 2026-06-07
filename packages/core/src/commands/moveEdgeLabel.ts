import type { Diagram, EdgeLayoutOverride } from "../model/types.js";
import type { Command } from "./base.js";

export interface MoveEdgeLabelPayload {
  readonly edgeId: string;
  readonly from: EdgeLayoutOverride | null;
  readonly to: EdgeLayoutOverride;
}

export type MoveEdgeLabelCommand = Command<"MoveEdgeLabel", MoveEdgeLabelPayload>;

/**
 * Move an edge's label by writing a `{ labelOffsetX, labelOffsetY }` delta
 * into `metadata.edgeLayoutOverrides[edgeId]`. The offset is measured
 * relative to the auto-routed segment midpoint, so the label tracks the
 * line when source/target nodes are repositioned.
 *
 * The previous override (or `null` if none existed) is captured at
 * construction time so the inverse restores the prior state byte-equally —
 * mirrors the contract of `moveNodeCommand`.
 */
export function moveEdgeLabelCommand(
  edgeId: string,
  to: EdgeLayoutOverride,
  diagram: Diagram,
): MoveEdgeLabelCommand {
  const previous = diagram.metadata.edgeLayoutOverrides?.[edgeId];
  const payload: MoveEdgeLabelPayload = {
    edgeId,
    from: previous ? { ...previous } : null,
    to: { ...to },
  };

  return {
    kind: "MoveEdgeLabel",
    payload,
    apply(input: Diagram): Diagram {
      return setEdgeLayoutOverride(input, payload.edgeId, { ...payload.to });
    },
    invert(input: Diagram): Diagram {
      return setEdgeLayoutOverride(
        input,
        payload.edgeId,
        payload.from ? { ...payload.from } : undefined,
      );
    },
  };
}

function setEdgeLayoutOverride(
  diagram: Diagram,
  edgeId: string,
  override: EdgeLayoutOverride | undefined,
): Diagram {
  const current = diagram.metadata.edgeLayoutOverrides ?? {};
  if (override === undefined) {
    if (!(edgeId in current)) return diagram;
    const next = { ...current };
    delete next[edgeId];
    if (Object.keys(next).length === 0) {
      const { edgeLayoutOverrides: _omit, ...rest } = diagram.metadata;
      return { ...diagram, metadata: rest };
    }
    return {
      ...diagram,
      metadata: { ...diagram.metadata, edgeLayoutOverrides: next },
    };
  }
  return {
    ...diagram,
    metadata: {
      ...diagram.metadata,
      edgeLayoutOverrides: { ...current, [edgeId]: override },
    },
  };
}

import type { Diagram, LayoutCoordinate } from "../model/types.js";
import { setLayoutOverride } from "./base.js";
import type { Command } from "./base.js";

export interface MoveNodePayload {
  readonly nodeId: string;
  readonly from: LayoutCoordinate | null;
  readonly to: LayoutCoordinate;
}

export type MoveNodeCommand = Command<"MoveNode", MoveNodePayload>;

/**
 * Move a node by writing its new coordinates into `metadata.layoutOverrides`.
 * The previous coordinates (or `null` if the node had no override) are
 * captured at construction time so the inverse can restore them, even when
 * the original state had no layout entry at all.
 */
export function moveNodeCommand(
  nodeId: string,
  to: LayoutCoordinate,
  diagram: Diagram,
): MoveNodeCommand {
  const previous = diagram.metadata.layoutOverrides?.[nodeId];
  const payload: MoveNodePayload = {
    nodeId,
    from: previous ? { ...previous } : null,
    to: { ...to },
  };

  return {
    kind: "MoveNode",
    payload,
    apply(input: Diagram): Diagram {
      // Preserve any manually-resized width/height from the existing override:
      // a move must update x/y only, never reset the user's chosen size.
      const existing = input.metadata.layoutOverrides?.[payload.nodeId];
      const next: LayoutCoordinate = { ...payload.to };
      if (payload.to.width === undefined && existing?.width !== undefined) {
        next.width = existing.width;
      }
      if (payload.to.height === undefined && existing?.height !== undefined) {
        next.height = existing.height;
      }
      return setLayoutOverride(input, payload.nodeId, next);
    },
    invert(input: Diagram): Diagram {
      return setLayoutOverride(
        input,
        payload.nodeId,
        payload.from ? { ...payload.from } : undefined,
      );
    },
  };
}

import type { Diagram, LayoutCoordinate } from "../model/types.js";
import { setLayoutOverride } from "./base.js";
import type { Command } from "./base.js";

/**
 * Rectangle of a node in layout coordinates. Always carries all four
 * fields — corner-handles change `x`/`y`/`width`/`height` together, so
 * splitting move and resize would force callers to dispatch two commands
 * for a single user gesture.
 */
export interface NodeRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ResizeNodePayload {
  readonly nodeId: string;
  /** Previous override (or `null` if the node had no override at all). */
  readonly from: LayoutCoordinate | null;
  /** Resulting rectangle. Width/height ride into `LayoutCoordinate`. */
  readonly to: NodeRect;
}

export type ResizeNodeCommand = Command<"ResizeNode", ResizeNodePayload>;

/**
 * Resize / reposition a node by writing the full rect into
 * `metadata.layoutOverrides`. The previous override (if any) is captured
 * at construction time so the inverse is exact even when the node had no
 * persistent layout entry before.
 */
export function resizeNodeCommand(
  nodeId: string,
  to: NodeRect,
  diagram: Diagram,
): ResizeNodeCommand {
  const previous = diagram.metadata.layoutOverrides?.[nodeId];
  const payload: ResizeNodePayload = {
    nodeId,
    from: previous ? { ...previous } : null,
    to: { ...to },
  };

  return {
    kind: "ResizeNode",
    payload,
    apply(input: Diagram): Diagram {
      const next: LayoutCoordinate = {
        x: payload.to.x,
        y: payload.to.y,
        width: payload.to.width,
        height: payload.to.height,
      };
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

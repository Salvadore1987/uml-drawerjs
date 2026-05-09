import type { Diagram, LayoutCoordinate } from "../model/types.js";
import { setLayoutOverride } from "./base.js";
import type { Command } from "./base.js";
import type { NodeRect } from "./resizeNode.js";

export interface ResizeGroupPayload {
  readonly groupId: string;
  /** Previous override (or `null` if the group had no override at all). */
  readonly from: LayoutCoordinate | null;
  /** Resulting rectangle of the boundary. */
  readonly to: NodeRect;
}

export type ResizeGroupCommand = Command<"ResizeGroup", ResizeGroupPayload>;

/**
 * Resize / reposition a boundary by writing the full rect (x/y/width/
 * height) into `metadata.layoutOverrides`. Mirror of `resizeNodeCommand`,
 * including the same paranoia about restoring an absent override on
 * invert (so undo from auto-fit returns to auto-fit cleanly).
 */
export function resizeGroupCommand(
  groupId: string,
  to: NodeRect,
  diagram: Diagram,
): ResizeGroupCommand {
  const previous = diagram.metadata.layoutOverrides?.[groupId];
  const payload: ResizeGroupPayload = {
    groupId,
    from: previous ? { ...previous } : null,
    to: { ...to },
  };

  return {
    kind: "ResizeGroup",
    payload,
    apply(input: Diagram): Diagram {
      const next: LayoutCoordinate = {
        x: payload.to.x,
        y: payload.to.y,
        width: payload.to.width,
        height: payload.to.height,
      };
      return setLayoutOverride(input, payload.groupId, next);
    },
    invert(input: Diagram): Diagram {
      return setLayoutOverride(
        input,
        payload.groupId,
        payload.from ? { ...payload.from } : undefined,
      );
    },
  };
}

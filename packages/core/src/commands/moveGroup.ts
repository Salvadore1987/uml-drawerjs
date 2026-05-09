import type { Diagram, LayoutCoordinate } from "../model/types.js";
import { setLayoutOverride } from "./base.js";
import type { Command } from "./base.js";

export interface MoveGroupPayload {
  readonly groupId: string;
  readonly from: LayoutCoordinate | null;
  readonly to: LayoutCoordinate;
}

export type MoveGroupCommand = Command<"MoveGroup", MoveGroupPayload>;

/**
 * Move a boundary (or any group with a positional override) by writing
 * its new coordinates into `metadata.layoutOverrides`. Mirror of
 * `moveNodeCommand` — `setLayoutOverride` doesn't care whether the id
 * belongs to a node or a group, so the same plumbing carries us through.
 *
 * The previous override (or `null` if there was none) is captured at
 * construction so the inverse restores the prior state precisely, even
 * if the boundary was using auto-fit before the user dragged it.
 */
export function moveGroupCommand(
  groupId: string,
  to: LayoutCoordinate,
  diagram: Diagram,
): MoveGroupCommand {
  const previous = diagram.metadata.layoutOverrides?.[groupId];
  const payload: MoveGroupPayload = {
    groupId,
    from: previous ? { ...previous } : null,
    to: { ...to },
  };

  return {
    kind: "MoveGroup",
    payload,
    apply(input: Diagram): Diagram {
      return setLayoutOverride(input, payload.groupId, { ...payload.to });
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

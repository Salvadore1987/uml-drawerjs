import { findGroup } from "../model/query.js";
import type { Diagram, DiagramGroup } from "../model/types.js";
import { applyPatch, appendGroup, dropGroup, replaceGroup } from "./base.js";
import type { Command } from "./base.js";

export interface AddGroupPayload {
  readonly group: DiagramGroup;
}

export type AddGroupCommand = Command<"AddGroup", AddGroupPayload>;

export function addGroupCommand(group: DiagramGroup): AddGroupCommand {
  const payload: AddGroupPayload = { group: structuredClone(group) };
  return {
    kind: "AddGroup",
    payload,
    apply(diagram: Diagram): Diagram {
      return appendGroup(diagram, payload.group);
    },
    invert(diagram: Diagram): Diagram {
      return dropGroup(diagram, payload.group.id);
    },
  };
}

export type GroupPatch = Partial<Omit<DiagramGroup, "id">>;

export interface UpdateGroupPayload {
  readonly groupId: string;
  readonly before: DiagramGroup;
  readonly after: DiagramGroup;
}

export type UpdateGroupCommand = Command<"UpdateGroup", UpdateGroupPayload>;

export function updateGroupCommand(
  groupId: string,
  patch: GroupPatch,
  diagram: Diagram,
): UpdateGroupCommand {
  const before = findGroup(diagram, groupId);
  if (!before) {
    throw new Error(`updateGroupCommand: group ${groupId} not found`);
  }
  const beforeSnap = structuredClone(before);
  const afterSnap = structuredClone(applyPatch(before, patch as Partial<DiagramGroup>));
  const payload: UpdateGroupPayload = { groupId, before: beforeSnap, after: afterSnap };
  return {
    kind: "UpdateGroup",
    payload,
    apply(input: Diagram): Diagram {
      return replaceGroup(input, payload.after);
    },
    invert(input: Diagram): Diagram {
      return replaceGroup(input, payload.before);
    },
  };
}

export interface RemoveGroupPayload {
  readonly groupId: string;
  readonly group: DiagramGroup;
  /** Position of the group in the original `groups` array — restored on invert. */
  readonly index: number;
}

export type RemoveGroupCommand = Command<"RemoveGroup", RemoveGroupPayload>;

/**
 * Dissolve a group — children stay in the diagram, but lose their grouping.
 * Inverse re-inserts the group at its original index so the `groups` array
 * order is preserved (byte-equal round-trip).
 */
export function removeGroupCommand(groupId: string, diagram: Diagram): RemoveGroupCommand {
  const index = diagram.groups.findIndex((g) => g.id === groupId);
  if (index === -1) {
    throw new Error(`removeGroupCommand: group ${groupId} not found`);
  }
  const groupRef = diagram.groups[index];
  if (!groupRef) {
    // Defensive — `noUncheckedIndexedAccess` requires this, even though the
    // findIndex result above guarantees presence.
    throw new Error(`removeGroupCommand: group ${groupId} not found`);
  }
  const payload: RemoveGroupPayload = {
    groupId,
    group: structuredClone(groupRef),
    index,
  };

  return {
    kind: "RemoveGroup",
    payload,
    apply(input: Diagram): Diagram {
      return dropGroup(input, payload.groupId);
    },
    invert(input: Diagram): Diagram {
      const groups = [
        ...input.groups.slice(0, payload.index),
        payload.group,
        ...input.groups.slice(payload.index),
      ];
      return { ...input, groups };
    },
  };
}

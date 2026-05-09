import { findGroup } from "../model/query.js";
import type { Diagram, DiagramGroup, LayoutCoordinate } from "../model/types.js";
import { applyPatch, appendGroup, dropGroup, replaceGroup, setLayoutOverride } from "./base.js";
import type { Command } from "./base.js";

export interface AddGroupPayload {
  readonly group: DiagramGroup;
  /**
   * Optional initial rectangle for the group. When set, gets written into
   * `metadata.layoutOverrides[group.id]` as part of the same command, so
   * a freshly-added boundary appears at a known position instead of
   * relying on auto-fit (which collapses to a default for empty groups).
   */
  readonly layout?: LayoutCoordinate;
}

export type AddGroupCommand = Command<"AddGroup", AddGroupPayload>;

export function addGroupCommand(group: DiagramGroup, layout?: LayoutCoordinate): AddGroupCommand {
  const payload: AddGroupPayload = {
    group: structuredClone(group),
    ...(layout ? { layout: { ...layout } } : {}),
  };
  return {
    kind: "AddGroup",
    payload,
    apply(diagram: Diagram): Diagram {
      const withGroup = appendGroup(diagram, payload.group);
      if (payload.layout) {
        return setLayoutOverride(withGroup, payload.group.id, { ...payload.layout });
      }
      return withGroup;
    },
    invert(diagram: Diagram): Diagram {
      // The user has no expectation of an override outliving an undone
      // creation, so we drop the layout entry alongside the group itself.
      const cleaned = payload.layout
        ? setLayoutOverride(diagram, payload.group.id, undefined)
        : diagram;
      return dropGroup(cleaned, payload.group.id);
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
 * Idempotent: add a node id to a group's `children` array. Returns
 * `null` when the node is already a child or the group does not exist —
 * callers usually treat that as a no-op rather than an error so DnD
 * gestures don't generate empty undo frames.
 */
export function addNodeToGroupCommand(
  nodeId: string,
  groupId: string,
  diagram: Diagram,
): UpdateGroupCommand | null {
  const group = findGroup(diagram, groupId);
  if (!group) return null;
  if (group.children.includes(nodeId)) return null;
  return updateGroupCommand(groupId, { children: [...group.children, nodeId] }, diagram);
}

/**
 * Idempotent inverse of `addNodeToGroupCommand`. Returns `null` when the
 * node isn't currently a child of the group — same no-op convention.
 */
export function removeNodeFromGroupCommand(
  nodeId: string,
  groupId: string,
  diagram: Diagram,
): UpdateGroupCommand | null {
  const group = findGroup(diagram, groupId);
  if (!group) return null;
  if (!group.children.includes(nodeId)) return null;
  return updateGroupCommand(
    groupId,
    { children: group.children.filter((c) => c !== nodeId) },
    diagram,
  );
}

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

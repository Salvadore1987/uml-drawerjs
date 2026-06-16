import { getParentGroups } from "../model/query.js";
import type { Diagram } from "../model/types.js";
import type { Command } from "./base.js";

/**
 * Z-order reordering for nodes and groups. Paint order is array order — later
 * in `diagram.nodes` / `diagram.groups` paints on top — so "front" moves an
 * element to the END of its sibling list and "back" to the START.
 *
 * To survive the PlantUML round-trip the change is also mirrored into the
 * container that the generator iterates: a packaged node / nested group also
 * gets reordered within its parent's `children`, since the generator emits
 * package members in `children` order and the parser rebuilds the arrays from
 * that text order.
 */
export type ReorderDirection = "front" | "back";

export interface ReorderNodePayload {
  readonly nodeId: string;
  readonly direction: ReorderDirection;
}
export type ReorderNodeCommand = Command<"ReorderNode", ReorderNodePayload>;

export interface ReorderGroupPayload {
  readonly groupId: string;
  readonly direction: ReorderDirection;
}
export type ReorderGroupCommand = Command<"ReorderGroup", ReorderGroupPayload>;

/** Move the item with `id` to the end (front) or start (back) of `list`. */
function moveItem<T>(
  list: readonly T[],
  id: string,
  idOf: (item: T) => string,
  direction: ReorderDirection,
): T[] {
  const item = list.find((x) => idOf(x) === id);
  if (!item) return [...list];
  const others = list.filter((x) => idOf(x) !== id);
  return direction === "front" ? [...others, item] : [item, ...others];
}

/** Move `id` to the end (front) or start (back) of a `children` id list. */
function moveId(children: readonly string[], id: string, direction: ReorderDirection): string[] {
  const others = children.filter((c) => c !== id);
  return direction === "front" ? [...others, id] : [id, ...others];
}

/**
 * Bring a node to the front / send it to the back of the paint order. Also
 * reorders the node within its parent package's `children` (if any) so the
 * change round-trips through PlantUML. Returns `null` when the node is absent.
 */
export function reorderNodeCommand(
  nodeId: string,
  direction: ReorderDirection,
  diagram: Diagram,
): ReorderNodeCommand | null {
  if (!diagram.nodes.some((n) => n.id === nodeId)) return null;

  const beforeNodes = diagram.nodes;
  const beforeGroups = diagram.groups;
  const afterNodes = moveItem(diagram.nodes, nodeId, (n) => n.id, direction);
  const parent = getParentGroups(diagram, nodeId)[0];
  const afterGroups = parent
    ? diagram.groups.map((g) =>
        g.id === parent.id ? { ...g, children: moveId(g.children, nodeId, direction) } : g,
      )
    : diagram.groups;

  return {
    kind: "ReorderNode",
    payload: { nodeId, direction },
    apply: (input: Diagram): Diagram => ({ ...input, nodes: afterNodes, groups: afterGroups }),
    invert: (input: Diagram): Diagram => ({ ...input, nodes: beforeNodes, groups: beforeGroups }),
  };
}

/**
 * Bring a group (package / boundary) to the front / send it to the back of the
 * group paint order. A nested group is also reordered within its parent's
 * `children` so the change round-trips. Returns `null` when the group is absent.
 */
export function reorderGroupCommand(
  groupId: string,
  direction: ReorderDirection,
  diagram: Diagram,
): ReorderGroupCommand | null {
  if (!diagram.groups.some((g) => g.id === groupId)) return null;

  const beforeGroups = diagram.groups;
  const parent = getParentGroups(diagram, groupId)[0];
  let afterGroups = moveItem(diagram.groups, groupId, (g) => g.id, direction);
  if (parent) {
    afterGroups = afterGroups.map((g) =>
      g.id === parent.id ? { ...g, children: moveId(g.children, groupId, direction) } : g,
    );
  }

  return {
    kind: "ReorderGroup",
    payload: { groupId, direction },
    apply: (input: Diagram): Diagram => ({ ...input, groups: afterGroups }),
    invert: (input: Diagram): Diagram => ({ ...input, groups: beforeGroups }),
  };
}

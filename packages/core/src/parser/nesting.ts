import type { Diagram, DiagramGroup, LayoutCoordinate } from "../model/types.js";

/**
 * Infer group→group nesting from saved geometry.
 *
 * The editor records node→group containment (drag a node into a boundary), but
 * dragging one package/boundary *inside another* is reflected only in geometry
 * (`metadata.layoutOverrides`), never in `group.children`. After a save+reload
 * the AST is therefore flat — every group sits at the top level — so the
 * generator emits sibling packages instead of nested ones.
 *
 * This pass reconstructs the hierarchy: for every group that has a sized
 * override box and isn't already a child of another group, it finds the
 * smallest strictly-enclosing group and records the parent→child link. Groups
 * without geometry, or already nested by the parser, are left untouched — so a
 * document that already declares nested `package { package { … } }` keeps its
 * explicit structure.
 */
export function inferGroupNestingFromGeometry(diagram: Diagram): void {
  const overrides = diagram.metadata.layoutOverrides;
  if (!overrides) return;
  if (diagram.groups.length < 2) return;

  // Groups already nested (a child of some group) keep their explicit parent.
  const alreadyChild = new Set<string>();
  for (const group of diagram.groups) {
    for (const childId of group.children) alreadyChild.add(childId);
  }

  type Boxed = { group: DiagramGroup; box: SizedBox; area: number };
  const boxed: Boxed[] = [];
  for (const group of diagram.groups) {
    const box = sizedBox(overrides[group.id]);
    if (!box) continue;
    boxed.push({ group, box, area: box.width * box.height });
  }
  if (boxed.length < 2) return;

  for (const child of boxed) {
    if (alreadyChild.has(child.group.id)) continue;
    let parent: Boxed | null = null;
    for (const candidate of boxed) {
      if (candidate === child) continue;
      if (candidate.area <= child.area) continue; // strictly larger only
      if (!encloses(candidate.box, child.box)) continue;
      if (!parent || candidate.area < parent.area) parent = candidate;
    }
    if (parent && !parent.group.children.includes(child.group.id)) {
      parent.group.children.push(child.group.id);
    }
  }
}

interface SizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function sizedBox(coord: LayoutCoordinate | undefined): SizedBox | null {
  if (!coord || coord.width === undefined || coord.height === undefined) return null;
  if (coord.width <= 0 || coord.height <= 0) return null;
  return { x: coord.x, y: coord.y, width: coord.width, height: coord.height };
}

function encloses(outer: SizedBox, inner: SizedBox): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.width >= inner.x + inner.width &&
    outer.y + outer.height >= inner.y + inner.height
  );
}

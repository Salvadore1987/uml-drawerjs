import type { CombinedFragment, Diagram, DiagramEdge } from "../model/types.js";
import type { LayoutCoordinates, LayoutOptions, LayoutResult } from "./types.js";
import { resolveDefaults } from "./types.js";

/**
 * Custom sequence layout. ELK's general-purpose algorithms don't model
 * lifelines or message-time, so we run a small bespoke pass:
 *
 *   - Each lifeline / actor stays at a fixed `x` derived from its index in
 *     `diagram.nodes`.
 *   - The header sits at `y = 0`; the lifeline shaft extends downward and
 *     the time axis is the running edge index.
 *   - Non-edge timeline items (notes, dividers, fragment open/close/else
 *     markers, self-message extra padding) consume their own y-rows so the
 *     overall height accommodates every ornament rendered in
 *     `renderer/sequence.ts`.
 *
 * The algorithm is fully synchronous and deterministic — same AST in,
 * byte-equal coordinates out.
 */
export function layoutSequence(diagram: Diagram, options?: LayoutOptions): LayoutResult {
  const { nodeWidth, nodeHeight, spacing } = resolveDefaults(options);
  const coordinates: LayoutCoordinates = {};

  if (diagram.nodes.length === 0) {
    return { coordinates, width: 0, height: 0, engine: "sequence" };
  }

  const messageStep = Math.max(spacing / 2, 32);
  const totalRows = countTimelineRows(diagram);
  const shaftHeight = Math.max(nodeHeight, totalRows * messageStep + nodeHeight * 2);

  diagram.nodes.forEach((node, index) => {
    coordinates[node.id] = {
      x: index * (nodeWidth + spacing),
      y: 0,
    };
  });

  const width =
    diagram.nodes.length === 1
      ? nodeWidth
      : (diagram.nodes.length - 1) * (nodeWidth + spacing) + nodeWidth;
  return { coordinates, width, height: shaftHeight, engine: "sequence" };
}

/**
 * Count the rows the renderer will allocate on the time axis. Mirrors the
 * iteration order in `renderer/sequence.ts` so layout-reported height stays
 * in sync with what's actually drawn.
 */
function countTimelineRows(diagram: Diagram): number {
  let rows = 0;
  // Notes / dividers anchored at the top contribute one row each.
  rows += (diagram.notes ?? []).filter((n) => n.anchorEdgeId === undefined).length;
  rows += (diagram.dividers ?? []).filter((d) => d.afterEdgeId === undefined).length;

  const fragments = diagram.fragments ?? [];
  const enterAt = new Map<string, number>();
  const exitAt = new Map<string, number>();
  const elseAt = new Map<string, number>();
  for (const fragment of fragments) {
    const first = firstEdgeOf(fragment);
    if (first) bump(enterAt, first);
    const last = lastEdgeOf(fragment);
    if (last) bump(exitAt, last);
    for (let i = 1; i < fragment.operands.length; i += 1) {
      const operand = fragment.operands[i];
      const switchAt = operand?.edges[0];
      if (switchAt) bump(elseAt, switchAt);
    }
  }

  for (const edge of diagram.edges) {
    rows += enterAt.get(edge.id) ?? 0;
    rows += elseAt.get(edge.id) ?? 0;
    rows += 1; // the message itself
    if (isSelfMessage(edge)) rows += 1; // extra y-padding for the loop arc
    rows += (diagram.notes ?? []).filter((n) => n.anchorEdgeId === edge.id).length;
    rows += (diagram.dividers ?? []).filter((d) => d.afterEdgeId === edge.id).length;
    rows += exitAt.get(edge.id) ?? 0;
  }

  return rows;
}

function isSelfMessage(edge: DiagramEdge): boolean {
  return edge.source === edge.target;
}

function firstEdgeOf(fragment: CombinedFragment): string | undefined {
  for (const op of fragment.operands) {
    if (op.edges.length > 0) return op.edges[0];
  }
  return undefined;
}

function lastEdgeOf(fragment: CombinedFragment): string | undefined {
  for (let i = fragment.operands.length - 1; i >= 0; i -= 1) {
    const op = fragment.operands[i];
    if (op && op.edges.length > 0) return op.edges[op.edges.length - 1];
  }
  return undefined;
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

import type { Diagram } from "../model/types.js";
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
 *
 * The algorithm is fully synchronous and deterministic — same AST in,
 * byte-equal coordinates out. Edges aren't laid out individually; the
 * renderer derives message arrows from the edge-index `y` plus the source
 * and target lifeline `x` values at draw time.
 */
export function layoutSequence(diagram: Diagram, options?: LayoutOptions): LayoutResult {
  const { nodeWidth, nodeHeight, spacing } = resolveDefaults(options);
  const coordinates: LayoutCoordinates = {};

  if (diagram.nodes.length === 0) {
    return { coordinates, width: 0, height: 0, engine: "sequence" };
  }

  const messageStep = Math.max(spacing / 2, 32);
  const messageCount = diagram.edges.length;
  const shaftHeight = Math.max(nodeHeight, messageCount * messageStep + nodeHeight);

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

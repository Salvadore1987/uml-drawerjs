import type { Diagram } from "../model/types.js";
import type { LayoutCoordinates, LayoutOptions, LayoutResult } from "./types.js";
import { resolveDefaults } from "./types.js";

/**
 * Deterministic grid layout used as the fallback path when the ELK adapter
 * cannot run (loader unavailable, environment without workers, exception
 * thrown). The result is uglier than ELK's, but it is at least correct,
 * doesn't overlap, and never throws — which is exactly what a fallback
 * needs to be. Sequence diagrams have their own dedicated layout and
 * never hit this path.
 */
export function layoutGrid(diagram: Diagram, options?: LayoutOptions): LayoutResult {
  const { nodeWidth, nodeHeight, spacing } = resolveDefaults(options);
  const coordinates: LayoutCoordinates = {};

  const total = diagram.nodes.length;
  if (total === 0) {
    return { coordinates, width: 0, height: 0, engine: "grid" };
  }

  // Aim for a roughly square grid so we don't produce a 200-wide strip.
  const columns = Math.max(1, Math.ceil(Math.sqrt(total)));

  diagram.nodes.forEach((node, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    coordinates[node.id] = {
      x: col * (nodeWidth + spacing),
      y: row * (nodeHeight + spacing),
    };
  });

  const rows = Math.ceil(total / columns);
  const width = columns * nodeWidth + (columns - 1) * spacing;
  const height = rows * nodeHeight + (rows - 1) * spacing;
  return { coordinates, width, height, engine: "grid" };
}

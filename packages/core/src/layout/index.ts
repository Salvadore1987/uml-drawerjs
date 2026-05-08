/**
 * Auto-layout barrel.
 *
 *   - `runAutoLayout(diagram, options)` is the public API: dispatches by
 *     diagram type (sequence → custom synchronous algorithm; everything
 *     else → ELK layered with the grid fallback on error).
 *   - The ELK adapter is dynamically imported, so the heavy worker bundle
 *     never lands in `core`'s main entry. The first call pays the import
 *     cost; later calls reuse the cached constructor.
 *   - Failure mode is conservative — if ELK throws (loader missing,
 *     environment without `Worker`, malformed input) we fall back to a
 *     deterministic grid so the editor never ends up in a non-rendering
 *     state.
 */
import type { Diagram } from "../model/types.js";
import { layoutGrid } from "./fallback.js";
import { layoutSequence } from "./sequence.js";
import { runElkLayout } from "./elk.js";
import type { LayoutOptions, LayoutResult } from "./types.js";

export async function runAutoLayout(
  diagram: Diagram,
  options?: LayoutOptions,
): Promise<LayoutResult> {
  if (diagram.type === "sequence") {
    return layoutSequence(diagram, options);
  }
  try {
    return await runElkLayout(diagram, options);
  } catch {
    // Swallow — the grid is always available and never throws. The caller
    // sees a `LayoutResult` with `engine: "grid"` and can decide whether
    // to surface a warning in the props panel.
    return layoutGrid(diagram, options);
  }
}

export { layoutSequence } from "./sequence.js";
export { layoutGrid } from "./fallback.js";
export { runElkLayout, resetElkLoader } from "./elk.js";
export type {
  LayoutResult,
  LayoutOptions,
  LayoutCoordinates,
  LayoutEngine,
  ElkConstructorLike,
  ElkLike,
  ElkNodeLike,
  ElkEdgeLike,
} from "./types.js";
export { LAYOUT_DEFAULTS, resolveDefaults } from "./types.js";

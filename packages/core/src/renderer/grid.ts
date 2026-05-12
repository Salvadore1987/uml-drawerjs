import { v } from "./types.js";
import type { VNode } from "./types.js";

/**
 * Optional SVG grid layer rendered inside `<g data-uml-content>`. Lives
 * under the edges layer so it pans / zooms with the diagram (the CSS
 * background on the host stays fixed, which is bad UX for a snap
 * reference).
 *
 * The grid is a single `<rect>` filled by a userSpaceOnUse `<pattern>`,
 * so it scales linearly with the pan/zoom transform applied to the
 * content group — no JS-driven re-render on zoom needed.
 */
export interface GridLayerOptions {
  /** When false, returns an empty placeholder VNode. */
  readonly visible: boolean;
  /** Grid step in layout pixels. Defaults to 24 (matches snap default). */
  readonly step: number;
  /** Bounding box that the grid should cover, in layout coordinates. */
  readonly bbox: { x: number; y: number; width: number; height: number };
  /**
   * Pattern id. Multiple editors on a page risk colliding `<pattern id>`
   * references; callers can pass a unique id per editor when needed.
   */
  readonly patternId?: string;
}

export function renderGridLayer(options: GridLayerOptions): VNode {
  const id = options.patternId ?? "uml-grid";
  if (!options.visible || options.step <= 0) {
    // Empty group keeps the layer slot present so DOM reconciliation in
    // `rerenderSvg` doesn't have to special-case visibility flips.
    return v("g", { "data-uml-layer": "grid" }, []);
  }
  const step = options.step;
  // The grid `<rect>` lives in layout coordinates inside the pan/zoom
  // transform. To keep the pattern visible no matter how far the user
  // pans (or how big the viewport is at scale 1), we make the rect
  // intentionally huge — a tiled `<pattern>` over a large rect is
  // cheap because the browser only paints tiles that overlap the
  // current SVG viewport. 16384 is the historical SVG `coordsize`
  // ceiling and matches Chrome's max canvas-tile dimension.
  const overscan = Math.max(step * 1024, 16384);
  const x = options.bbox.x - overscan;
  const y = options.bbox.y - overscan;
  const w = options.bbox.width + overscan * 2;
  const h = options.bbox.height + overscan * 2;

  // Drawio-style two-tier grid: fine minor lines every `step` px and
  // darker major lines every 5×step px. The minor pattern paints the
  // bulk of the canvas; the major pattern sits on top and only
  // contributes the heavy boundary lines, mirroring the look of
  // app.diagrams.net's editing canvas. Each pattern tile draws an
  // L-shape (top-left corner of the cell) — adjacent tiles complete
  // the grid without visible seams.
  const major = step * 5;
  return v("g", { "data-uml-layer": "grid" }, [
    v("defs", undefined, [
      v(
        "pattern",
        {
          id,
          width: step,
          height: step,
          patternUnits: "userSpaceOnUse",
        },
        [
          v("path", {
            d: `M ${step} 0 L 0 0 L 0 ${step}`,
            fill: "none",
            stroke: "var(--uml-canvas-grid)",
            "stroke-width": "0.5",
            "shape-rendering": "crispEdges",
          }),
        ],
      ),
      v(
        "pattern",
        {
          id: `${id}-major`,
          width: major,
          height: major,
          patternUnits: "userSpaceOnUse",
        },
        [
          v("path", {
            d: `M ${major} 0 L 0 0 L 0 ${major}`,
            fill: "none",
            stroke: "var(--uml-canvas-grid-major, var(--uml-canvas-grid))",
            "stroke-width": "1",
            "shape-rendering": "crispEdges",
          }),
        ],
      ),
    ]),
    v("rect", {
      x,
      y,
      width: w,
      height: h,
      fill: `url(#${id})`,
      "pointer-events": "none",
    }),
    v("rect", {
      x,
      y,
      width: w,
      height: h,
      fill: `url(#${id}-major)`,
      "pointer-events": "none",
    }),
  ]);
}

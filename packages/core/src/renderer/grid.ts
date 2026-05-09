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
          v("circle", {
            cx: step / 2,
            cy: step / 2,
            r: 1,
            fill: "var(--uml-canvas-grid)",
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
  ]);
}

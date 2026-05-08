import type { Diagram, LayoutCoordinate } from "../model/types.js";

/**
 * Layout primitives. Every concrete engine — ELK, the custom sequence
 * layouter, the grid fallback — produces the same result shape: a `(id →
 * coordinate)` map ready to feed `applyLayoutCommand`. Higher layers (the
 * editor, the props panel) never care which engine actually ran.
 */
export type LayoutCoordinates = Record<string, LayoutCoordinate>;

export interface LayoutResult {
  /** Coordinates indexed by node / group id. */
  readonly coordinates: LayoutCoordinates;
  /** Bounding box width/height for the laid-out content; used by minimap. */
  readonly width: number;
  readonly height: number;
  /** Which engine produced this result. */
  readonly engine: "elk" | "sequence" | "grid";
}

/**
 * Options accepted by `runAutoLayout`. All optional — sane defaults match
 * the renderer's preferred node footprint and the ELK 'layered' algorithm.
 */
export interface LayoutOptions {
  /** Logical node width hint (px). Defaults to 200. */
  readonly nodeWidth?: number;
  /** Logical node height hint (px). Defaults to 80. */
  readonly nodeHeight?: number;
  /** Spacing between adjacent nodes (px). Defaults to 60. */
  readonly spacing?: number;
  /**
   * Plug a custom ELK loader. Tests provide a stub so we don't spin up the
   * real worker; in production this is left empty and the adapter resolves
   * `elkjs/lib/elk.bundled.js` lazily on first call.
   */
  readonly elkLoader?: () => Promise<ElkConstructorLike>;
}

export interface LayoutDefaults {
  readonly nodeWidth: number;
  readonly nodeHeight: number;
  readonly spacing: number;
}

export const LAYOUT_DEFAULTS: LayoutDefaults = {
  nodeWidth: 200,
  nodeHeight: 80,
  spacing: 60,
};

/**
 * Loose contract for the ELK constructor that is enough to drive the
 * adapter. Mirrors the public surface of `elkjs`'s default export so we
 * can stub it in tests without pulling in the real worker bundle.
 */
export interface ElkConstructorLike {
  new (args?: unknown): ElkLike;
}

export interface ElkLike {
  layout(
    graph: ElkNodeLike,
    args?: { layoutOptions?: Record<string, string> },
  ): Promise<ElkNodeLike>;
}

export interface ElkNodeLike {
  id: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  children?: ElkNodeLike[];
  edges?: ElkEdgeLike[];
  layoutOptions?: Record<string, string>;
}

export interface ElkEdgeLike {
  id: string;
  sources: string[];
  targets: string[];
}

/** Engine signature — every concrete layout module conforms. */
export type LayoutEngine = (diagram: Diagram, options?: LayoutOptions) => Promise<LayoutResult>;

export function resolveDefaults(options: LayoutOptions | undefined): LayoutDefaults {
  return {
    nodeWidth: options?.nodeWidth ?? LAYOUT_DEFAULTS.nodeWidth,
    nodeHeight: options?.nodeHeight ?? LAYOUT_DEFAULTS.nodeHeight,
    spacing: options?.spacing ?? LAYOUT_DEFAULTS.spacing,
  };
}

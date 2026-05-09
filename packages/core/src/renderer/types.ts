import type { Diagram } from "../model/types.js";
import type { LayoutCoordinates } from "../layout/types.js";

/**
 * Minimal virtual-DOM-ish description of an SVG fragment. The renderer
 * works in two passes: every per-kind module returns one of these vnodes,
 * then `mount` walks the tree once and produces real `SVGElement`s. The
 * separation keeps almost all renderer logic testable in plain Node — only
 * the `mount` step needs a DOM (happy-dom in unit tests, the real
 * browser in production).
 */
export interface VNode {
  /** SVG tag name — `g`, `rect`, `text`, `path`, `line`, `circle`, … */
  readonly tag: string;
  /** Attribute map; values get coerced via `String(value)` at mount time. */
  readonly attrs?: Readonly<Record<string, string | number | boolean | undefined>>;
  /** Inline `style` string. Use only `--uml-*` references — never hex. */
  readonly style?: string;
  /** Class names applied to the element. Space-separated at mount. */
  readonly classes?: readonly string[];
  /** ARIA / `data-*` attributes (kept apart so the per-kind modules
   *  don't accidentally pollute SVG-attribute namespace). */
  readonly aria?: Readonly<Record<string, string>>;
  /** Text content for nodes that render as `<text>` / `<title>`. */
  readonly text?: string;
  /** Child vnodes. */
  readonly children?: readonly VNode[];
}

/** Top-level shape returned by `renderDiagram`. */
export interface RenderedDiagram {
  /** Root `<svg>` vnode — feed this directly into `mountSvg`. */
  readonly root: VNode;
  /** Bounding box of the laid-out content (matches the layout result). */
  readonly width: number;
  readonly height: number;
  /** Coordinates used during this render — handy for hit-testing. */
  readonly coordinates: LayoutCoordinates;
  /** Per-node geometry (rect) for selection / drag / port snapping. */
  readonly nodeGeometry: ReadonlyMap<string, NodeGeometry>;
}

/** Axis-aligned rectangle that bounds a single rendered node. */
export interface NodeGeometry {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Options accepted by `renderDiagram`. */
export interface RendererOptions {
  /** Coordinates to use; usually the result of `runAutoLayout`. */
  readonly coordinates?: LayoutCoordinates;
  /** Default node size (px). Defaults match the layout defaults. */
  readonly nodeWidth?: number;
  readonly nodeHeight?: number;
  /** Optional override for the canvas size — useful for snapshot tests. */
  readonly canvasPadding?: number;
  /**
   * Optional grid layer drawn inside `<g data-uml-content>`. Defaults to
   * visible with a 24 px step. Set `visible: false` to suppress (the
   * playground's grid-toggle drives this; snap continues to work even
   * when the grid is hidden).
   */
  readonly grid?: { readonly visible?: boolean; readonly step?: number };
}

/** Resolved (defaulted) form of `RendererOptions`. */
export interface RendererDefaults {
  readonly nodeWidth: number;
  readonly nodeHeight: number;
  readonly canvasPadding: number;
}

export const RENDERER_DEFAULTS: RendererDefaults = {
  nodeWidth: 200,
  nodeHeight: 80,
  canvasPadding: 40,
};

export function resolveRendererDefaults(options: RendererOptions | undefined): RendererDefaults {
  return {
    nodeWidth: options?.nodeWidth ?? RENDERER_DEFAULTS.nodeWidth,
    nodeHeight: options?.nodeHeight ?? RENDERER_DEFAULTS.nodeHeight,
    canvasPadding: options?.canvasPadding ?? RENDERER_DEFAULTS.canvasPadding,
  };
}

/** Convenience: a vnode constructor with the right defaults. */
export function v(
  tag: string,
  attrs?: VNode["attrs"],
  children?: readonly VNode[],
  extras?: Pick<VNode, "style" | "classes" | "aria" | "text">,
): VNode {
  const node: { -readonly [K in keyof VNode]: VNode[K] } = { tag };
  if (attrs) node.attrs = attrs;
  if (children) node.children = children;
  if (extras?.style) node.style = extras.style;
  if (extras?.classes) node.classes = extras.classes;
  if (extras?.aria) node.aria = extras.aria;
  if (extras?.text !== undefined) node.text = extras.text;
  return node;
}

/** Re-export so callers can name `Diagram` next to the renderer types. */
export type { Diagram };

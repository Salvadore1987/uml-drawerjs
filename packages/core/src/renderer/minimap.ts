import type { Diagram } from "../model/types.js";
import { v } from "./types.js";
import type { NodeGeometry, RenderedDiagram, VNode } from "./types.js";
import type { PanZoomState } from "./panZoom.js";

/**
 * Build a minimap vnode tree — a scaled-down view of the same node
 * geometry that the main canvas renders, plus a viewport rectangle
 * showing what the user currently sees. Pure data so the React adapter
 * can mount it into its own corner without re-running layout.
 */
export interface MinimapOptions {
  /** Output minimap viewport size in CSS pixels. */
  readonly width?: number;
  readonly height?: number;
  /** Current pan/zoom state of the main canvas. */
  readonly transform?: PanZoomState;
  /** Main canvas size — needed to project the viewport rect. */
  readonly canvasWidth?: number;
  readonly canvasHeight?: number;
}

const DEFAULTS = {
  width: 200,
  height: 140,
};

export function renderMinimap(
  _diagram: Diagram,
  rendered: RenderedDiagram,
  options: MinimapOptions = {},
): VNode {
  const width = options.width ?? DEFAULTS.width;
  const height = options.height ?? DEFAULTS.height;
  const padding = 8;

  const contentWidth = Math.max(rendered.width, 1);
  const contentHeight = Math.max(rendered.height, 1);

  const fitScale = Math.min(
    (width - padding * 2) / contentWidth,
    (height - padding * 2) / contentHeight,
  );

  const children: VNode[] = [
    v("rect", {
      x: 0,
      y: 0,
      width,
      height,
      rx: 6,
      ry: 6,
      fill: "var(--uml-bg-elevated)",
      stroke: "var(--uml-border)",
    }),
  ];

  for (const geometry of rendered.nodeGeometry.values()) {
    children.push(renderMiniNode(geometry, fitScale, padding));
  }

  if (
    options.transform &&
    options.canvasWidth !== undefined &&
    options.canvasHeight !== undefined
  ) {
    children.push(
      renderViewport(
        {
          transform: options.transform,
          canvasWidth: options.canvasWidth,
          canvasHeight: options.canvasHeight,
        },
        fitScale,
        padding,
      ),
    );
  }

  return v(
    "svg",
    {
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label": "Diagram minimap",
    },
    children,
    { classes: ["uml-minimap"] },
  );
}

function renderMiniNode(geometry: NodeGeometry, scale: number, padding: number): VNode {
  return v("rect", {
    x: padding + geometry.x * scale,
    y: padding + geometry.y * scale,
    width: Math.max(2, geometry.width * scale),
    height: Math.max(2, geometry.height * scale),
    fill: "var(--uml-node-bg)",
    stroke: "var(--uml-node-border)",
    "stroke-width": "0.5",
  });
}

interface ResolvedViewport {
  readonly transform: PanZoomState;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

function renderViewport(view: ResolvedViewport, scale: number, padding: number): VNode {
  const t = view.transform;
  const visibleX = -t.translateX / t.scale;
  const visibleY = -t.translateY / t.scale;
  const visibleW = view.canvasWidth / t.scale;
  const visibleH = view.canvasHeight / t.scale;
  return v(
    "rect",
    {
      x: padding + visibleX * scale,
      y: padding + visibleY * scale,
      width: visibleW * scale,
      height: visibleH * scale,
      fill: "transparent",
      stroke: "var(--uml-accent)",
      "stroke-width": "1",
    },
    undefined,
    { classes: ["uml-minimap-viewport"] },
  );
}

/**
 * Declarative SVG renderer for `@uml-drawer/core`.
 *
 * Exposes:
 *   - `renderDiagram(diagram, options)` — pure-data: returns a `VNode`
 *     tree plus per-node geometry. Drop into `mountSvg` to get DOM.
 *   - `mountSvg(host, vnode)` — single point of DOM contact.
 *   - `createPanZoomController(host)` / `attachKeyboardNavigation(host)` —
 *     interaction adapters; framework-agnostic.
 *   - `createSelectionModel()` — headless selection store.
 *   - `renderMinimap(...)`, `summarizeForA11y(...)` — supplementary surfaces.
 *
 * Every visual decision flows through the `--uml-*` theming contract.
 * No hex literals live in this folder; CI's design-agnostic guard
 * (Phase 14) enforces that on the built CSS.
 */
import { renderEdge, renderArrowMarkerDefs } from "./edges.js";
import { computeNodeGeometry, renderNode } from "./nodes.js";
import { layoutGrid } from "../layout/fallback.js";
import type { Diagram } from "../model/types.js";
import { resolveRendererDefaults, v } from "./types.js";
import type { NodeGeometry, RenderedDiagram, RendererOptions, VNode } from "./types.js";

export function renderDiagram(diagram: Diagram, options: RendererOptions = {}): RenderedDiagram {
  const defaults = resolveRendererDefaults(options);

  // Coordinates: prefer the supplied layout (the editor will pass the
  // result of `runAutoLayout`); fall back to the deterministic grid so
  // the renderer always produces *something* — never empty SVG, never a
  // throw — even when called before layout has run.
  const coordinates =
    options.coordinates ?? layoutGrid(diagram, { nodeWidth: defaults.nodeWidth }).coordinates;

  const geometry = new Map<string, NodeGeometry>();
  const nodeVNodes: VNode[] = [];

  for (const node of diagram.nodes) {
    const coordinate = coordinates[node.id] ?? { x: 0, y: 0 };
    const geom = computeNodeGeometry({
      node,
      x: coordinate.x,
      y: coordinate.y,
      width: defaults.nodeWidth,
      height: defaults.nodeHeight,
    });
    geometry.set(node.id, geom);
    nodeVNodes.push(
      renderNode({ node, x: geom.x, y: geom.y, width: geom.width, height: geom.height }),
    );
  }

  const edgeVNodes: VNode[] = [];
  for (const edge of diagram.edges) {
    const source = geometry.get(edge.source);
    const target = geometry.get(edge.target);
    if (!source || !target) continue;
    edgeVNodes.push(renderEdge({ edge, source, target }));
  }

  const bbox = boundingBoxOf(geometry, defaults.canvasPadding);

  const root: VNode = v(
    "svg",
    {
      width: bbox.width,
      height: bbox.height,
      viewBox: `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`,
      role: "img",
      "aria-label": `${diagram.type} diagram${diagram.title ? `: ${diagram.title}` : ""}`,
      "data-diagram-type": diagram.type,
    },
    [
      renderArrowMarkerDefs(),
      v("g", { "data-uml-content": "true" }, [
        // Edges go behind nodes so node frames cover edge endpoints.
        v("g", { "data-uml-layer": "edges" }, edgeVNodes),
        v("g", { "data-uml-layer": "nodes" }, nodeVNodes),
      ]),
    ],
    {
      classes: ["uml-canvas"],
    },
  );

  return {
    root,
    width: bbox.width,
    height: bbox.height,
    coordinates,
    nodeGeometry: geometry,
  };
}

function boundingBoxOf(
  geometry: ReadonlyMap<string, NodeGeometry>,
  padding: number,
): { x: number; y: number; width: number; height: number } {
  if (geometry.size === 0) {
    return { x: 0, y: 0, width: padding * 2, height: padding * 2 };
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const geom of geometry.values()) {
    if (geom.x < minX) minX = geom.x;
    if (geom.y < minY) minY = geom.y;
    if (geom.x + geom.width > maxX) maxX = geom.x + geom.width;
    if (geom.y + geom.height > maxY) maxY = geom.y + geom.height;
  }
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

export { mountSvg, rerenderSvg } from "./mount.js";
export type { MountResult } from "./mount.js";
export { renderArrowMarkerDefs, renderEdge, portSnap } from "./edges.js";
export { computeNodeGeometry, renderNode } from "./nodes.js";
export { renderMinimap } from "./minimap.js";
export type { MinimapOptions } from "./minimap.js";
export { createPanZoomController } from "./panZoom.js";
export type { PanZoomController, PanZoomState, PanZoomOptions } from "./panZoom.js";
export { attachKeyboardNavigation } from "./keyboard.js";
export type {
  KeyboardNavigationCallbacks,
  KeyboardNavigationOptions,
  KeyboardNavigationController,
} from "./keyboard.js";
export { createSelectionModel } from "./selection.js";
export type { SelectionListener, SelectionModel } from "./selection.js";
export { summarizeForA11y } from "./a11y.js";
export { RENDERER_DEFAULTS, resolveRendererDefaults, v } from "./types.js";
export type { VNode, RenderedDiagram, RendererOptions, NodeGeometry } from "./types.js";

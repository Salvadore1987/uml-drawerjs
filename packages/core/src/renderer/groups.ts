import type { Diagram, DiagramGroup, LayoutCoordinate } from "../model/types.js";
import { v } from "./types.js";
import type { NodeGeometry, VNode } from "./types.js";

/**
 * Renderer for `boundary`-kind groups. Each group becomes a dashed
 * rounded rectangle with its label tucked into the top-left corner —
 * the C4-PlantUML default rendering. The rect is sized either from an
 * explicit `metadata.layoutOverrides[groupId]` (used when the user has
 * resized / repositioned the boundary) or, as a fallback, from the
 * bounding box of its children.
 *
 * Visual contract: every colour goes through the `--uml-*` tokens
 * already in the contract, so the design-agnostic guard stays green
 * without having to extend the theme for boundaries.
 */
const DEFAULT_BOUNDARY_PADDING = 24;
const DEFAULT_EMPTY_WIDTH = 320;
const DEFAULT_EMPTY_HEIGHT = 200;
const LABEL_INSET_X = 16;
const LABEL_INSET_Y = 18;

export interface GroupBox {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ComputeGroupBoxesArgs {
  readonly diagram: Diagram;
  readonly nodeGeometry: ReadonlyMap<string, NodeGeometry>;
}

/**
 * Compute the visual rectangle for every boundary or package group in
 * `diagram`. Resolution order per group:
 *
 *   1) `metadata.layoutOverrides[groupId]` with `{x, y, width, height}`
 *      — explicit user override (resize / move).
 *   2) Bounding box of children + padding — auto-fit.
 *   3) Default empty rect at origin — for a freshly-created group with
 *      no children yet.
 */
export function computeGroupBoxes(args: ComputeGroupBoxesArgs): GroupBox[] {
  const { diagram, nodeGeometry } = args;
  const overrides = diagram.metadata.layoutOverrides ?? {};
  const boxes: GroupBox[] = [];
  for (const group of diagram.groups) {
    if (group.kind !== "boundary" && group.kind !== "package") continue;
    const override = overrides[group.id];
    if (override && override.width !== undefined && override.height !== undefined) {
      boxes.push({
        id: group.id,
        x: override.x,
        y: override.y,
        width: override.width,
        height: override.height,
      });
      continue;
    }
    const auto = autoFitFromChildren(group, nodeGeometry, override);
    if (auto) {
      boxes.push(auto);
      continue;
    }
    // Fully empty boundary — drop a default rect at the override origin
    // (or 0,0) so the user can immediately drag nodes into it.
    boxes.push({
      id: group.id,
      x: override?.x ?? 0,
      y: override?.y ?? 0,
      width: DEFAULT_EMPTY_WIDTH,
      height: DEFAULT_EMPTY_HEIGHT,
    });
  }
  return boxes;
}

function autoFitFromChildren(
  group: DiagramGroup,
  nodeGeometry: ReadonlyMap<string, NodeGeometry>,
  override: LayoutCoordinate | undefined,
): GroupBox | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const childId of group.children) {
    const geom = nodeGeometry.get(childId);
    if (!geom) continue;
    any = true;
    if (geom.x < minX) minX = geom.x;
    if (geom.y < minY) minY = geom.y;
    if (geom.x + geom.width > maxX) maxX = geom.x + geom.width;
    if (geom.y + geom.height > maxY) maxY = geom.y + geom.height;
  }
  if (!any) return null;
  // Top padding is larger so the label has room without overlapping the
  // first child row. Package groups need an extra strip equal to the tab
  // height so the tab + label don't sit on top of the first child.
  // Override.x/y wins for placement when supplied.
  const headerPad =
    group.kind === "package" ? PACKAGE_TAB_HEIGHT + 8 : DEFAULT_BOUNDARY_PADDING + 12;
  const x = override?.x ?? minX - DEFAULT_BOUNDARY_PADDING;
  const y = override?.y ?? minY - headerPad;
  const width = maxX - minX + DEFAULT_BOUNDARY_PADDING * 2;
  const height = maxY - minY + DEFAULT_BOUNDARY_PADDING + headerPad;
  return { id: group.id, x, y, width, height };
}

export interface RenderGroupLayerArgs extends ComputeGroupBoxesArgs {
  readonly diagram: Diagram;
}

/**
 * Build the `<g data-uml-layer="groups">` VNode containing one rect +
 * label + 8 resize handles per boundary. Sits at the bottom of the
 * content stack so edges and nodes still draw on top.
 *
 * The frame `<rect>` uses `pointer-events: stroke` so pointerdown is
 * captured only when the user grabs the dashed border (or the label
 * row), never when they click "through" the rectangle into a child
 * node — that would otherwise hijack every node click on a boundary
 * that contains them.
 */
export function renderGroupLayer(args: RenderGroupLayerArgs): VNode {
  const boxes = computeGroupBoxes(args);
  const byId = new Map<string, DiagramGroup>(args.diagram.groups.map((g) => [g.id, g]));
  const children: VNode[] = boxes.map((box) => {
    const group = byId.get(box.id);
    if (group?.kind === "package") {
      return renderPackageFrame(box, group);
    }
    return renderBoundaryFrame(box, group);
  });
  return v("g", { "data-uml-layer": "groups" }, children);
}

function renderBoundaryFrame(box: GroupBox, group: DiagramGroup | undefined): VNode {
  return v(
    "g",
    {
      "data-group-id": box.id,
      "data-uml-group": "boundary",
      tabindex: 0,
    },
    [
      v(
        "rect",
        {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          rx: 12,
          ry: 12,
          fill: "var(--uml-bg-elevated, transparent)",
          "fill-opacity": "0.35",
          stroke: "var(--uml-border, var(--uml-text-muted))",
          "stroke-width": "1.5",
          "stroke-dasharray": "10 6",
          "pointer-events": "stroke",
        },
        undefined,
        { classes: ["uml-group", "uml-group-boundary"] },
      ),
      v(
        "rect",
        {
          x: box.x,
          y: box.y,
          width: box.width,
          height: 32,
          fill: "transparent",
          "data-uml-group-handle": "label",
        },
        undefined,
        { classes: ["uml-group__label-band"] },
      ),
      v(
        "text",
        {
          x: box.x + LABEL_INSET_X,
          y: box.y + LABEL_INSET_Y,
          "font-family": "var(--uml-font-sans)",
          "font-size": "var(--uml-font-size-sm)",
          "font-weight": "600",
          fill: "var(--uml-text-muted)",
          "pointer-events": "none",
        },
        undefined,
        {
          text: group?.label || "(boundary)",
          classes: ["uml-group__label"],
        },
      ),
      v(
        "text",
        {
          x: box.x + LABEL_INSET_X,
          y: box.y + LABEL_INSET_Y + 14,
          "font-family": "var(--uml-font-sans)",
          "font-size": "var(--uml-font-size-sm)",
          fill: "var(--uml-text-muted)",
          "pointer-events": "none",
        },
        undefined,
        {
          text: "[Boundary]",
          classes: ["uml-group__type-tag"],
        },
      ),
      ...renderGroupResizeHandles(box),
    ],
  );
}

/**
 * Tab geometry for the UML package shape. Exported so `interactions.ts`
 * can reproduce the same path during ephemeral move/resize updates.
 */
export const PACKAGE_TAB_HEIGHT = 18;
export function packageTabWidth(label: string, boxWidth: number): number {
  return Math.min(Math.max(label.length * 7 + 24, 80), boxWidth * 0.6);
}
export function packagePathD(box: GroupBox, tabWidth: number): string {
  const t = PACKAGE_TAB_HEIGHT;
  const x = box.x;
  const y = box.y;
  const w = box.width;
  const h = box.height;
  // Single closed polygon: tab on the upper-left, body fills the rest.
  return (
    `M ${x} ${y} L ${x + tabWidth} ${y} L ${x + tabWidth} ${y + t} ` +
    `L ${x + w} ${y + t} L ${x + w} ${y + h} L ${x} ${y + h} Z`
  );
}

/**
 * UML package shape: a single closed polygon — folder-style tab on the
 * upper-left, body filling the rest. Drawn as one `<path>` so the outline
 * is continuous and the fill carries through; `interactions.ts` rewrites
 * the path's `d` attribute on ephemeral move/resize.
 *
 * A hidden `[data-uml-group-bounds]` rect carries the full bounding box
 * so `groupRectInLayout` (and any future hit-test) can read the geometry
 * uniformly across boundary and package.
 */
function renderPackageFrame(box: GroupBox, group: DiagramGroup): VNode {
  const label = group.label || "(package)";
  const tabWidth = packageTabWidth(label, box.width);
  const d = packagePathD(box, tabWidth);
  return v(
    "g",
    {
      "data-group-id": box.id,
      "data-uml-group": "package",
      tabindex: 0,
    },
    [
      // Hidden bounds rect — single source of truth for the group's
      // bounding box across pan/zoom and ephemeral updates. Not visible,
      // not interactive (children own pointer events).
      v(
        "rect",
        {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          fill: "none",
          stroke: "none",
          "pointer-events": "none",
          "data-uml-group-bounds": "true",
        },
        undefined,
        { classes: ["uml-group__bounds"] },
      ),
      // Visible package outline.
      v(
        "path",
        {
          d,
          fill: "var(--uml-package-bg, var(--uml-bg-elevated))",
          "fill-opacity": "0.35",
          stroke: "var(--uml-package-border, var(--uml-border))",
          "stroke-width": "1",
          "pointer-events": "stroke",
          "data-uml-package-path": "true",
        },
        undefined,
        {
          classes: ["uml-group", "uml-group-package"],
        },
      ),
      // Tab fill — rendered on top of the path so the tab background can
      // differ from the body. Pointer-events `auto` on the tab makes the
      // entire tab a grab zone, matching the boundary's label-band UX.
      v(
        "rect",
        {
          x: box.x,
          y: box.y,
          width: tabWidth,
          height: PACKAGE_TAB_HEIGHT,
          fill: "var(--uml-package-tab-bg, var(--uml-bg-elevated))",
          stroke: "none",
          "data-uml-group-handle": "label",
        },
        undefined,
        { classes: ["uml-group__package-tab", "uml-group__label-band"] },
      ),
      v(
        "text",
        {
          x: box.x + 8,
          y: box.y + PACKAGE_TAB_HEIGHT - 5,
          "font-family": "var(--uml-font-sans)",
          "font-size": "var(--uml-font-size-sm)",
          "font-weight": "600",
          fill: "var(--uml-text-muted)",
          "pointer-events": "none",
        },
        undefined,
        {
          text: label,
          classes: ["uml-group__label"],
        },
      ),
      ...renderGroupResizeHandles(box),
    ],
  );
}

/**
 * Eight resize handles arranged at the corners and side midpoints of
 * the boundary rectangle. CSS hides them unless the boundary itself is
 * `data-selected="true"`, mirroring the per-node behaviour. The
 * `data-resize-handle` attribute is the same one `interactions.ts`
 * already detects, so resize-mode entry stays uniform.
 */
function renderGroupResizeHandles(box: GroupBox): VNode[] {
  type Side = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
  const positions: ReadonlyArray<{ side: Side; x: number; y: number; cursor: string }> = [
    { side: "nw", x: box.x, y: box.y, cursor: "nwse-resize" },
    { side: "n", x: box.x + box.width / 2, y: box.y, cursor: "ns-resize" },
    { side: "ne", x: box.x + box.width, y: box.y, cursor: "nesw-resize" },
    { side: "e", x: box.x + box.width, y: box.y + box.height / 2, cursor: "ew-resize" },
    { side: "se", x: box.x + box.width, y: box.y + box.height, cursor: "nwse-resize" },
    { side: "s", x: box.x + box.width / 2, y: box.y + box.height, cursor: "ns-resize" },
    { side: "sw", x: box.x, y: box.y + box.height, cursor: "nesw-resize" },
    { side: "w", x: box.x, y: box.y + box.height / 2, cursor: "ew-resize" },
  ];
  const HALF = 4;
  return positions.map((p) =>
    v(
      "rect",
      {
        x: p.x - HALF,
        y: p.y - HALF,
        width: HALF * 2,
        height: HALF * 2,
        fill: "var(--uml-selection-handle, var(--uml-accent))",
        stroke: "var(--uml-bg)",
        "stroke-width": "1",
        "data-resize-handle": p.side,
      },
      undefined,
      {
        style: `cursor: ${p.cursor}`,
        classes: ["uml-group-resize-handle", `uml-group-resize-handle--${p.side}`],
      },
    ),
  );
}

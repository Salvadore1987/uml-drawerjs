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
 * Compute the visual rectangle for every boundary group in `diagram`.
 * Returns nothing for non-boundary group kinds (package / system are
 * not rendered yet — that's a separate ADR).
 *
 * Resolution order per group:
 *   1) `metadata.layoutOverrides[groupId]` with `{x, y, width, height}`
 *      — explicit user override (resize / move).
 *   2) Bounding box of children + padding — auto-fit.
 *   3) Default empty rect at origin — for a freshly-created boundary
 *      with no children yet.
 */
export function computeGroupBoxes(args: ComputeGroupBoxesArgs): GroupBox[] {
  const { diagram, nodeGeometry } = args;
  const overrides = diagram.metadata.layoutOverrides ?? {};
  const boxes: GroupBox[] = [];
  for (const group of diagram.groups) {
    if (group.kind !== "boundary") continue;
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
  // first child row. Override.x/y wins for placement when supplied.
  const x = override?.x ?? minX - DEFAULT_BOUNDARY_PADDING;
  const y = override?.y ?? minY - DEFAULT_BOUNDARY_PADDING - 12;
  const width = maxX - minX + DEFAULT_BOUNDARY_PADDING * 2;
  const height = maxY - minY + DEFAULT_BOUNDARY_PADDING * 2 + 12;
  return { id: group.id, x, y, width, height };
}

export interface RenderGroupLayerArgs extends ComputeGroupBoxesArgs {
  readonly diagram: Diagram;
}

/**
 * Build the `<g data-uml-layer="groups">` VNode containing one rect +
 * label per boundary. Sits at the bottom of the content stack so edges
 * and nodes still draw on top.
 */
export function renderGroupLayer(args: RenderGroupLayerArgs): VNode {
  const boxes = computeGroupBoxes(args);
  const byId = new Map<string, DiagramGroup>(args.diagram.groups.map((g) => [g.id, g]));
  const children: VNode[] = boxes.map((box) => {
    const group = byId.get(box.id);
    return v(
      "g",
      {
        "data-group-id": box.id,
        "data-uml-group": "boundary",
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
          },
          undefined,
          { classes: ["uml-group", "uml-group-boundary"] },
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
          },
          undefined,
          {
            text: "[Boundary]",
            classes: ["uml-group__type-tag"],
          },
        ),
      ],
    );
  });
  return v("g", { "data-uml-layer": "groups" }, children);
}

import type { DiagramEdge, EdgeEndpoint, EdgeKind } from "../model/types.js";
import { v } from "./types.js";
import type { NodeGeometry, VNode } from "./types.js";

/**
 * Per-kind edge renderer. Produces an `<g>` containing a path between the
 * port-snapped endpoints, an arrow head at the target side (and sometimes
 * the source side, for crow's-foot ER), an optional label pill, and
 * optional cardinality badges at each end.
 *
 * Routing is intentionally simple: a single straight segment from
 * source-rect intersection to target-rect intersection. The renderer
 * exposes the resulting geometry on the vnode (`data-source-x` etc.) so
 * downstream interaction code can compute hit zones without re-parsing.
 */
export interface RenderEdgeArgs {
  readonly edge: DiagramEdge;
  readonly source: NodeGeometry;
  readonly target: NodeGeometry;
}

export function renderEdge(args: RenderEdgeArgs): VNode {
  const { edge, source, target } = args;
  const { from, to } = portSnap(source, target);

  const children: VNode[] = [];
  children.push(renderPath(edge, from, to));
  if (edge.label && edge.label.trim() !== "") {
    children.push(renderLabel(edge.label, from, to));
  }
  // Class diagrams: per-end role + multiplicity from `edge.ends`. ER fall-back
  // remains via `edge.cardinality`. Both can coexist without overlap because
  // class diagrams emit `ends` and never `cardinality`, and vice versa.
  const sourceEndText = endpointText(edge.ends?.source);
  const targetEndText = endpointText(edge.ends?.target);
  if (sourceEndText) {
    children.push(renderCardinality(sourceEndText, from, to, "source"));
  } else if (edge.cardinality?.source) {
    children.push(renderCardinality(edge.cardinality.source, from, to, "source"));
  }
  if (targetEndText) {
    children.push(renderCardinality(targetEndText, from, to, "target"));
  } else if (edge.cardinality?.target) {
    children.push(renderCardinality(edge.cardinality.target, from, to, "target"));
  }

  return v(
    "g",
    {
      "data-edge-id": edge.id,
      "data-edge-kind": edge.kind,
      "data-source-x": Math.round(from.x),
      "data-source-y": Math.round(from.y),
      "data-target-x": Math.round(to.x),
      "data-target-y": Math.round(to.y),
    },
    children,
    {
      classes: ["uml-edge", `uml-edge-${edge.kind}`],
      aria: { role: "graphics-symbol", "aria-label": ariaLabelFor(edge) },
    },
  );
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Shrink the segment between two node rectangles so that its endpoints
 * land on the rectangle borders rather than at their centres. Uses the
 * canonical line / axis-aligned-rectangle intersection — for the MVP one
 * straight segment is enough; orthogonal routing is queued for a follow-up.
 */
export function portSnap(source: NodeGeometry, target: NodeGeometry): { from: Point; to: Point } {
  const sourceCentre = centreOf(source);
  const targetCentre = centreOf(target);
  return {
    from: intersectRect(source, sourceCentre, targetCentre),
    to: intersectRect(target, targetCentre, sourceCentre),
  };
}

function centreOf(rect: NodeGeometry): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function intersectRect(rect: NodeGeometry, from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return from;
  const halfW = rect.width / 2;
  const halfH = rect.height / 2;
  // Pick the smaller of `t_x = halfW / |dx|`, `t_y = halfH / |dy|` — that
  // is the parameter at which the ray (centre → other-centre) exits this
  // rectangle. Clamp to 1 so the second-centre case still terminates.
  const tx = dx === 0 ? Number.POSITIVE_INFINITY : halfW / Math.abs(dx);
  const ty = dy === 0 ? Number.POSITIVE_INFINITY : halfH / Math.abs(dy);
  const t = Math.min(tx, ty, 1);
  return {
    x: from.x + dx * t,
    y: from.y + dy * t,
  };
}

const DASH_BY_KIND: Partial<Record<EdgeKind, string>> = {
  realization: "6 4",
  dependency: "4 3",
  return: "5 3",
};

function renderPath(edge: DiagramEdge, from: Point, to: Point): VNode {
  return v("line", {
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y,
    stroke: "var(--uml-edge-stroke)",
    "stroke-width": "var(--uml-edge-stroke-width)",
    "stroke-dasharray": DASH_BY_KIND[edge.kind],
    "marker-end": markerForKind(edge.kind, "end"),
    "marker-start": markerForKind(edge.kind, "start"),
    fill: "none",
  });
}

function markerForKind(kind: EdgeKind, side: "start" | "end"): string | undefined {
  if (side === "end") {
    switch (kind) {
      case "inheritance":
      case "realization":
        return "url(#uml-arrow-triangle)";
      case "composition":
        return "url(#uml-arrow-diamond-filled)";
      case "aggregation":
        return "url(#uml-arrow-diamond-open)";
      case "dependency":
      case "association":
      case "uses":
      case "depends-on":
      case "sync-call":
      case "create":
      case "destroy":
        return "url(#uml-arrow-arrow)";
      case "async-call":
        return "url(#uml-arrow-open)";
      case "return":
        return "url(#uml-arrow-open)";
      default:
        return "url(#uml-arrow-arrow)";
    }
  }
  // start side: only crow's-foot in MVP carries marker on both ends
  if (kind === "many-to-many") return "url(#uml-arrow-arrow)";
  return undefined;
}

function renderLabel(label: string, from: Point, to: Point): VNode {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  return v(
    "g",
    { transform: `translate(${mx}, ${my})` },
    [
      v(
        "rect",
        {
          x: -label.length * 3.5 - 6,
          y: -10,
          width: label.length * 7 + 12,
          height: 18,
          rx: 4,
          ry: 4,
          fill: "var(--uml-edge-label-bg)",
        },
        undefined,
        { classes: ["uml-edge-label-bg"] },
      ),
      v(
        "text",
        {
          x: 0,
          y: 4,
          "text-anchor": "middle",
          "font-family": "var(--uml-font-sans)",
          "font-size": "var(--uml-font-size-sm)",
          fill: "var(--uml-edge-label-text)",
        },
        undefined,
        { text: label, classes: ["uml-edge-label-text"] },
      ),
    ],
    { classes: ["uml-edge-label"] },
  );
}

function endpointText(end: EdgeEndpoint | undefined): string | undefined {
  if (!end) return undefined;
  const mult = end.multiplicity?.trim();
  const role = end.role?.trim();
  if (mult && role) return `${mult} ${role}`;
  return mult || role || undefined;
}

function renderCardinality(text: string, from: Point, to: Point, side: "source" | "target"): VNode {
  const ratio = side === "source" ? 0.12 : 0.88;
  const x = from.x + (to.x - from.x) * ratio;
  const y = from.y + (to.y - from.y) * ratio - 6;
  return v(
    "text",
    {
      x,
      y,
      "text-anchor": "middle",
      "font-family": "var(--uml-font-sans)",
      "font-size": "var(--uml-font-size-sm)",
      fill: "var(--uml-edge-label-text)",
    },
    undefined,
    {
      text,
      classes: ["uml-edge-cardinality", `uml-edge-cardinality-${side}`],
    },
  );
}

/** Reusable `<defs>` fragment carrying the renderer's arrow markers. */
export function renderArrowMarkerDefs(): VNode {
  const make = (
    id: string,
    refX: number,
    fill: string,
    pathData: string,
    extra?: Record<string, string>,
  ): VNode =>
    v(
      "marker",
      {
        id,
        viewBox: "0 0 12 12",
        refX,
        refY: 6,
        markerWidth: 12,
        markerHeight: 12,
        orient: "auto-start-reverse",
        ...extra,
      },
      [
        v("path", {
          d: pathData,
          fill,
          stroke: "var(--uml-edge-arrow)",
          "stroke-width": "1",
        }),
      ],
    );

  return v("defs", undefined, [
    make("uml-arrow-arrow", 11, "var(--uml-edge-arrow)", "M0 0 L12 6 L0 12 Z"),
    make("uml-arrow-open", 11, "transparent", "M0 0 L12 6 L0 12"),
    make("uml-arrow-triangle", 11, "var(--uml-node-bg)", "M0 0 L12 6 L0 12 Z"),
    make("uml-arrow-diamond-filled", 11, "var(--uml-edge-arrow)", "M0 6 L6 0 L12 6 L6 12 Z"),
    make("uml-arrow-diamond-open", 11, "var(--uml-node-bg)", "M0 6 L6 0 L12 6 L6 12 Z"),
  ]);
}

function ariaLabelFor(edge: DiagramEdge): string {
  const labelPart = edge.label ? ` labelled '${edge.label}'` : "";
  return `${edge.kind} edge${labelPart}`;
}

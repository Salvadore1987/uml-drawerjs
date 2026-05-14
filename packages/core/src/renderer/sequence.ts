import type {
  CombinedFragment,
  Diagram,
  DiagramEdge,
  DiagramNode,
  FragmentOperand,
  NodeKind,
  SequenceDivider,
  SequenceNote,
} from "../model/types.js";
import type { LayoutCoordinates } from "../layout/types.js";
import { v } from "./types.js";
import type { NodeGeometry, RenderedDiagram, RendererOptions, VNode } from "./types.js";
import { resolveRendererDefaults } from "./types.js";
import { renderArrowMarkerDefs } from "./edges.js";
import { renderGridLayer } from "./grid.js";
import { renderPortHandles, renderResizeHandles } from "./nodes.js";

/**
 * Sequence-diagram renderer. Owned end-to-end here because UML SD geometry
 * differs fundamentally from the generic node + edge model: lifelines live
 * on a column, messages on a row, and ornaments (activations, fragments,
 * notes, dividers) anchor to chronological positions rather than to a node
 * rectangle.
 *
 * Layout invariants (mirrors `layout/sequence.ts`):
 *   - Each lifeline column has a fixed `x` derived from index.
 *   - The head occupies y = 0 .. HEAD_HEIGHT.
 *   - Below the head, the time axis advances by one ROW per timeline event:
 *       * fragment open / else markers (one row each, before the edge)
 *       * notes anchored at the top of the diagram
 *       * dividers anchored at the top
 *       * the message edge itself
 *       * extra row for self-message arc
 *       * notes anchored to that edge
 *       * dividers anchored after the edge
 *       * fragment end markers
 *
 * No hex literals — every colour / stroke / dash flows through `--uml-*`.
 */

// ---------- Constants ----------

const HEAD_HEIGHT = 64;
const HEAD_WIDTH_MIN = 120;
const ICON_AREA_TOP = 6;
const ICON_AREA_HEIGHT = 28;
const HEAD_LABEL_Y = HEAD_HEIGHT - 16; // baseline for the centered name

const ROW_HEIGHT = 32;
const ACTIVATION_WIDTH = 12;
const SELF_MESSAGE_DROP = 26;
const SELF_MESSAGE_OUT = 28;

const FRAGMENT_PAD_X = 12;
const FRAGMENT_PAD_Y = 6;
const FRAGMENT_HEADER_HEIGHT = 18;

const NOTE_FOLD = 8;
const NOTE_PAD_X = 8;
const NOTE_PAD_Y = 6;

const TOP_PADDING = 16;
const BOTTOM_PADDING = 32;

// ---------- Public entry ----------

interface RenderSequenceArgs {
  readonly diagram: Diagram;
  readonly coordinates: LayoutCoordinates;
  readonly options: RendererOptions;
}

export function renderSequenceDiagram(args: RenderSequenceArgs): RenderedDiagram {
  const { diagram, coordinates, options } = args;
  const defaults = resolveRendererDefaults(options);

  const lifelineColumns = computeLifelineColumns(diagram, coordinates, defaults.nodeWidth);

  // Build chronological timeline: pre-events, edge, post-events. Each item
  // gets a y-row so ornaments anchor consistently.
  const plan = buildTimelinePlan(diagram);

  // Per-edge y-row map for activation / arrow placement.
  const edgeYRow = new Map<string, number>();
  for (const item of plan.items) {
    if (item.kind === "edge") edgeYRow.set(item.edgeId, item.y);
  }

  const nodeGeometry = new Map<string, NodeGeometry>();
  for (const col of lifelineColumns.values()) {
    nodeGeometry.set(col.node.id, {
      id: col.node.id,
      x: col.x,
      y: 0,
      width: col.width,
      height: HEAD_HEIGHT,
    });
  }

  const totalWidth = computeWidth(lifelineColumns);
  // Account for any fragment that visually extends below its last
  // contained edge via `bottomExtraPx` so the SVG viewport doesn't
  // clip the extended frame.
  let maxFragmentBottomExtra = 0;
  for (const fragment of diagram.fragments ?? []) {
    const extra = fragment.bottomExtraPx ?? 0;
    if (extra > maxFragmentBottomExtra) maxFragmentBottomExtra = extra;
  }
  const computedHeight =
    HEAD_HEIGHT + plan.totalRows * ROW_HEIGHT + BOTTOM_PADDING + maxFragmentBottomExtra;
  // Lifeline shaft length is user-resizable: any per-node height override
  // (written by `resizeNodeCommand` when the user drags a resize handle)
  // extends the diagram height. Without an override the renderer auto-fits
  // around the timeline.
  let maxOverrideHeight = 0;
  for (const node of diagram.nodes) {
    const override = coordinates[node.id]?.height;
    if (typeof override === "number" && override > maxOverrideHeight) {
      maxOverrideHeight = override;
    }
  }
  const totalHeight = Math.max(computedHeight, maxOverrideHeight);

  const children: VNode[] = [];

  // 1. Lifeline shafts — drawn behind everything so messages and
  //    activations paint on top.
  for (const col of lifelineColumns.values()) {
    children.push(renderShaft(col.cx, HEAD_HEIGHT, totalHeight - BOTTOM_PADDING / 2));
  }

  // 2. Activation rectangles — drawn before message arrows so they sit on
  //    the shaft but underneath the arrow heads.
  children.push(...renderActivations(diagram, lifelineColumns, edgeYRow, plan.lastEdgeY));

  // 3. Fragments — drawn before notes/dividers so the operand divider
  //    lines paint above the frame, but below the edges.
  children.push(...renderFragments(diagram, lifelineColumns, plan));

  // 4. Notes anchored at top of diagram.
  for (const note of diagram.notes ?? []) {
    if (note.anchorEdgeId) continue;
    const yRow = plan.topNoteRows.get(note.id);
    if (yRow === undefined) continue;
    children.push(renderNote(note, lifelineColumns, totalWidth, yToPx(yRow)));
  }

  // 5. Top dividers.
  for (const divider of diagram.dividers ?? []) {
    if (divider.afterEdgeId) continue;
    const yRow = plan.topDividerRows.get(divider.id);
    if (yRow === undefined) continue;
    children.push(renderDivider(divider, totalWidth, yToPx(yRow)));
  }

  // 6. Notes anchored to specific edges.
  for (const note of diagram.notes ?? []) {
    if (!note.anchorEdgeId) continue;
    const yRow = plan.edgeNoteRows.get(note.id);
    if (yRow === undefined) continue;
    children.push(renderNote(note, lifelineColumns, totalWidth, yToPx(yRow)));
  }

  // 7. Edge-anchored dividers.
  for (const divider of diagram.dividers ?? []) {
    if (!divider.afterEdgeId) continue;
    const yRow = plan.edgeDividerRows.get(divider.id);
    if (yRow === undefined) continue;
    children.push(renderDivider(divider, totalWidth, yToPx(yRow)));
  }

  // 8. Messages — drawn last so arrowheads sit on top of activations.
  let autoNumberCounter = diagram.metadata.sequenceAutoNumber?.start ?? 0;
  const autoNumberStep = diagram.metadata.sequenceAutoNumber?.increment ?? 1;
  const autoNumberFormat = diagram.metadata.sequenceAutoNumber?.format;
  for (const edge of diagram.edges) {
    const yRow = edgeYRow.get(edge.id);
    if (yRow === undefined) continue;
    const labelPrefix = diagram.metadata.sequenceAutoNumber
      ? formatAutoNumber(autoNumberCounter, autoNumberFormat) + " "
      : "";
    if (diagram.metadata.sequenceAutoNumber) autoNumberCounter += autoNumberStep;
    children.push(renderMessage(edge, lifelineColumns, yToPx(yRow), labelPrefix));
  }

  // 9. Lifeline heads — drawn on top so shafts/activations don't poke
  //    into the icon box. Each head carries port + resize handles; the
  //    handles' bottom row sits at the user-overridden lifeline height
  //    (or the auto-fit total height) so dragging the south handle
  //    extends the shaft.
  const lifelineFullHeight = totalHeight - BOTTOM_PADDING / 2;
  for (const col of lifelineColumns.values()) {
    const overrideHeight = coordinates[col.node.id]?.height;
    children.push(renderLifelineHead(col, Math.max(overrideHeight ?? 0, lifelineFullHeight)));
  }

  const root: VNode = v(
    "svg",
    {
      width: "100%",
      height: "100%",
      viewBox: `${-defaults.canvasPadding} ${-defaults.canvasPadding} ${totalWidth + defaults.canvasPadding * 2} ${totalHeight + defaults.canvasPadding * 2}`,
      preserveAspectRatio: "xMidYMid meet",
      role: "img",
      "aria-label": `sequence diagram${diagram.title ? `: ${diagram.title}` : ""}`,
      "data-diagram-type": diagram.type,
    },
    [
      renderArrowMarkerDefs(),
      v("g", { "data-uml-content": "true" }, [
        renderGridLayer({
          visible: options.grid?.visible ?? true,
          step: options.grid?.step ?? 12,
          bbox: {
            x: -defaults.canvasPadding,
            y: -defaults.canvasPadding,
            width: totalWidth + defaults.canvasPadding * 2,
            height: totalHeight + defaults.canvasPadding * 2,
          },
        }),
        v("g", { "data-uml-layer": "sequence" }, children),
      ]),
    ],
    {
      classes: ["uml-canvas", "uml-canvas--sequence"],
    },
  );

  return {
    root,
    width: totalWidth + defaults.canvasPadding * 2,
    height: totalHeight + defaults.canvasPadding * 2,
    coordinates,
    nodeGeometry,
  };
}

function yToPx(yRow: number): number {
  return HEAD_HEIGHT + TOP_PADDING + yRow * ROW_HEIGHT;
}

// ---------- Lifeline columns ----------

interface LifelineColumn {
  readonly node: DiagramNode;
  readonly x: number;
  readonly width: number;
  readonly cx: number;
  readonly index: number;
}

function computeLifelineColumns(
  diagram: Diagram,
  coordinates: LayoutCoordinates,
  defaultWidth: number,
): Map<string, LifelineColumn> {
  const map = new Map<string, LifelineColumn>();
  diagram.nodes.forEach((node, index) => {
    const coord = coordinates[node.id] ?? { x: index * (defaultWidth + 60), y: 0 };
    const width = Math.max(coord.width ?? defaultWidth, HEAD_WIDTH_MIN);
    map.set(node.id, {
      node,
      x: coord.x,
      width,
      cx: coord.x + width / 2,
      index,
    });
  });
  return map;
}

function computeWidth(columns: Map<string, LifelineColumn>): number {
  let max = 0;
  for (const col of columns.values()) {
    const right = col.x + col.width;
    if (right > max) max = right;
  }
  return max;
}

// ---------- Timeline plan ----------

interface TimelineEdgeItem {
  readonly kind: "edge";
  readonly edgeId: string;
  readonly y: number;
}

interface TimelinePlan {
  readonly items: TimelineEdgeItem[];
  readonly totalRows: number;
  readonly topNoteRows: Map<string, number>;
  readonly topDividerRows: Map<string, number>;
  readonly edgeNoteRows: Map<string, number>;
  readonly edgeDividerRows: Map<string, number>;
  readonly fragmentRows: Map<
    string,
    { yTop: number; yBottom: number; operandSwitchRows: Map<string, number> }
  >;
  readonly lastEdgeY: number;
}

function buildTimelinePlan(diagram: Diagram): TimelinePlan {
  const items: TimelineEdgeItem[] = [];
  const topNoteRows = new Map<string, number>();
  const topDividerRows = new Map<string, number>();
  const edgeNoteRows = new Map<string, number>();
  const edgeDividerRows = new Map<string, number>();
  const fragmentRows = new Map<
    string,
    { yTop: number; yBottom: number; operandSwitchRows: Map<string, number> }
  >();

  let row = 0;

  // Top-anchored notes / dividers (no anchor).
  for (const note of diagram.notes ?? []) {
    if (note.anchorEdgeId) continue;
    topNoteRows.set(note.id, row);
    row += 1;
  }
  for (const divider of diagram.dividers ?? []) {
    if (divider.afterEdgeId) continue;
    topDividerRows.set(divider.id, row);
    row += 1;
  }

  // Index fragment open / else / end events by their anchor edge id.
  const fragments = diagram.fragments ?? [];
  const fragmentEnterAt = new Map<string, CombinedFragment[]>();
  const fragmentExitAt = new Map<string, CombinedFragment[]>();
  const operandSwitchAt = new Map<string, { fragmentId: string; operand: FragmentOperand }[]>();
  for (const fragment of fragments) {
    const first = firstEdgeOf(fragment);
    if (first) bumpList(fragmentEnterAt, first, fragment);
    const last = lastEdgeOf(fragment);
    if (last) bumpList(fragmentExitAt, last, fragment);
    for (let i = 1; i < fragment.operands.length; i += 1) {
      const operand = fragment.operands[i];
      const switchAt = operand?.edges[0];
      if (switchAt && operand) {
        bumpList(operandSwitchAt, switchAt, { fragmentId: fragment.id, operand });
      }
    }
  }

  // Walk edges chronologically.
  let lastEdgeY = row;
  for (const edge of diagram.edges) {
    // Fragment open → record yTop now (before incrementing).
    for (const fragment of fragmentEnterAt.get(edge.id) ?? []) {
      const slot = fragmentRows.get(fragment.id) ?? {
        yTop: row,
        yBottom: row,
        operandSwitchRows: new Map<string, number>(),
      };
      slot.yTop = row;
      fragmentRows.set(fragment.id, slot);
      row += 1;
    }
    // Operand switches (`else`).
    for (const sw of operandSwitchAt.get(edge.id) ?? []) {
      const slot = fragmentRows.get(sw.fragmentId);
      if (slot) slot.operandSwitchRows.set(sw.operand.id, row);
      row += 1;
    }
    // The edge itself.
    items.push({ kind: "edge", edgeId: edge.id, y: row });
    lastEdgeY = row;
    row += 1;
    // Self-message arc reserves an extra row for the loop.
    if (edge.source === edge.target) row += 1;
    // Notes anchored to this edge.
    for (const note of (diagram.notes ?? []).filter((n) => n.anchorEdgeId === edge.id)) {
      edgeNoteRows.set(note.id, row);
      row += 1;
    }
    // Dividers anchored after this edge.
    for (const divider of (diagram.dividers ?? []).filter((d) => d.afterEdgeId === edge.id)) {
      edgeDividerRows.set(divider.id, row);
      row += 1;
    }
    // Fragment end markers.
    for (const fragment of fragmentExitAt.get(edge.id) ?? []) {
      const slot = fragmentRows.get(fragment.id);
      if (slot) slot.yBottom = row;
      row += 1;
    }
  }

  return {
    items,
    totalRows: row,
    topNoteRows,
    topDividerRows,
    edgeNoteRows,
    edgeDividerRows,
    fragmentRows,
    lastEdgeY,
  };
}

function firstEdgeOf(fragment: CombinedFragment): string | undefined {
  for (const op of fragment.operands) {
    if (op.edges.length > 0) return op.edges[0];
  }
  return undefined;
}

function lastEdgeOf(fragment: CombinedFragment): string | undefined {
  for (let i = fragment.operands.length - 1; i >= 0; i -= 1) {
    const op = fragment.operands[i];
    if (op && op.edges.length > 0) return op.edges[op.edges.length - 1];
  }
  return undefined;
}

function bumpList<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

// ---------- Lifeline head with UML iconography ----------

function renderLifelineHead(col: LifelineColumn, fullHeight: number): VNode {
  // Lifeline geometry shared with the port / resize handle helpers. The
  // outer `<g>` carries `transform="translate(col.x, 0)"` so handle
  // children — which are computed in the node's own 0-relative coordinate
  // system by `nodes.ts` — land at the correct on-canvas positions. This
  // mirrors the `<g transform=…> <rect x=0 y=0>` pattern that
  // `interactions.ts:nodeRectInLayout` expects for hit-testing.
  //
  // `fullHeight` is the total lifeline span (head + shaft). The geometry
  // we pass to the handle helpers — and the *first* `<rect>` we render —
  // both use this value so:
  //   1. The bottom resize handle lands at the bottom of the shaft, so
  //      dragging it extends the shaft visually.
  //   2. `nodeRectInLayout` reports a rect spanning the full lifeline,
  //      so successive resize gestures start from the user's last
  //      override (not from HEAD_HEIGHT).
  const geom: NodeGeometry = {
    id: col.node.id,
    x: col.x,
    y: 0,
    width: col.width,
    height: fullHeight,
  };

  const children: VNode[] = [];
  // Invisible interaction backplate — first rect so nodeRectInLayout
  // picks it up. Spans the full lifeline so the south resize handle
  // sits at the bottom of the shaft.
  children.push(
    v("rect", {
      x: 0,
      y: 0,
      width: col.width,
      height: fullHeight,
      fill: "transparent",
      stroke: "none",
      "pointer-events": "none",
    }),
  );
  // Visible head box — shorter than the full geometry; the shaft is a
  // separate dashed `<line>` rendered earlier.
  children.push(
    v("rect", {
      x: 0,
      y: 0,
      width: col.width,
      height: HEAD_HEIGHT,
      fill: "var(--uml-sequence-icon-fill, var(--uml-node-bg))",
      stroke: "var(--uml-sequence-icon-stroke, var(--uml-node-border))",
      "stroke-width": "var(--uml-sequence-icon-stroke-width, 1.5)",
    }),
  );

  // Per-kind icon centred at the top of the head — coords are 0-relative.
  const iconCx = col.width / 2;
  const iconCy = ICON_AREA_TOP + ICON_AREA_HEIGHT / 2;
  const icon = renderLifelineIcon(col.node.kind, iconCx, iconCy);
  if (icon) children.push(icon);

  // Name label centred at the bottom of the head.
  children.push(
    v(
      "text",
      {
        x: col.width / 2,
        y: HEAD_LABEL_Y,
        "text-anchor": "middle",
        "font-family": "var(--uml-font-sans)",
        "font-size": "var(--uml-font-size-base)",
        "font-weight": "600",
        fill: "var(--uml-node-text)",
      },
      undefined,
      { text: col.node.label, classes: ["uml-sequence-lifeline-label"] },
    ),
  );

  // Port handles + resize handles — same as every other diagram type.
  // The `uml-node` class on the outer group lets the existing
  // `:hover` / `[data-selected]` CSS rules reveal them.
  children.push(...renderPortHandles(geom));
  children.push(...renderResizeHandles(geom));

  return v(
    "g",
    {
      "data-node-id": col.node.id,
      "data-node-kind": col.node.kind,
      transform: `translate(${col.x}, 0)`,
      tabindex: 0,
    },
    children,
    {
      classes: [
        "uml-node",
        `uml-node-${col.node.kind}`,
        "uml-sequence-lifeline",
        `uml-sequence-lifeline--${col.node.kind}`,
      ],
    },
  );
}

function renderLifelineIcon(kind: NodeKind, cx: number, cy: number): VNode | null {
  const stroke = "var(--uml-sequence-icon-stroke, var(--uml-text-primary))";
  const strokeW = "var(--uml-sequence-icon-stroke-width, 1.5)";
  const fill = "var(--uml-sequence-icon-fill, var(--uml-surface, var(--uml-node-bg)))";
  switch (kind) {
    case "actor":
      return renderActorIcon(cx, cy, stroke, strokeW);
    case "lifeline-boundary":
      return renderBoundaryIcon(cx, cy, stroke, strokeW, fill);
    case "lifeline-control":
      return renderControlIcon(cx, cy, stroke, strokeW, fill);
    case "lifeline-entity":
      return renderEntityIcon(cx, cy, stroke, strokeW, fill);
    case "lifeline-collections":
      return renderCollectionsIcon(cx, cy, stroke, strokeW, fill);
    case "database":
      return renderDatabaseIcon(cx, cy, stroke, strokeW, fill);
    case "queue":
      return renderQueueIcon(cx, cy, stroke, strokeW, fill);
    case "lifeline":
    default:
      return null;
  }
}

function renderActorIcon(cx: number, cy: number, stroke: string, sw: string): VNode {
  // Stick figure: head + body + arms + legs.
  const r = 4;
  const headCy = cy - 8;
  const bodyTop = headCy + r;
  const bodyBottom = bodyTop + 10;
  return v("g", { "data-uml-icon": "actor" }, [
    v("circle", {
      cx,
      cy: headCy,
      r,
      fill: "none",
      stroke,
      "stroke-width": sw,
    }),
    v("path", {
      d: `M ${cx} ${bodyTop} L ${cx} ${bodyBottom} M ${cx - 6} ${bodyTop + 4} L ${cx + 6} ${bodyTop + 4} M ${cx} ${bodyBottom} L ${cx - 5} ${bodyBottom + 6} M ${cx} ${bodyBottom} L ${cx + 5} ${bodyBottom + 6}`,
      stroke,
      "stroke-width": sw,
      fill: "none",
      "stroke-linecap": "round",
    }),
  ]);
}

function renderBoundaryIcon(
  cx: number,
  cy: number,
  stroke: string,
  sw: string,
  fill: string,
): VNode {
  // Vertical bar | + horizontal — + circle ○. Standard UML boundary glyph.
  const barX = cx - 10;
  const ringCx = cx + 4;
  return v("g", { "data-uml-icon": "boundary" }, [
    v("path", {
      d: `M ${barX} ${cy - 8} L ${barX} ${cy + 8} M ${barX} ${cy} L ${ringCx - 5} ${cy}`,
      stroke,
      "stroke-width": sw,
      fill: "none",
    }),
    v("circle", {
      cx: ringCx,
      cy,
      r: 5,
      fill,
      stroke,
      "stroke-width": sw,
    }),
  ]);
}

function renderControlIcon(
  cx: number,
  cy: number,
  stroke: string,
  sw: string,
  fill: string,
): VNode {
  // Circle with a small arrow at the top-left (the "hook").
  return v("g", { "data-uml-icon": "control" }, [
    v("circle", {
      cx,
      cy: cy + 1,
      r: 7,
      fill,
      stroke,
      "stroke-width": sw,
    }),
    v("path", {
      d: `M ${cx - 4} ${cy - 6} L ${cx - 1} ${cy - 9} M ${cx - 4} ${cy - 6} L ${cx - 1} ${cy - 4}`,
      stroke,
      "stroke-width": sw,
      fill: "none",
      "stroke-linecap": "round",
    }),
  ]);
}

function renderEntityIcon(cx: number, cy: number, stroke: string, sw: string, fill: string): VNode {
  // Circle resting on a short horizontal underline.
  return v("g", { "data-uml-icon": "lifeline-entity" }, [
    v("circle", {
      cx,
      cy: cy - 1,
      r: 7,
      fill,
      stroke,
      "stroke-width": sw,
    }),
    v("path", {
      d: `M ${cx - 9} ${cy + 8} L ${cx + 9} ${cy + 8}`,
      stroke,
      "stroke-width": sw,
      fill: "none",
    }),
  ]);
}

function renderDatabaseIcon(
  cx: number,
  cy: number,
  stroke: string,
  sw: string,
  fill: string,
): VNode {
  // Compact cylinder.
  const w = 18;
  const h = 18;
  const cap = 4;
  const x = cx - w / 2;
  const y = cy - h / 2;
  return v("g", { "data-uml-icon": "database" }, [
    v("path", {
      d: `M ${x} ${y + cap} L ${x} ${y + h - cap} A ${w / 2} ${cap} 0 0 0 ${x + w} ${y + h - cap} L ${x + w} ${y + cap}`,
      fill,
      stroke,
      "stroke-width": sw,
    }),
    v("ellipse", {
      cx,
      cy: y + cap,
      rx: w / 2,
      ry: cap,
      fill,
      stroke,
      "stroke-width": sw,
    }),
  ]);
}

function renderQueueIcon(cx: number, cy: number, stroke: string, sw: string, fill: string): VNode {
  // Open box with a vertical end-cap: FIFO glyph.
  const w = 22;
  const h = 14;
  const x = cx - w / 2;
  const y = cy - h / 2;
  return v("g", { "data-uml-icon": "queue" }, [
    v("rect", {
      x,
      y,
      width: w,
      height: h,
      fill,
      stroke,
      "stroke-width": sw,
    }),
    v("path", {
      d: `M ${x + w - 4} ${y} L ${x + w - 4} ${y + h}`,
      stroke,
      "stroke-width": sw,
      fill: "none",
    }),
  ]);
}

function renderCollectionsIcon(
  cx: number,
  cy: number,
  stroke: string,
  sw: string,
  fill: string,
): VNode {
  // Two stacked rectangles offset diagonally — "many participants" glyph.
  const w = 14;
  const h = 12;
  const x = cx - w / 2 - 2;
  const y = cy - h / 2 - 2;
  return v("g", { "data-uml-icon": "lifeline-collections" }, [
    v("rect", {
      x: x + 4,
      y: y + 4,
      width: w,
      height: h,
      fill,
      stroke,
      "stroke-width": sw,
    }),
    v("rect", {
      x,
      y,
      width: w,
      height: h,
      fill,
      stroke,
      "stroke-width": sw,
    }),
  ]);
}

// ---------- Shaft ----------

function renderShaft(cx: number, yTop: number, yBottom: number): VNode {
  return v("line", {
    x1: cx,
    y1: yTop,
    x2: cx,
    y2: yBottom,
    stroke: "var(--uml-sequence-shaft-stroke, var(--uml-edge-stroke))",
    "stroke-dasharray": "var(--uml-sequence-shaft-dasharray, 4 4)",
    "stroke-width": "var(--uml-sequence-shaft-width, 1)",
  });
}

// ---------- Activations ----------

function renderActivations(
  diagram: Diagram,
  columns: Map<string, LifelineColumn>,
  edgeYRow: Map<string, number>,
  lastEdgeRow: number,
): VNode[] {
  const out: VNode[] = [];
  for (const node of diagram.nodes) {
    const col = columns.get(node.id);
    if (!col) continue;
    for (const interval of node.activations ?? []) {
      let yTop: number;
      let yBottom: number;

      if (interval.fromEdgeId === undefined) {
        // Standalone activation — positioned by raw layout pixels
        // relative to the start of the timeline (just below the
        // lifeline head). Defaults give a visible bar even when the
        // caller omitted the fields entirely.
        const topPx = interval.topPx ?? 0;
        const heightPx = interval.heightPx ?? ROW_HEIGHT * 3;
        yTop = HEAD_HEIGHT + TOP_PADDING + topPx;
        yBottom = yTop + heightPx;
      } else {
        const fromRow = edgeYRow.get(interval.fromEdgeId);
        if (fromRow === undefined) continue;
        const toRow = interval.toEdgeId
          ? (edgeYRow.get(interval.toEdgeId) ?? lastEdgeRow)
          : lastEdgeRow;
        yTop = yToPx(fromRow);
        yBottom = yToPx(toRow) + ROW_HEIGHT / 2;
      }

      // Visual extras (raw layout pixels). Positive `topExtraPx`
      // extends upward; positive `bottomExtraPx` extends downward.
      yTop -= interval.topExtraPx ?? 0;
      yBottom += interval.bottomExtraPx ?? 0;

      const x = col.cx - ACTIVATION_WIDTH / 2;
      const height = Math.max(yBottom - yTop, ROW_HEIGHT);

      const rect = v(
        "rect",
        {
          x,
          y: yTop,
          width: ACTIVATION_WIDTH,
          height,
          fill: "var(--uml-sequence-activation-fill, var(--uml-surface-elevated, var(--uml-node-bg)))",
          stroke:
            "var(--uml-sequence-activation-stroke, var(--uml-text-primary, var(--uml-node-border)))",
          "stroke-width": "var(--uml-sequence-activation-stroke-width, 1)",
        },
        undefined,
        { classes: ["uml-sequence-activation"], style: "cursor: move" },
      );

      // N / S resize handles centred on the top / bottom edges. Hidden
      // by CSS until the wrapping `[data-activation-id]` group is
      // selected. See `resizeActivationCommand`.
      const handleCx = col.cx;
      const handleN = makeActivationResizeHandle(handleCx, yTop, "n");
      const handleS = makeActivationResizeHandle(handleCx, yBottom, "s");

      out.push(
        v(
          "g",
          {
            "data-activation-id": interval.id,
            "data-activation-node-id": node.id,
          },
          [rect, handleN, handleS],
          { classes: ["uml-sequence-activation-group"] },
        ),
      );
    }
  }
  return out;
}

function makeActivationResizeHandle(cx: number, cy: number, side: "n" | "s"): VNode {
  const HALF = 4;
  return v(
    "rect",
    {
      x: cx - HALF,
      y: cy - HALF,
      width: HALF * 2,
      height: HALF * 2,
      fill: "var(--uml-selection-handle, var(--uml-accent))",
      stroke: "var(--uml-bg)",
      "stroke-width": "1",
      "data-activation-resize-handle": side,
    },
    undefined,
    {
      style: "cursor: ns-resize",
      classes: [
        "uml-sequence-activation-resize-handle",
        `uml-sequence-activation-resize-handle--${side}`,
      ],
    },
  );
}

// ---------- Fragments ----------

function renderFragments(
  diagram: Diagram,
  columns: Map<string, LifelineColumn>,
  plan: TimelinePlan,
): VNode[] {
  // Pre-compute geometry so we can z-order fragments by area:
  // largest first (painted at the bottom), smallest last (on top).
  // Overlapping fragments would otherwise compete for the same
  // perimeter pixels — the innermost is what users actually want to
  // click, and the larger one's hit-stroke would swallow it without
  // this sort. Mirrors `findBoundaryAtPoint`'s smallest-area-wins
  // policy for nested C4 boundaries.
  type FragmentEntry = {
    readonly fragment: CombinedFragment;
    readonly slot: { yTop: number; yBottom: number; operandSwitchRows: Map<string, number> };
    readonly xMin: number;
    readonly xMax: number;
    readonly yTop: number;
    readonly yBottom: number;
    readonly area: number;
  };
  const entries: FragmentEntry[] = [];
  for (const fragment of diagram.fragments ?? []) {
    const slot = plan.fragmentRows.get(fragment.id);
    if (!slot) continue;
    const xs = collectFragmentXs(fragment, diagram, columns);
    if (xs.length === 0) continue;
    const xMin = Math.min(...xs) - FRAGMENT_PAD_X;
    const xMax = Math.max(...xs) + FRAGMENT_PAD_X;
    // Auto-fit yTop / yBottom, then layer per-cell visual overrides
    // (stored as raw layout pixels, snapped to the grid step by the
    // N / S resize gesture). Positive `topExtraPx` extends the frame
    // above the auto-top; negative shrinks it. Same in reverse for
    // `bottomExtraPx`. Clamp side-by-side (not centred) so visible
    // changes during shrink are immediate: yTop always reflects the
    // user's top-edge gesture, yBottom is floored to keep at least
    // `minHeight` of frame body visible.
    const topExtra = fragment.topExtraPx ?? 0;
    const bottomExtra = fragment.bottomExtraPx ?? 0;
    const autoYTop = yToPx(slot.yTop) - FRAGMENT_PAD_Y;
    const autoYBottom = yToPx(slot.yBottom) + FRAGMENT_PAD_Y + ROW_HEIGHT / 2;
    const yTop = autoYTop - topExtra;
    let yBottom = autoYBottom + bottomExtra;
    const minHeight = FRAGMENT_HEADER_HEIGHT + 4;
    if (yBottom - yTop < minHeight) {
      yBottom = yTop + minHeight;
    }
    const area = (xMax - xMin) * (yBottom - yTop);
    entries.push({ fragment, slot, xMin, xMax, yTop, yBottom, area });
  }
  entries.sort((a, b) => b.area - a.area);

  const out: VNode[] = [];
  for (const entry of entries) {
    const { fragment, slot, xMin, xMax, yTop, yBottom } = entry;

    const headerLabel = fragment.operands[0]?.guard ?? fragment.label ?? "";
    const tabWidth = Math.max(40, fragment.kind.length * 8 + 12);

    const children: VNode[] = [];

    // Invisible hit-stroke duplicate — fat transparent stroke that
    // catches clicks along the entire frame perimeter. The outer
    // `<g data-fragment-id>` ancestor carries the id; `closest(...)`
    // walks up so children stay attribute-free.
    children.push(
      v(
        "rect",
        {
          x: xMin,
          y: yTop,
          width: xMax - xMin,
          height: yBottom - yTop,
          fill: "none",
          stroke: "transparent",
          "stroke-width": HIT_AREA_WIDTH,
          "pointer-events": "stroke",
        },
        undefined,
        { classes: ["uml-sequence-fragment-hit"] },
      ),
    );
    children.push(
      v(
        "rect",
        {
          x: xMin,
          y: yTop,
          width: xMax - xMin,
          height: yBottom - yTop,
          fill: "none",
          stroke: "var(--uml-sequence-fragment-stroke, var(--uml-edge-stroke))",
          "stroke-width": "1",
          "pointer-events": "none",
        },
        undefined,
        { classes: ["uml-sequence-fragment", `uml-sequence-fragment--${fragment.kind}`] },
      ),
    );
    // Title tab.
    children.push(
      v("path", {
        d: `M ${xMin} ${yTop} L ${xMin + tabWidth} ${yTop} L ${xMin + tabWidth + 6} ${yTop + FRAGMENT_HEADER_HEIGHT - 4} L ${xMin + tabWidth + 6} ${yTop + FRAGMENT_HEADER_HEIGHT} L ${xMin} ${yTop + FRAGMENT_HEADER_HEIGHT} Z`,
        fill: "var(--uml-sequence-fragment-tab-bg, var(--uml-surface-elevated, var(--uml-node-bg)))",
        stroke: "var(--uml-sequence-fragment-stroke, var(--uml-edge-stroke))",
        "stroke-width": "1",
      }),
    );
    children.push(
      v(
        "text",
        {
          x: xMin + 6,
          y: yTop + FRAGMENT_HEADER_HEIGHT - 5,
          "font-family": "var(--uml-font-sans)",
          "font-size": "var(--uml-font-size-sm)",
          "font-weight": "600",
          fill: "var(--uml-sequence-fragment-title-color, var(--uml-text-primary, var(--uml-node-text)))",
        },
        undefined,
        { text: fragment.kind, classes: ["uml-sequence-fragment-kind"] },
      ),
    );
    if (headerLabel) {
      children.push(
        v(
          "text",
          {
            x: xMin + tabWidth + 12,
            y: yTop + FRAGMENT_HEADER_HEIGHT - 5,
            "font-family": "var(--uml-font-sans)",
            "font-size": "var(--uml-font-size-sm)",
            fill: "var(--uml-sequence-fragment-title-color, var(--uml-text-primary, var(--uml-node-text)))",
          },
          undefined,
          { text: `[${headerLabel}]`, classes: ["uml-sequence-fragment-label"] },
        ),
      );
    }

    // Operand divider lines (`else …`).
    for (let i = 1; i < fragment.operands.length; i += 1) {
      const operand = fragment.operands[i];
      if (!operand) continue;
      const switchRow = slot.operandSwitchRows.get(operand.id);
      if (switchRow === undefined) continue;
      const y = yToPx(switchRow) - 2;
      children.push(
        v("line", {
          x1: xMin,
          y1: y,
          x2: xMax,
          y2: y,
          stroke: "var(--uml-sequence-fragment-stroke, var(--uml-edge-stroke))",
          "stroke-width": "1",
          "stroke-dasharray": "var(--uml-sequence-fragment-divider-dash, 4 4)",
        }),
      );
      children.push(
        v(
          "text",
          {
            x: xMin + 8,
            y: y + 14,
            "font-family": "var(--uml-font-sans)",
            "font-size": "var(--uml-font-size-sm)",
            fill: "var(--uml-sequence-fragment-title-color, var(--uml-text-primary, var(--uml-node-text)))",
          },
          undefined,
          {
            text: `[${operand.guard ?? "else"}]`,
            classes: ["uml-sequence-fragment-operand-label"],
          },
        ),
      );
    }

    // N / S / E / W resize handles centred on each edge. Hidden by
    // CSS until the wrapping `[data-fragment-id]` group is selected.
    //   - N / S grow / shrink the chronological span by adding /
    //     removing edges to / from the first or last operand.
    //   - E / W grow / shrink the horizontal coverage by extending /
    //     contracting `coveredParticipants` along the lifeline columns.
    // See `resizeSequenceFragmentCommand`.
    const handleCx = (xMin + xMax) / 2;
    const handleCy = (yTop + yBottom) / 2;
    children.push(makeFragmentResizeHandle(handleCx, yTop, "n"));
    children.push(makeFragmentResizeHandle(handleCx, yBottom, "s"));
    children.push(makeFragmentResizeHandle(xMin, handleCy, "w"));
    children.push(makeFragmentResizeHandle(xMax, handleCy, "e"));

    out.push(
      v("g", { "data-fragment-id": fragment.id, "data-fragment-kind": fragment.kind }, children, {
        classes: ["uml-sequence-fragment-group"],
      }),
    );
  }
  return out;
}

function makeFragmentResizeHandle(cx: number, cy: number, side: "n" | "s" | "e" | "w"): VNode {
  const HALF = 4;
  const cursor = side === "n" || side === "s" ? "ns-resize" : "ew-resize";
  return v(
    "rect",
    {
      x: cx - HALF,
      y: cy - HALF,
      width: HALF * 2,
      height: HALF * 2,
      fill: "var(--uml-selection-handle, var(--uml-accent))",
      stroke: "var(--uml-bg)",
      "stroke-width": "1",
      "data-fragment-resize-handle": side,
    },
    undefined,
    {
      style: `cursor: ${cursor}`,
      classes: [
        "uml-sequence-fragment-resize-handle",
        `uml-sequence-fragment-resize-handle--${side}`,
      ],
    },
  );
}

function collectFragmentXs(
  fragment: CombinedFragment,
  diagram: Diagram,
  columns: Map<string, LifelineColumn>,
): number[] {
  const xs: number[] = [];

  // Core X-set: explicit horizontal coverage takes priority (set by
  // the E / W resize gesture). Falls back to deriving the span from
  // participant lifelines of contained edges so fragments authored in
  // pure PlantUML still size themselves correctly.
  if (fragment.coveredParticipants && fragment.coveredParticipants.length > 0) {
    for (const id of fragment.coveredParticipants) {
      const col = columns.get(id);
      if (col) xs.push(col.cx);
    }
  } else {
    const edgeIds = new Set<string>();
    for (const op of fragment.operands) for (const id of op.edges) edgeIds.add(id);
    for (const edge of diagram.edges) {
      if (!edgeIds.has(edge.id)) continue;
      const sourceCol = columns.get(edge.source);
      const targetCol = columns.get(edge.target);
      if (sourceCol) xs.push(sourceCol.cx);
      if (targetCol) xs.push(targetCol.cx);
    }
  }

  // Self-call extension: the loopback arc extends `SELF_MESSAGE_OUT`
  // px to the right of its lifeline cx, past the lifeline's column.
  // If we only included `cx` for source / target, the visible frame
  // would clip the arc and the right E-resize handle would land on
  // top of the arc — making the fragment "merge" visually with the
  // self-call and the handle un-grabbable. Push the right reach of
  // every contained self-call so the frame fully contains the arc
  // and the E handle sits clear of it.
  const fragmentEdgeIds = new Set<string>();
  for (const op of fragment.operands) for (const id of op.edges) fragmentEdgeIds.add(id);
  for (const edge of diagram.edges) {
    if (!fragmentEdgeIds.has(edge.id)) continue;
    if (edge.source !== edge.target) continue;
    const col = columns.get(edge.source);
    if (col) xs.push(col.cx + SELF_MESSAGE_OUT);
  }

  return xs;
}

// ---------- Notes ----------

function renderNote(
  note: SequenceNote,
  columns: Map<string, LifelineColumn>,
  totalWidth: number,
  y: number,
): VNode {
  const cols = note.participants
    .map((id) => columns.get(id))
    .filter((c): c is LifelineColumn => Boolean(c));
  if (cols.length === 0) {
    return v("g", { "data-note-id": note.id });
  }

  const lines = note.text.split("\n");
  const textWidth = Math.max(...lines.map((l) => l.length)) * 7 + NOTE_PAD_X * 2;
  const noteHeight = lines.length * 14 + NOTE_PAD_Y * 2;
  let xLeft: number;
  let width = textWidth;
  if (note.placement === "over") {
    const xs = cols.map((c) => c.cx);
    const minX = Math.min(...xs) - 30;
    const maxX = Math.max(...xs) + 30;
    xLeft = minX;
    width = Math.max(maxX - minX, textWidth);
  } else {
    const target = cols[0];
    if (!target) {
      return v("g", { "data-note-id": note.id });
    }
    if (note.placement === "left") {
      xLeft = Math.max(0, target.x - textWidth - 12);
    } else {
      xLeft = Math.min(totalWidth - textWidth, target.x + target.width + 12);
    }
  }

  const xRight = xLeft + width;
  const yTop = y - noteHeight / 2;
  const yBottom = yTop + noteHeight;
  const fold = NOTE_FOLD;

  const noteFill = "var(--uml-sequence-note-fill, var(--uml-surface-elevated, var(--uml-node-bg)))";
  const noteStroke = "var(--uml-sequence-note-stroke, var(--uml-edge-stroke))";

  const path = v("path", {
    d: `M ${xLeft} ${yTop} L ${xRight - fold} ${yTop} L ${xRight} ${yTop + fold} L ${xRight} ${yBottom} L ${xLeft} ${yBottom} Z`,
    fill: noteFill,
    stroke: noteStroke,
    "stroke-width": "1",
  });
  const foldFill = v("path", {
    d: `M ${xRight - fold} ${yTop} L ${xRight - fold} ${yTop + fold} L ${xRight} ${yTop + fold}`,
    fill: "var(--uml-sequence-note-fold, var(--uml-surface, var(--uml-node-bg)))",
    stroke: noteStroke,
    "stroke-width": "1",
  });

  const textChildren: VNode[] = lines.map((line, i) =>
    v(
      "text",
      {
        x: xLeft + NOTE_PAD_X,
        y: yTop + NOTE_PAD_Y + 10 + i * 14,
        "font-family": "var(--uml-font-sans)",
        "font-size": "var(--uml-font-size-sm)",
        fill: "var(--uml-sequence-note-text, var(--uml-text-primary, var(--uml-node-text)))",
      },
      undefined,
      { text: line, classes: ["uml-sequence-note-line"] },
    ),
  );

  return v(
    "g",
    {
      "data-note-id": note.id,
      "data-note-placement": note.placement,
    },
    [path, foldFill, ...textChildren],
    { classes: ["uml-sequence-note"] },
  );
}

// ---------- Dividers ----------

function renderDivider(divider: SequenceDivider, totalWidth: number, y: number): VNode {
  return v(
    "g",
    {
      "data-divider-id": divider.id,
    },
    [
      v("line", {
        x1: 0,
        y1: y,
        x2: totalWidth,
        y2: y,
        stroke: "var(--uml-sequence-divider-bg, var(--uml-edge-stroke))",
        "stroke-width": "2",
      }),
      v(
        "rect",
        {
          x: totalWidth / 2 - 80,
          y: y - 10,
          width: 160,
          height: 20,
          fill: "var(--uml-sequence-divider-bg, var(--uml-surface-elevated, var(--uml-node-bg)))",
          stroke: "var(--uml-sequence-divider-bg, var(--uml-edge-stroke))",
          "stroke-width": "1",
        },
        undefined,
        { classes: ["uml-sequence-divider-bg"] },
      ),
      v(
        "text",
        {
          x: totalWidth / 2,
          y: y + 4,
          "text-anchor": "middle",
          "font-family": "var(--uml-font-sans)",
          "font-size": "var(--uml-font-size-sm)",
          "font-weight": "600",
          fill: "var(--uml-sequence-divider-text, var(--uml-text-primary, var(--uml-node-text)))",
        },
        undefined,
        { text: divider.label, classes: ["uml-sequence-divider-text"] },
      ),
    ],
    { classes: ["uml-sequence-divider"] },
  );
}

// ---------- Messages ----------

function renderMessage(
  edge: DiagramEdge,
  columns: Map<string, LifelineColumn>,
  y: number,
  labelPrefix: string,
): VNode {
  const sourceCol = columns.get(edge.source);
  const targetCol = columns.get(edge.target);
  if (!sourceCol || !targetCol) {
    return v("g", { "data-edge-id": edge.id });
  }

  const label = `${labelPrefix}${edge.label ?? ""}`.trim();
  const stroke = "var(--uml-edge-stroke)";
  const dasharray = edge.kind === "return" ? "5 3" : undefined;
  const markerEnd =
    edge.kind === "async-call" || edge.kind === "return"
      ? "url(#uml-arrow-open)"
      : "url(#uml-arrow-arrow)";

  const children: VNode[] = [];

  // Found / lost messages: one end is a filled circle "outside the
  // diagram". The AST stores source===target with a kind discriminator;
  // the renderer reinterprets here.
  if (edge.kind === "found-message" || edge.kind === "lost-message") {
    const isFound = edge.kind === "found-message";
    const offset = 60;
    const lifelineX = sourceCol.cx;
    const dotX = isFound ? lifelineX - offset : lifelineX + offset;
    const x1 = isFound ? dotX : lifelineX;
    const x2 = isFound ? lifelineX : dotX;
    children.push(makeHitLine(x1, y, x2, y));
    children.push(
      v("circle", {
        cx: dotX,
        cy: y,
        r: 5,
        fill: "var(--uml-sequence-lost-found-fill, var(--uml-text, var(--uml-node-text)))",
        stroke: "var(--uml-sequence-lost-found-fill, var(--uml-text, var(--uml-node-text)))",
        "stroke-width": "1",
      }),
    );
    children.push(
      v("line", {
        x1,
        y1: y,
        x2,
        y2: y,
        stroke,
        "stroke-width": "var(--uml-edge-stroke-width, 1)",
        "marker-end": "url(#uml-arrow-arrow)",
      }),
    );
    if (label) {
      const labelX = (x1 + x2) / 2;
      children.push(
        v(
          "text",
          {
            x: labelX,
            y: y - 4,
            "text-anchor": "middle",
            "font-family": "var(--uml-font-sans)",
            "font-size": "var(--uml-font-size-sm)",
            fill: "var(--uml-edge-label-text, var(--uml-text-primary, var(--uml-node-text)))",
          },
          undefined,
          { text: label, classes: ["uml-sequence-message-label"] },
        ),
      );
    }
    return v(
      "g",
      {
        "data-edge-id": edge.id,
        "data-edge-kind": edge.kind,
      },
      children,
      {
        classes: ["uml-edge", `uml-edge-${edge.kind}`, "uml-sequence-message"],
      },
    );
  }

  if (sourceCol.node.id === targetCol.node.id) {
    // Self-message: small loopback arrow.
    const cx = sourceCol.cx;
    const selfPath = `M ${cx} ${y} h ${SELF_MESSAGE_OUT} v ${SELF_MESSAGE_DROP} h ${-SELF_MESSAGE_OUT}`;
    children.push(makeHitPath(selfPath));
    children.push(
      v("path", {
        d: selfPath,
        fill: "none",
        stroke,
        "stroke-width": "var(--uml-edge-stroke-width, 1)",
        "stroke-dasharray": dasharray,
        "marker-end": markerEnd,
      }),
    );
    if (label) {
      children.push(
        v(
          "text",
          {
            x: cx + SELF_MESSAGE_OUT + 6,
            y: y + SELF_MESSAGE_DROP / 2 + 3,
            "font-family": "var(--uml-font-sans)",
            "font-size": "var(--uml-font-size-sm)",
            fill: "var(--uml-edge-label-text, var(--uml-text-primary, var(--uml-node-text)))",
          },
          undefined,
          { text: label, classes: ["uml-sequence-message-label"] },
        ),
      );
    }
  } else {
    const x1 =
      sourceCol.cx + (targetCol.cx > sourceCol.cx ? ACTIVATION_WIDTH / 2 : -ACTIVATION_WIDTH / 2);
    const x2 =
      targetCol.cx + (sourceCol.cx > targetCol.cx ? ACTIVATION_WIDTH / 2 : -ACTIVATION_WIDTH / 2);
    children.push(makeHitLine(x1, y, x2, y));
    children.push(
      v("line", {
        x1,
        y1: y,
        x2,
        y2: y,
        stroke,
        "stroke-width": "var(--uml-edge-stroke-width, 1)",
        "stroke-dasharray": dasharray,
        "marker-end": markerEnd,
      }),
    );
    if (label) {
      const labelX = (x1 + x2) / 2;
      children.push(
        v(
          "text",
          {
            x: labelX,
            y: y - 4,
            "text-anchor": "middle",
            "font-family": "var(--uml-font-sans)",
            "font-size": "var(--uml-font-size-sm)",
            fill: "var(--uml-edge-label-text, var(--uml-text-primary, var(--uml-node-text)))",
          },
          undefined,
          { text: label, classes: ["uml-sequence-message-label"] },
        ),
      );
    }
  }

  return v(
    "g",
    {
      "data-edge-id": edge.id,
      "data-edge-kind": edge.kind,
    },
    children,
    {
      classes: ["uml-edge", `uml-edge-${edge.kind}`, "uml-sequence-message"],
    },
  );
}

// ---------- Hit-area helpers ----------

// Width of the invisible duplicate that catches pointer events for thin
// SVG primitives. SVG `<line>` / thin-stroke `<path>` only register
// clicks on the actual stroke pixels, which is brutal at 1 px. Drawio
// uses a comparable invisible "hit overlay" (~14 px) — we adopt the
// same idiom so message arrows, self-message arcs, and fragment frames
// are easy to grab on a trackpad.
const HIT_AREA_WIDTH = 14;

function makeHitLine(x1: number, y1: number, x2: number, y2: number): VNode {
  return v("line", {
    x1,
    y1,
    x2,
    y2,
    stroke: "transparent",
    "stroke-width": HIT_AREA_WIDTH,
    "stroke-linecap": "round",
    "pointer-events": "stroke",
    fill: "none",
  });
}

function makeHitPath(d: string): VNode {
  return v("path", {
    d,
    fill: "none",
    stroke: "transparent",
    "stroke-width": HIT_AREA_WIDTH,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "pointer-events": "stroke",
  });
}

// ---------- Auto-numbering ----------

function formatAutoNumber(value: number, format: string | undefined): string {
  if (!format) return String(value);
  // PlantUML supports `%d` and `%02d`-style format strings; we do a small
  // subset: `%[0-9]*d` → padded number; raw HTML/text passes through.
  return format.replace(/%(0?\d*)d/gu, (_match, padding) => {
    const width = padding ? Number.parseInt(padding, 10) : 0;
    const str = String(value);
    return str.padStart(Math.max(width, str.length), "0");
  });
}

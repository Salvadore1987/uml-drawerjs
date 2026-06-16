import type { Attribute, DiagramNode, NodeKind, Operation } from "../model/types.js";
import { v } from "./types.js";
import type { NodeGeometry, VNode } from "./types.js";

/**
 * Per-kind node renderer. Each `NodeKind` becomes an `<g>` group containing
 * a frame, a label band, an optional stereotype badge, optional C4
 * technology subtitle and description, and (for class / entity)
 * attribute rows. Coordinates and class names are the only theme-touching
 * surface — every visual property is read from the `--uml-*` contract via
 * inline `style="… var(--uml-…)"` declarations, never from hex literals.
 */
export interface RenderNodeArgs {
  readonly node: DiagramNode;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const ATTRIBUTE_ROW_HEIGHT = 20;
const HEADER_HEIGHT = 36;
const TYPE_TAG_ROW_HEIGHT = 16;
const DESCRIPTION_ROW_HEIGHT = 16;
const DATABASE_CAP_HEIGHT = 14;
const QUEUE_END_INSET = 10;
const PERSON_ICON_HEIGHT = 18;

// Description text wrapping. SVG `<text>` does not wrap, so the description
// is broken into lines that fit the node's content width and each line is
// emitted as its own `<text>` row (the same idiom sequence notes use). The
// node then grows in height to fit every line.
const DESC_PAD_X = 10; // horizontal inset inside the node frame
const DESC_CHAR_WIDTH = 6; // avg glyph width estimate for font-size-sm italic
const DESC_MAX_LINES = 5; // safety cap so a long description can't grow forever

// Average glyph-width estimates (px) used to grow compartment nodes
// (class / interface / abstract-class / enum / entity) so their name and
// member rows never spill past the frame — the same estimation idiom as
// DESC_CHAR_WIDTH, padded generously because real glyph widths vary by font.
const NAME_CHAR_WIDTH = 8.5; // font-size-base (14px), bold sans header label
const ROW_CHAR_WIDTH = 7.2; // font-size-sm (12px) mono attribute / operation rows
const STEREOTYPE_CHAR_WIDTH = 6.5; // font-size-sm (12px) sans stereotype line
const COMPARTMENT_PAD_X = 24; // total horizontal padding (left + right) inside the frame
const STEREOTYPE_ROW_HEIGHT = 16; // extra header height when a stereotype row is shown

// Kind "spot" — the PlantUML/IntelliJ circled letter (C / I / A / E) drawn in
// the top-left of a class-like node's header so the element kind is obvious at
// a glance, independent of the (centered) stereotype/title text.
const SPOT_R = 9; // circle radius
const SPOT_CX = 16; // circle center x from the frame's left edge
const SPOT_RESERVE = 52; // width reserved so a centered title clears the left spot

const C4_KINDS = new Set<NodeKind>([
  "person",
  "person-external",
  "system",
  "system-external",
  "container",
  "container-external",
  "component",
  "component-external",
  "database",
  "database-external",
  "queue",
]);

/**
 * Compute final geometry for a node, factoring in attribute / operation
 * rows that grow the box. The renderer always commits to this geometry
 * before drawing edges so port snapping uses the same rectangle.
 *
 * For classic-UML class kinds, an empty class still reserves two thin
 * compartments (attributes + operations) so the resulting shape is
 * unmistakably *a class*, not just a labelled rectangle. Enum reserves
 * only one literals compartment.
 */
export function computeNodeGeometry(args: RenderNodeArgs): NodeGeometry {
  const { node, x, y, height } = args;
  const rowHeights = isClassLike(node.kind)
    ? classRowHeights(node)
    : node.kind === "entity"
      ? entityRowHeights(node)
      : 0;
  // Compartment nodes (class / interface / abstract-class / enum / entity)
  // grow to fit their widest text line so the name and member rows never
  // spill past the frame; their header also grows to fit a stereotype row.
  // C4 nodes keep the caller's width (they wrap descriptions instead).
  const width = Math.max(args.width, compartmentContentWidth(node));
  const headerH = isCompartmentNode(node.kind) ? compartmentHeaderHeight(node) : HEADER_HEIGHT;
  const c4Padding = c4ExtraHeight(node, width);
  const finalHeight = Math.max(height, headerH + rowHeights + c4Padding);
  return { id: node.id, x, y, width, height: finalHeight };
}

const EMPTY_COMPARTMENT_HEIGHT = 14;

function classRowHeights(node: DiagramNode): number {
  const literalCount = node.enumLiterals?.length ?? 0;
  const attrCount = node.attributes?.length ?? 0;
  const opCount = node.operations?.length ?? 0;
  if (node.kind === "enum") {
    return Math.max(literalCount, 1) * ATTRIBUTE_ROW_HEIGHT;
  }
  // Class / interface / abstract-class: always show two compartments
  // (attributes + operations). When a side is empty, reserve a slim filler
  // strip so the divider lines are visible.
  const attrSpan = attrCount > 0 ? attrCount * ATTRIBUTE_ROW_HEIGHT : EMPTY_COMPARTMENT_HEIGHT;
  const opSpan = opCount > 0 ? opCount * ATTRIBUTE_ROW_HEIGHT : EMPTY_COMPARTMENT_HEIGHT;
  return attrSpan + opSpan;
}

function isClassLike(kind: NodeKind): boolean {
  return kind === "class" || kind === "interface" || kind === "abstract-class" || kind === "enum";
}

function isCompartmentNode(kind: NodeKind): boolean {
  return isClassLike(kind) || kind === "entity";
}

function entityRowHeights(node: DiagramNode): number {
  const attrCount = node.attributes?.length ?? 0;
  return attrCount > 0 ? attrCount * ATTRIBUTE_ROW_HEIGHT : EMPTY_COMPARTMENT_HEIGHT;
}

function c4ExtraHeight(node: DiagramNode, width: number): number {
  if (!C4_KINDS.has(node.kind)) return 0;
  let extra = 0;
  if (node.kind === "database" || node.kind === "database-external") extra += DATABASE_CAP_HEIGHT;
  if (node.kind === "person" || node.kind === "person-external") extra += PERSON_ICON_HEIGHT;
  // c4model.com requires every element to carry a type tag like
  // "[Software System]" / "[Person]" — we render it on a dedicated row
  // for every C4 kind, regardless of whether `technology` is set.
  extra += TYPE_TAG_ROW_HEIGHT;
  // Description wraps onto as many rows as needed to fit the node width.
  if (node.description) {
    extra += descriptionLines(node.description, width).length * DESCRIPTION_ROW_HEIGHT;
  }
  return extra;
}

export function renderNode(args: RenderNodeArgs): VNode {
  const geometry = computeNodeGeometry(args);
  const { node } = args;
  const children: VNode[] = [];
  // Header band / dividers / member rows all anchor to this height so a
  // stereotyped node's taller header pushes the body down in lockstep.
  const headerH = compartmentHeaderHeight(node);

  children.push(renderFrame(node, geometry));
  if (isCompartmentNode(node.kind)) {
    children.push(renderClassHeaderBand(geometry, headerH));
  }
  children.push(...renderHeaderRows(node, geometry));
  if (isClassLike(node.kind)) {
    children.push(renderKindSpot(node, headerH));
    const literalCount = node.enumLiterals?.length ?? 0;
    const attrCount = node.attributes?.length ?? 0;
    const opCount = node.operations?.length ?? 0;
    if (literalCount > 0) {
      children.push(...renderEnumLiteralRows(node.enumLiterals ?? [], geometry, headerH));
    }
    if (attrCount > 0) {
      children.push(
        ...renderAttributeRows(
          node.attributes ?? [],
          geometry,
          node.kind,
          literalCount * ATTRIBUTE_ROW_HEIGHT,
          headerH,
        ),
      );
    }
    if (opCount > 0) {
      const opOffset =
        literalCount * ATTRIBUTE_ROW_HEIGHT +
        (attrCount > 0 ? attrCount * ATTRIBUTE_ROW_HEIGHT : EMPTY_COMPARTMENT_HEIGHT);
      children.push(...renderOperationRows(node.operations ?? [], geometry, opOffset, headerH));
    }
    children.push(
      ...renderClassCompartmentDividers(
        geometry,
        node.kind,
        literalCount,
        attrCount,
        opCount,
        headerH,
      ),
    );
  } else if (node.kind === "entity") {
    // Entity: single attributes compartment under the header. UML/IE
    // notation — PK underlined, FK with `+ ` prefix, NN (required) bold.
    children.push(compartmentDivider(geometry, headerH));
    children.push(...renderEntityAttributeRows(node.attributes ?? [], geometry, headerH));
  }

  // Port handles — four small circles at edge midpoints. Hidden by
  // default via CSS (`opacity: 0`); become visible on `:hover` and
  // when the node carries `data-selected="true"`. Pointerdown on a
  // handle is the primary affordance for creating edges between
  // nodes; the handle's `data-port-handle` attribute lets the
  // interactions module detect connect intent without relying on
  // distance-from-border heuristics.
  children.push(...renderPortHandles(geometry));

  // Resize handles — eight small squares (NW/N/NE/E/SE/S/SW/W) shown
  // only when the node is the sole element in the selection. Cursor
  // and `data-resize-handle` attribute let `interactions.ts` enter
  // resize mode without distance heuristics.
  children.push(...renderResizeHandles(geometry));

  return v(
    "g",
    {
      "data-node-id": node.id,
      "data-node-kind": node.kind,
      transform: `translate(${geometry.x}, ${geometry.y})`,
      tabindex: 0,
    },
    children,
    {
      classes: ["uml-node", `uml-node-${node.kind}`],
      aria: {
        role: "group",
        "aria-label": ariaLabelFor(node),
      },
    },
  );
}

function renderFrame(node: DiagramNode, geom: NodeGeometry): VNode {
  switch (node.kind) {
    case "person":
      return renderPersonFrame(geom, "person");
    case "person-external":
      return renderPersonFrame(geom, "external");
    case "system":
      return renderC4Rect(geom, "system");
    case "system-external":
      return renderC4Rect(geom, "external", { dashed: true });
    case "container":
      return renderC4Rect(geom, "container");
    case "container-external":
      return renderC4Rect(geom, "external", { dashed: true });
    case "component":
      return renderC4Rect(geom, "component");
    case "component-external":
      return renderC4Rect(geom, "external", { dashed: true });
    case "database":
      return renderDatabaseFrame(geom);
    case "database-external":
      return renderDatabaseFrame(geom, { external: true });
    case "queue":
      return renderQueueFrame(geom);
    case "actor":
      return v("rect", {
        x: 0,
        y: 0,
        width: geom.width,
        height: geom.height,
        rx: geom.width / 2,
        ry: geom.width / 2,
        fill: "var(--uml-node-bg)",
        stroke: "var(--uml-node-border)",
        "stroke-width": "1.5",
      });
    default: {
      // Compartment nodes (class / interface / abstract-class / enum / entity)
      // follow classic UML notation: sharp corners, no rounding. Other
      // fallbacks keep the soft 8px radius that C4 boxes use.
      const sharp = isCompartmentNode(node.kind);
      return v("rect", {
        x: 0,
        y: 0,
        width: geom.width,
        height: geom.height,
        rx: sharp ? 0 : 8,
        ry: sharp ? 0 : 8,
        fill: "var(--uml-node-bg)",
        stroke: "var(--uml-node-border)",
        "stroke-width": "1.5",
      });
    }
  }
}

/**
 * Eight resize handles arranged at the corners and side midpoints of
 * the node rectangle. Hidden by CSS unless the node is the only element
 * in the selection — when several nodes are selected, group-resize is
 * intentionally not offered, so showing handles would be misleading.
 *
 * Coordinate system mirrors `renderPortHandles`: the handles live in
 * the node's local space (origin at top-left of the frame), so the
 * outer `<g transform="translate(x,y)">` positions them correctly.
 */
export function renderResizeHandles(geom: NodeGeometry): VNode[] {
  type Side = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
  const positions: ReadonlyArray<{
    side: Side;
    x: number;
    y: number;
    cursor: string;
  }> = [
    { side: "nw", x: 0, y: 0, cursor: "nwse-resize" },
    { side: "n", x: geom.width / 2, y: 0, cursor: "ns-resize" },
    { side: "ne", x: geom.width, y: 0, cursor: "nesw-resize" },
    { side: "e", x: geom.width, y: geom.height / 2, cursor: "ew-resize" },
    { side: "se", x: geom.width, y: geom.height, cursor: "nwse-resize" },
    { side: "s", x: geom.width / 2, y: geom.height, cursor: "ns-resize" },
    { side: "sw", x: 0, y: geom.height, cursor: "nesw-resize" },
    { side: "w", x: 0, y: geom.height / 2, cursor: "ew-resize" },
  ];
  // Each handle is two rects: a large transparent HIT target (easy to grab,
  // carries `data-resize-handle` + cursor) and a small visible DOT affordance.
  // The big invisible grab zone makes resizing forgiving without bloating the
  // visible handle. The dot has `pointer-events:none` so it never steals the
  // grab from the hit rect rendered before it.
  const HIT_HALF = 11;
  const DOT_HALF = 5;
  // Keep handles INSIDE the node bounds (they grow inward from each edge/corner)
  // so the selection markers never stick out past the frame.
  return positions.flatMap((p) => {
    const hx = clampHandleSpan(p.x, HIT_HALF, 0, geom.width);
    const hy = clampHandleSpan(p.y, HIT_HALF, 0, geom.height);
    const dx = clampHandleSpan(p.x, DOT_HALF, 0, geom.width);
    const dy = clampHandleSpan(p.y, DOT_HALF, 0, geom.height);
    return [
      v(
        "rect",
        {
          x: hx.start,
          y: hy.start,
          width: hx.size,
          height: hy.size,
          fill: "transparent",
          "data-resize-handle": p.side,
        },
        undefined,
        {
          style: `cursor: ${p.cursor}`,
          classes: ["uml-node-resize-handle", `uml-node-resize-handle--${p.side}`],
        },
      ),
      v(
        "rect",
        {
          x: dx.start,
          y: dy.start,
          width: dx.size,
          height: dy.size,
          fill: "var(--uml-selection-handle, var(--uml-accent))",
          stroke: "var(--uml-bg)",
          "stroke-width": "1",
        },
        undefined,
        {
          classes: ["uml-node-resize-dot", `uml-node-resize-dot--${p.side}`],
        },
      ),
    ];
  });
}

/**
 * Place a resize handle of half-size `half` centered at `center` but clamped so
 * the whole handle stays within `[min, max]` — handles at an edge/corner grow
 * inward instead of overhanging the element. Returns the rect's start + size.
 */
export function clampHandleSpan(
  center: number,
  half: number,
  min: number,
  max: number,
): { start: number; size: number } {
  const size = Math.min(half * 2, max - min);
  let start = center - half;
  if (start < min) start = min;
  if (start + size > max) start = max - size;
  return { start, size };
}

/**
 * Four small port handles at edge midpoints (N / E / S / W) used for
 * starting edge-creation drags. Hidden by default — CSS reveals them on
 * `:hover` of the node group and when `data-selected="true"`.
 */
export function renderPortHandles(geom: NodeGeometry): VNode[] {
  const positions: ReadonlyArray<{ side: "n" | "e" | "s" | "w"; x: number; y: number }> = [
    { side: "n", x: geom.width / 2, y: 0 },
    { side: "e", x: geom.width, y: geom.height / 2 },
    { side: "s", x: geom.width / 2, y: geom.height },
    { side: "w", x: 0, y: geom.height / 2 },
  ];
  return positions.map((p) =>
    v(
      "circle",
      {
        cx: p.x,
        cy: p.y,
        r: 5,
        fill: "var(--uml-accent)",
        stroke: "var(--uml-bg)",
        "stroke-width": "1.5",
        "data-port-handle": p.side,
      },
      undefined,
      { classes: ["uml-node-port", `uml-node-port--${p.side}`] },
    ),
  );
}

function renderC4Rect(
  geom: NodeGeometry,
  variant: "system" | "external" | "container" | "component",
  opts: { dashed?: boolean } = {},
): VNode {
  const fill = `var(--uml-c4-${variant}-bg, var(--uml-node-bg))`;
  const stroke = `var(--uml-c4-${variant}-border, var(--uml-node-border))`;
  const attrs: Record<string, string | number | boolean | undefined> = {
    x: 0,
    y: 0,
    width: geom.width,
    height: geom.height,
    rx: 8,
    ry: 8,
    fill,
    stroke,
    "stroke-width": "1.5",
  };
  if (opts.dashed) attrs["stroke-dasharray"] = "6 4";
  return v("rect", attrs);
}

function renderPersonFrame(geom: NodeGeometry, variant: "person" | "external"): VNode {
  // Rounded rect frame plus a small stick-figure icon centred at the top
  // so the C4 affordance reads even when label text is short. The
  // `external` variant reuses the same frame shape but pulls the
  // shared `--uml-c4-external-*` palette so external persons read
  // identically to external systems (c4model treats internal/external
  // as styling, not a separate element type).
  const cx = geom.width / 2;
  const iconTop = 10;
  const headRadius = 5;
  const textVar =
    variant === "external"
      ? "var(--uml-c4-external-text, var(--uml-node-text))"
      : "var(--uml-c4-person-text, var(--uml-node-text))";
  const bgVar =
    variant === "external"
      ? "var(--uml-c4-external-bg, var(--uml-node-bg))"
      : "var(--uml-c4-person-bg, var(--uml-node-bg))";
  const borderVar =
    variant === "external"
      ? "var(--uml-c4-external-border, var(--uml-node-border))"
      : "var(--uml-c4-person-border, var(--uml-node-border))";
  const head = v("circle", {
    cx,
    cy: iconTop,
    r: headRadius,
    fill: textVar,
  });
  const body = v("path", {
    d: `M ${cx} ${iconTop + headRadius} L ${cx} ${iconTop + headRadius + 8} M ${cx - 6} ${iconTop + headRadius + 4} L ${cx + 6} ${iconTop + headRadius + 4} M ${cx} ${iconTop + headRadius + 8} L ${cx - 4} ${iconTop + headRadius + 14} M ${cx} ${iconTop + headRadius + 8} L ${cx + 4} ${iconTop + headRadius + 14}`,
    stroke: textVar,
    "stroke-width": "1.5",
    fill: "none",
    "stroke-linecap": "round",
  });
  const frame = v("rect", {
    x: 0,
    y: 0,
    width: geom.width,
    height: geom.height,
    rx: 8,
    ry: 8,
    fill: bgVar,
    stroke: borderVar,
    "stroke-width": "1.5",
  });
  // Keep `data-uml-frame="person"` for the default variant so existing
  // selectors / tests aren't disturbed; switch to `person-external`
  // only when the actor is external.
  const frameTag = variant === "external" ? "person-external" : "person";
  return v("g", { "data-uml-frame": frameTag }, [frame, head, body]);
}

/**
 * Queue / FIFO frame: rounded rectangle with two short vertical end-caps
 * inset from the left and right edges. Reuses the `database` palette
 * tokens because queues and databases occupy the same data-storage slot
 * in C4 and we deliberately don't expand the theming contract for a
 * single new element. A skin author can still re-target Queue colours
 * by overriding `--uml-c4-database-*` for `[data-node-kind="queue"]`.
 */
function renderQueueFrame(geom: NodeGeometry): VNode {
  const w = geom.width;
  const h = geom.height;
  const fill = "var(--uml-c4-database-bg, var(--uml-node-bg))";
  const stroke = "var(--uml-c4-database-border, var(--uml-node-border))";
  const frame = v("rect", {
    x: 0,
    y: 0,
    width: w,
    height: h,
    rx: 8,
    ry: 8,
    fill,
    stroke,
    "stroke-width": "1.5",
  });
  const leftCap = v("path", {
    d: `M ${QUEUE_END_INSET} 6 L ${QUEUE_END_INSET} ${h - 6}`,
    stroke,
    "stroke-width": "1.5",
    fill: "none",
  });
  const rightCap = v("path", {
    d: `M ${w - QUEUE_END_INSET} 6 L ${w - QUEUE_END_INSET} ${h - 6}`,
    stroke,
    "stroke-width": "1.5",
    fill: "none",
  });
  return v("g", { "data-uml-frame": "queue" }, [frame, leftCap, rightCap]);
}

function renderDatabaseFrame(geom: NodeGeometry, opts: { external?: boolean } = {}): VNode {
  // Cylinder: top ellipse + side body + bottom curve. Using a single
  // <path> for the body keeps the SVG compact and theme-friendly. The
  // `external` variant pulls the shared `--uml-c4-external-*` palette and
  // a dashed stroke so an external database reads identically to the other
  // external C4 elements (grey + dashed), matching c4model styling.
  const w = geom.width;
  const h = geom.height;
  const cap = DATABASE_CAP_HEIGHT;
  const fill = opts.external
    ? "var(--uml-c4-external-bg, var(--uml-node-bg))"
    : "var(--uml-c4-database-bg, var(--uml-node-bg))";
  const stroke = opts.external
    ? "var(--uml-c4-external-border, var(--uml-node-border))"
    : "var(--uml-c4-database-border, var(--uml-node-border))";
  const dash = opts.external ? { "stroke-dasharray": "6 4" } : {};
  const body = v("path", {
    d: `M 0 ${cap / 2} L 0 ${h - cap / 2} A ${w / 2} ${cap / 2} 0 0 0 ${w} ${h - cap / 2} L ${w} ${cap / 2}`,
    fill,
    stroke,
    "stroke-width": "1.5",
    ...dash,
  });
  const top = v("ellipse", {
    cx: w / 2,
    cy: cap / 2,
    rx: w / 2,
    ry: cap / 2,
    fill,
    stroke,
    "stroke-width": "1.5",
    ...dash,
  });
  const frameTag = opts.external ? "database-external" : "database";
  return v("g", { "data-uml-frame": frameTag }, [body, top]);
}

interface HeaderLayout {
  /** First text-row baseline (after any frame cap such as the cylinder top). */
  topOffset: number;
  /** Per-row line height. */
  lineHeight: number;
}

function headerLayoutFor(node: DiagramNode): HeaderLayout {
  if (node.kind === "database" || node.kind === "database-external") {
    return { topOffset: DATABASE_CAP_HEIGHT + 14, lineHeight: 16 };
  }
  if (node.kind === "person" || node.kind === "person-external") {
    return { topOffset: PERSON_ICON_HEIGHT + 14, lineHeight: 16 };
  }
  return { topOffset: 14, lineHeight: 16 };
}

function renderHeaderRows(node: DiagramNode, geom: NodeGeometry): VNode[] {
  const rows: VNode[] = [];
  const layout = headerLayoutFor(node);
  let y = layout.topOffset;

  // Class diagrams: when no explicit stereotype is set on `interface` /
  // `abstract-class` / `enum`, synthesise the canonical UML one. Authors who
  // set a custom stereotype keep their value.
  const stereotype = node.stereotype ?? syntheticStereotype(node.kind);
  if (stereotype) {
    rows.push(
      v(
        "text",
        {
          x: geom.width / 2,
          y,
          "text-anchor": "middle",
          "font-family": "var(--uml-font-sans)",
          "font-size": "var(--uml-font-size-sm)",
          fill: "var(--uml-class-stereotype-color, var(--uml-node-stereotype))",
        },
        undefined,
        { text: `«${stereotype}»`, classes: ["uml-node-stereotype"] },
      ),
    );
    y += layout.lineHeight;
  }

  const labelText = appendGenerics(node.label, node.generics);
  // Italic the class label for interface / abstract-class to match UML
  // convention (abstract class names are typeset in italics). Class kinds
  // also get a bold weight so the type name stands out from the body — the
  // textbook UML look on c4model.com/diagrams/code.
  const labelItalic = node.kind === "interface" || node.kind === "abstract-class";
  const isClassKind = isCompartmentNode(node.kind);
  rows.push(
    v(
      "text",
      {
        x: geom.width / 2,
        y: y + 8,
        "text-anchor": "middle",
        "font-family": "var(--uml-font-sans)",
        "font-size": "var(--uml-font-size-base)",
        ...(isClassKind ? { "font-weight": "600" } : {}),
        ...(labelItalic ? { "font-style": "var(--uml-class-abstract-style, italic)" } : {}),
        fill: isClassKind
          ? "var(--uml-class-header-text, var(--uml-node-text))"
          : c4TextColor(node.kind),
      },
      undefined,
      { text: labelText, classes: ["uml-node-label"] },
    ),
  );
  y += layout.lineHeight + 4;

  if (C4_KINDS.has(node.kind)) {
    // c4model.com requires every element to display its type tag.
    // Format: "[Person]", "[Software System]", "[Container: Spring Boot]"
    // — the bracket-and-colon convention matches C4-PlantUML's default.
    const tag = formatTypeTag(node);
    rows.push(
      v(
        "text",
        {
          x: geom.width / 2,
          y,
          "text-anchor": "middle",
          "font-family": "var(--uml-font-sans)",
          "font-size": "var(--uml-font-size-sm)",
          fill: "var(--uml-c4-tech-text, var(--uml-text-muted))",
        },
        undefined,
        { text: tag, classes: ["uml-node-type-tag"] },
      ),
    );
    y += TYPE_TAG_ROW_HEIGHT;
  }

  if (node.description && C4_KINDS.has(node.kind)) {
    // Wrap the description across the node width — one `<text>` per line so
    // long copy stays inside the frame instead of overflowing or being
    // hard-truncated. `descriptionLines` is the same source of truth the
    // geometry uses, so the box height always matches the rendered rows.
    const lines = descriptionLines(node.description, geom.width);
    lines.forEach((line, index) => {
      rows.push(
        v(
          "text",
          {
            x: geom.width / 2,
            y: y + index * DESCRIPTION_ROW_HEIGHT,
            "text-anchor": "middle",
            "font-family": "var(--uml-font-sans)",
            "font-size": "var(--uml-font-size-sm)",
            "font-style": "italic",
            fill: "var(--uml-text-muted)",
          },
          undefined,
          { text: line, classes: ["uml-node-description"] },
        ),
      );
    });
  }

  return rows;
}

function c4TextColor(kind: NodeKind): string {
  if (kind === "person") return "var(--uml-c4-person-text, var(--uml-node-text))";
  if (kind === "person-external") return "var(--uml-c4-external-text, var(--uml-node-text))";
  if (kind === "system") return "var(--uml-c4-system-text, var(--uml-node-text))";
  if (kind === "system-external") return "var(--uml-c4-external-text, var(--uml-node-text))";
  if (kind === "container") return "var(--uml-c4-container-text, var(--uml-node-text))";
  if (kind === "container-external") return "var(--uml-c4-external-text, var(--uml-node-text))";
  if (kind === "component") return "var(--uml-c4-component-text, var(--uml-node-text))";
  if (kind === "component-external") return "var(--uml-c4-external-text, var(--uml-node-text))";
  if (kind === "database") return "var(--uml-c4-database-text, var(--uml-node-text))";
  if (kind === "database-external") return "var(--uml-c4-external-text, var(--uml-node-text))";
  if (kind === "queue") return "var(--uml-c4-database-text, var(--uml-node-text))";
  return "var(--uml-node-text)";
}

/**
 * c4model type-tag — the "[Software System]" / "[Person]" line under
 * the element name. Format follows C4-PlantUML default rendering:
 * "[Type]" without technology, "[Type: technology]" with one. Names
 * use the official c4model spellings, not internal kind ids.
 */
function formatTypeTag(node: DiagramNode): string {
  const labelByKind: Record<string, string> = {
    person: "Person",
    "person-external": "Person",
    system: "Software System",
    "system-external": "Software System",
    container: "Container",
    "container-external": "Container",
    component: "Component",
    "component-external": "Component",
    database: "Database",
    "database-external": "Database",
    queue: "Queue",
  };
  const prefix = labelByKind[node.kind] ?? "Element";
  if (node.technology && node.technology.length > 0) {
    return `[${prefix}: ${node.technology}]`;
  }
  return `[${prefix}]`;
}

/**
 * Greedy word-wrap into lines no wider than `maxCharsPerLine`. A single
 * word longer than the budget is hard-split so it can never overflow the
 * frame. When the wrapped text exceeds `maxLines`, the last kept line is
 * truncated with an ellipsis so the node can't grow without bound.
 */
function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const budget = Math.max(1, Math.floor(maxCharsPerLine));
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  const pushWord = (word: string): void => {
    let remainder = word;
    // Hard-split words that are wider than a full line.
    while (remainder.length > budget) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(remainder.slice(0, budget));
      remainder = remainder.slice(budget);
    }
    if (!remainder) return;
    if (!current) {
      current = remainder;
    } else if (current.length + 1 + remainder.length <= budget) {
      current = `${current} ${remainder}`;
    } else {
      lines.push(current);
      current = remainder;
    }
  };

  for (const word of words) pushWord(word);
  if (current) lines.push(current);
  if (lines.length === 0) return [""];

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1] ?? "";
    kept[maxLines - 1] =
      last.length >= budget ? `${last.slice(0, Math.max(0, budget - 1)).trimEnd()}…` : `${last}…`;
    return kept;
  }
  return lines;
}

/**
 * Wrap a node description to the node's content width. Shared by the
 * geometry pass (to grow the box) and the render pass (to draw rows) so the
 * two never disagree on line count.
 */
function descriptionLines(text: string, width: number): string[] {
  const budget = Math.max(1, Math.floor((width - DESC_PAD_X * 2) / DESC_CHAR_WIDTH));
  return wrapText(text, budget, DESC_MAX_LINES);
}

function renderAttributeRows(
  attributes: readonly Attribute[],
  _geom: NodeGeometry,
  kind: NodeKind,
  baseOffset: number,
  headerHeight: number,
): VNode[] {
  return attributes.map((attribute, index) =>
    v(
      "text",
      {
        x: 12,
        y: headerHeight + baseOffset + ATTRIBUTE_ROW_HEIGHT * (index + 1) - 6,
        "font-family": "var(--uml-font-mono)",
        "font-size": "var(--uml-font-size-sm)",
        fill: "var(--uml-node-text)",
        ...(attribute.static
          ? { "text-decoration": "var(--uml-class-static-decoration, underline)" }
          : {}),
      },
      undefined,
      {
        text: formatAttribute(attribute, kind),
        classes: ["uml-node-attribute"],
      },
    ),
  );
}

function renderOperationRows(
  operations: readonly Operation[],
  _geom: NodeGeometry,
  baseOffset: number,
  headerHeight: number,
): VNode[] {
  return operations.map((operation, index) =>
    v(
      "text",
      {
        x: 12,
        y: headerHeight + baseOffset + ATTRIBUTE_ROW_HEIGHT * (index + 1) - 6,
        "font-family": "var(--uml-font-mono)",
        "font-size": "var(--uml-font-size-sm)",
        fill: "var(--uml-node-text)",
        ...(operation.abstract ? { "font-style": "var(--uml-class-abstract-style, italic)" } : {}),
        ...(operation.static
          ? { "text-decoration": "var(--uml-class-static-decoration, underline)" }
          : {}),
      },
      undefined,
      {
        text: formatOperation(operation),
        classes: ["uml-node-operation"],
      },
    ),
  );
}

/**
 * Render entity attribute rows with UML/IE notation:
 *   - Primary key  → name underlined.
 *   - Foreign key  → `+ ` prefix before the name.
 *   - Required (nullable === false, including PK) → name in bold weight.
 *   - Type segment after `: ` is always plain (no underline / no bold).
 *
 * Uses `<tspan>` children so the styling can be applied selectively to the
 * name segment without leaking into the type segment.
 */
function renderEntityAttributeRows(
  attributes: readonly Attribute[],
  _geom: NodeGeometry,
  headerHeight: number,
): VNode[] {
  return attributes.map((attribute, index) => {
    const tspans: VNode[] = [];

    // FK marker — only when not also PK (PK already conveys identity; the
    // `+` would just clutter the row). Authors who set both flags lose the
    // `+` in the canvas but keep both flags in the AST.
    const showFkPrefix = attribute.foreignKey === true && attribute.primaryKey !== true;
    if (showFkPrefix) {
      tspans.push(v("tspan", undefined, undefined, { text: "+ " }));
    }

    const required = attribute.nullable === false || attribute.primaryKey === true;
    const nameAttrs: Record<string, string | number | boolean | undefined> = {};
    if (attribute.primaryKey) {
      nameAttrs["text-decoration"] = "var(--uml-entity-pk-decoration, underline)";
    }
    if (required) {
      nameAttrs["font-weight"] = "var(--uml-entity-required-weight, 600)";
    }
    tspans.push(v("tspan", nameAttrs, undefined, { text: attribute.name }));

    if (attribute.type) {
      tspans.push(v("tspan", undefined, undefined, { text: `: ${attribute.type}` }));
    }
    if (attribute.default !== undefined && attribute.default !== "") {
      tspans.push(v("tspan", undefined, undefined, { text: ` = ${attribute.default}` }));
    }

    return v(
      "text",
      {
        x: 12,
        y: headerHeight + ATTRIBUTE_ROW_HEIGHT * (index + 1) - 6,
        "font-family": "var(--uml-font-mono)",
        "font-size": "var(--uml-font-size-sm)",
        fill: "var(--uml-node-text)",
      },
      tspans,
      { classes: ["uml-node-attribute"] },
    );
  });
}

function renderEnumLiteralRows(
  literals: readonly { id: string; name: string }[],
  _geom: NodeGeometry,
  headerHeight: number,
): VNode[] {
  return literals.map((literal, index) =>
    v(
      "text",
      {
        x: 12,
        y: headerHeight + ATTRIBUTE_ROW_HEIGHT * (index + 1) - 6,
        "font-family": "var(--uml-font-mono)",
        "font-size": "var(--uml-font-size-sm)",
        fill: "var(--uml-node-text)",
      },
      undefined,
      {
        text: literal.name,
        classes: ["uml-node-enum-literal"],
      },
    ),
  );
}

/**
 * Class-diagram compartment dividers — always emit the header rule, plus a
 * second rule between attributes and operations for class / interface /
 * abstract-class. Empty compartments still get their divider so the shape
 * keeps its three-band UML look.
 *
 * For `enum`, only the header rule is drawn — the body is one literals
 * compartment.
 */
function renderClassCompartmentDividers(
  geom: NodeGeometry,
  kind: NodeKind,
  literalCount: number,
  attrCount: number,
  opCount: number,
  headerHeight: number,
): VNode[] {
  const lines: VNode[] = [];
  // Header divider — always present, just below the stereotype + name band.
  lines.push(compartmentDivider(geom, headerHeight));

  if (kind === "enum") {
    return lines;
  }

  // Class / interface / abstract-class: split the body into attributes (top)
  // and operations (bottom). The literal-count branch is dead for these
  // kinds (literals only exist on enums), but we keep the offset general so
  // the math reads symmetrically.
  const offset = headerHeight + literalCount * ATTRIBUTE_ROW_HEIGHT;
  if (literalCount > 0) {
    lines.push(compartmentDivider(geom, offset));
  }
  const attrSpan = attrCount > 0 ? attrCount * ATTRIBUTE_ROW_HEIGHT : EMPTY_COMPARTMENT_HEIGHT;
  // Skip the opSpan check — we use it implicitly via geometry.
  void opCount;
  lines.push(compartmentDivider(geom, offset + attrSpan));
  return lines;
}

function renderClassHeaderBand(geom: NodeGeometry, headerHeight: number): VNode {
  return v("rect", {
    x: 0,
    y: 0,
    width: geom.width,
    height: headerHeight,
    fill: "var(--uml-class-header-bg, var(--uml-bg-elevated))",
    stroke: "none",
  });
}

function compartmentDivider(geom: NodeGeometry, y: number): VNode {
  return v("line", {
    x1: 0,
    y1: y,
    x2: geom.width,
    y2: y,
    stroke: "var(--uml-class-compartment-divider, var(--uml-node-border))",
    "stroke-width": 1,
  });
}

function syntheticStereotype(kind: NodeKind): string | undefined {
  if (kind === "interface") return "interface";
  if (kind === "abstract-class") return "abstract";
  if (kind === "enum") return "enumeration";
  return undefined;
}

/** Single-letter spot glyph per class-like kind (PlantUML/IntelliJ convention). */
function kindSpotChar(kind: NodeKind): string | undefined {
  if (kind === "class") return "C";
  if (kind === "interface") return "I";
  if (kind === "abstract-class") return "A";
  if (kind === "enum") return "E";
  return undefined;
}

/** Spot circle fill per kind — reuses existing semantic theme tokens. */
function kindSpotColor(kind: NodeKind): string {
  if (kind === "interface") return "var(--uml-info)";
  if (kind === "abstract-class") return "var(--uml-warning)";
  if (kind === "enum") return "var(--uml-accent)";
  return "var(--uml-success)"; // class
}

/**
 * The kind spot: a small colored circle with a centered letter, anchored to the
 * top-left of the header band and vertically centered within it. The letter is
 * filled with `--uml-node-bg` so it "punches out" to the page background colour,
 * staying legible against the saturated circle in both light and dark themes.
 */
function renderKindSpot(node: DiagramNode, headerH: number): VNode {
  const letter = kindSpotChar(node.kind) ?? "";
  const cy = headerH / 2;
  return v(
    "g",
    { "data-uml-spot": node.kind },
    [
      v("circle", {
        cx: SPOT_CX,
        cy,
        r: SPOT_R,
        fill: kindSpotColor(node.kind),
        stroke: "var(--uml-node-border)",
        "stroke-width": "1",
      }),
      v(
        "text",
        {
          x: SPOT_CX,
          y: cy,
          "text-anchor": "middle",
          "dominant-baseline": "central",
          "font-family": "var(--uml-font-sans)",
          "font-size": "var(--uml-font-size-sm)",
          "font-weight": "700",
          fill: "var(--uml-node-bg)",
        },
        undefined,
        { text: letter },
      ),
    ],
    { classes: ["uml-node-spot", `uml-node-spot--${node.kind}`] },
  );
}

function appendGenerics(label: string, generics: string[] | undefined): string {
  if (!generics || generics.length === 0) return label;
  return `${label}<${generics.join(", ")}>`;
}

/**
 * Header height for a node. Compartment nodes that show a stereotype line
 * (interface / abstract-class / enum always do; a class with an explicit
 * stereotype too) need a taller header so the name sits below the
 * stereotype yet still above the first compartment divider. Everything
 * else keeps the base `HEADER_HEIGHT`.
 */
export function compartmentHeaderHeight(node: DiagramNode): number {
  if (!isCompartmentNode(node.kind)) return HEADER_HEIGHT;
  const stereotype = node.stereotype ?? syntheticStereotype(node.kind);
  return stereotype ? HEADER_HEIGHT + STEREOTYPE_ROW_HEIGHT : HEADER_HEIGHT;
}

/**
 * Estimated minimum width (px) a compartment node needs so its widest text
 * line — the (possibly generic) name, the stereotype, or any member row —
 * fits inside the frame. Returns `0` for non-compartment kinds so callers
 * can uniformly `Math.max(defaultWidth, compartmentContentWidth(node))`.
 *
 * Widths are estimated from average glyph widths (same approach as
 * `descriptionLines`); the generous `COMPARTMENT_PAD_X` buffer absorbs the
 * inaccuracy so text never touches the border.
 */
export function compartmentContentWidth(node: DiagramNode): number {
  if (!isCompartmentNode(node.kind)) return 0;
  let widest = 0;
  const consider = (text: string, charWidth: number): void => {
    widest = Math.max(widest, text.length * charWidth);
  };

  consider(appendGenerics(node.label, node.generics), NAME_CHAR_WIDTH);
  const stereotype = node.stereotype ?? syntheticStereotype(node.kind);
  if (stereotype) consider(`«${stereotype}»`, STEREOTYPE_CHAR_WIDTH);

  // Class-like nodes carry a left-anchored kind spot; reserve enough width that
  // the centered title/stereotype never overlaps it.
  if (isClassLike(node.kind)) {
    const nameWidth = appendGenerics(node.label, node.generics).length * NAME_CHAR_WIDTH;
    widest = Math.max(widest, nameWidth + SPOT_RESERVE);
  }

  if (node.kind === "enum") {
    for (const literal of node.enumLiterals ?? []) consider(literal.name, ROW_CHAR_WIDTH);
  } else if (node.kind === "entity") {
    for (const attribute of node.attributes ?? [])
      consider(entityRowText(attribute), ROW_CHAR_WIDTH);
  } else {
    for (const attribute of node.attributes ?? [])
      consider(formatAttribute(attribute, node.kind), ROW_CHAR_WIDTH);
    for (const operation of node.operations ?? [])
      consider(formatOperation(operation), ROW_CHAR_WIDTH);
  }

  return widest === 0 ? 0 : Math.ceil(widest + COMPARTMENT_PAD_X);
}

/**
 * Plain-text rendering of an entity attribute row, mirroring the segments
 * `renderEntityAttributeRows` lays out (FK prefix + name + type + default).
 * Used only for width estimation, so styling markers are ignored.
 */
function entityRowText(attribute: Attribute): string {
  const fk = attribute.foreignKey === true && attribute.primaryKey !== true ? "+ " : "";
  const type = attribute.type ? `: ${attribute.type}` : "";
  const def =
    attribute.default !== undefined && attribute.default !== "" ? ` = ${attribute.default}` : "";
  return `${fk}${attribute.name}${type}${def}`;
}

function formatAttribute(attribute: Attribute, _kind: NodeKind): string {
  // Class-only attribute formatter — entity attributes are rendered through
  // `renderEntityAttributeRows` with `<tspan>` segments because their PK /
  // FK / NN markers need per-segment styling (underline / weight / prefix).
  const visibility = visibilityMarker(attribute.visibility);
  const type = attribute.type ? `: ${attribute.type}` : "";
  const multiplicity = attribute.multiplicity ? ` [${attribute.multiplicity}]` : "";
  const readonlyTag = attribute.readonly ? " {readonly}" : "";
  return `${visibility}${attribute.name}${type}${multiplicity}${readonlyTag}`;
}

function formatOperation(operation: Operation): string {
  const visibility = visibilityMarker(operation.visibility);
  const params = (operation.parameters ?? [])
    .map((p) => {
      const type = p.type ? `: ${p.type}` : "";
      const def = p.default !== undefined && p.default !== "" ? ` = ${p.default}` : "";
      return `${p.name}${type}${def}`;
    })
    .join(", ");
  const ret = operation.returnType ? `: ${operation.returnType}` : "";
  return `${visibility}${operation.name}(${params})${ret}`;
}

function visibilityMarker(visibility: Attribute["visibility"]): string {
  switch (visibility) {
    case "public":
      return "+";
    case "protected":
      return "#";
    case "private":
      return "-";
    case "package":
      return "~";
    default:
      return "";
  }
}

function ariaLabelFor(node: DiagramNode): string {
  const stereotype = node.stereotype ? ` (${node.stereotype})` : "";
  return `${node.kind}${stereotype}: ${node.label || node.id}`;
}

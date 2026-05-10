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
  const { node, x, y, width, height } = args;
  const rowHeights = isClassLike(node.kind)
    ? classRowHeights(node)
    : node.kind === "entity"
      ? (node.attributes?.length ?? 0) * ATTRIBUTE_ROW_HEIGHT
      : 0;
  const c4Padding = c4ExtraHeight(node);
  const finalHeight = Math.max(height, HEADER_HEIGHT + rowHeights + c4Padding);
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

function c4ExtraHeight(node: DiagramNode): number {
  if (!C4_KINDS.has(node.kind)) return 0;
  let extra = 0;
  if (node.kind === "database") extra += DATABASE_CAP_HEIGHT;
  if (node.kind === "person" || node.kind === "person-external") extra += PERSON_ICON_HEIGHT;
  // c4model.com requires every element to carry a type tag like
  // "[Software System]" / "[Person]" — we render it on a dedicated row
  // for every C4 kind, regardless of whether `technology` is set.
  extra += TYPE_TAG_ROW_HEIGHT;
  if (node.description) extra += DESCRIPTION_ROW_HEIGHT;
  return extra;
}

export function renderNode(args: RenderNodeArgs): VNode {
  const geometry = computeNodeGeometry(args);
  const { node } = args;
  const children: VNode[] = [];

  children.push(renderFrame(node, geometry));
  if (isClassLike(node.kind)) {
    children.push(renderClassHeaderBand(geometry));
  }
  children.push(...renderHeaderRows(node, geometry));
  if (isClassLike(node.kind)) {
    const literalCount = node.enumLiterals?.length ?? 0;
    const attrCount = node.attributes?.length ?? 0;
    const opCount = node.operations?.length ?? 0;
    if (literalCount > 0) {
      children.push(...renderEnumLiteralRows(node.enumLiterals ?? [], geometry));
    }
    if (attrCount > 0) {
      children.push(
        ...renderAttributeRows(
          node.attributes ?? [],
          geometry,
          node.kind,
          literalCount * ATTRIBUTE_ROW_HEIGHT,
        ),
      );
    }
    if (opCount > 0) {
      const opOffset =
        literalCount * ATTRIBUTE_ROW_HEIGHT +
        (attrCount > 0 ? attrCount * ATTRIBUTE_ROW_HEIGHT : EMPTY_COMPARTMENT_HEIGHT);
      children.push(...renderOperationRows(node.operations ?? [], geometry, opOffset));
    }
    children.push(
      ...renderClassCompartmentDividers(geometry, node.kind, literalCount, attrCount, opCount),
    );
  } else if (node.kind === "entity") {
    children.push(...renderAttributeRows(node.attributes ?? [], geometry, "entity", 0));
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
      // Class-like kinds (class / interface / abstract-class / enum) follow
      // classic UML notation: sharp corners, no rounding. Other fallbacks
      // keep the soft 8px radius that C4 boxes use.
      const sharp = isClassLike(node.kind);
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
function renderResizeHandles(geom: NodeGeometry): VNode[] {
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
        classes: ["uml-node-resize-handle", `uml-node-resize-handle--${p.side}`],
      },
    ),
  );
}

/**
 * Four small port handles at edge midpoints (N / E / S / W) used for
 * starting edge-creation drags. Hidden by default — CSS reveals them on
 * `:hover` of the node group and when `data-selected="true"`.
 */
function renderPortHandles(geom: NodeGeometry): VNode[] {
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

function renderDatabaseFrame(geom: NodeGeometry): VNode {
  // Cylinder: top ellipse + side body + bottom curve. Using a single
  // <path> for the body keeps the SVG compact and theme-friendly.
  const w = geom.width;
  const h = geom.height;
  const cap = DATABASE_CAP_HEIGHT;
  const fill = "var(--uml-c4-database-bg, var(--uml-node-bg))";
  const stroke = "var(--uml-c4-database-border, var(--uml-node-border))";
  const body = v("path", {
    d: `M 0 ${cap / 2} L 0 ${h - cap / 2} A ${w / 2} ${cap / 2} 0 0 0 ${w} ${h - cap / 2} L ${w} ${cap / 2}`,
    fill,
    stroke,
    "stroke-width": "1.5",
  });
  const top = v("ellipse", {
    cx: w / 2,
    cy: cap / 2,
    rx: w / 2,
    ry: cap / 2,
    fill,
    stroke,
    "stroke-width": "1.5",
  });
  return v("g", { "data-uml-frame": "database" }, [body, top]);
}

interface HeaderLayout {
  /** First text-row baseline (after any frame cap such as the cylinder top). */
  topOffset: number;
  /** Per-row line height. */
  lineHeight: number;
}

function headerLayoutFor(node: DiagramNode): HeaderLayout {
  if (node.kind === "database") {
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
  const isClassKind = isClassLike(node.kind);
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
    rows.push(
      v(
        "text",
        {
          x: geom.width / 2,
          y,
          "text-anchor": "middle",
          "font-family": "var(--uml-font-sans)",
          "font-size": "var(--uml-font-size-sm)",
          "font-style": "italic",
          fill: "var(--uml-text-muted)",
        },
        undefined,
        { text: truncate(node.description, 64), classes: ["uml-node-description"] },
      ),
    );
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
    queue: "Queue",
  };
  const prefix = labelByKind[node.kind] ?? "Element";
  if (node.technology && node.technology.length > 0) {
    return `[${prefix}: ${node.technology}]`;
  }
  return `[${prefix}]`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function renderAttributeRows(
  attributes: readonly Attribute[],
  _geom: NodeGeometry,
  kind: NodeKind,
  baseOffset: number,
): VNode[] {
  return attributes.map((attribute, index) =>
    v(
      "text",
      {
        x: 12,
        y: HEADER_HEIGHT + baseOffset + ATTRIBUTE_ROW_HEIGHT * (index + 1) - 6,
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
): VNode[] {
  return operations.map((operation, index) =>
    v(
      "text",
      {
        x: 12,
        y: HEADER_HEIGHT + baseOffset + ATTRIBUTE_ROW_HEIGHT * (index + 1) - 6,
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

function renderEnumLiteralRows(
  literals: readonly { id: string; name: string }[],
  _geom: NodeGeometry,
): VNode[] {
  return literals.map((literal, index) =>
    v(
      "text",
      {
        x: 12,
        y: HEADER_HEIGHT + ATTRIBUTE_ROW_HEIGHT * (index + 1) - 6,
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
): VNode[] {
  const lines: VNode[] = [];
  // Header divider — always present, just below the stereotype + name band.
  lines.push(compartmentDivider(geom, HEADER_HEIGHT));

  if (kind === "enum") {
    return lines;
  }

  // Class / interface / abstract-class: split the body into attributes (top)
  // and operations (bottom). The literal-count branch is dead for these
  // kinds (literals only exist on enums), but we keep the offset general so
  // the math reads symmetrically.
  const offset = HEADER_HEIGHT + literalCount * ATTRIBUTE_ROW_HEIGHT;
  if (literalCount > 0) {
    lines.push(compartmentDivider(geom, offset));
  }
  const attrSpan = attrCount > 0 ? attrCount * ATTRIBUTE_ROW_HEIGHT : EMPTY_COMPARTMENT_HEIGHT;
  // Skip the opSpan check — we use it implicitly via geometry.
  void opCount;
  lines.push(compartmentDivider(geom, offset + attrSpan));
  return lines;
}

function renderClassHeaderBand(geom: NodeGeometry): VNode {
  return v("rect", {
    x: 0,
    y: 0,
    width: geom.width,
    height: HEADER_HEIGHT,
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

function appendGenerics(label: string, generics: string[] | undefined): string {
  if (!generics || generics.length === 0) return label;
  return `${label}<${generics.join(", ")}>`;
}

function formatAttribute(attribute: Attribute, kind: NodeKind): string {
  const visibility = visibilityMarker(attribute.visibility);
  const type = attribute.type ? `: ${attribute.type}` : "";
  // Class-style: append `[multiplicity]` after the type when present.
  // ER-style: append `[PK,FK,NN]` flag block — these flags are ER-only.
  let suffix = "";
  if (kind === "entity") {
    const flags = [
      attribute.primaryKey ? "PK" : null,
      attribute.foreignKey ? "FK" : null,
      attribute.nullable === false ? "NN" : null,
    ].filter(Boolean);
    if (flags.length > 0) suffix = ` [${flags.join(",")}]`;
  } else if (attribute.multiplicity) {
    suffix = ` [${attribute.multiplicity}]`;
  }
  const readonlyTag = attribute.readonly && kind !== "entity" ? " {readonly}" : "";
  return `${visibility}${attribute.name}${type}${suffix}${readonlyTag}`;
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

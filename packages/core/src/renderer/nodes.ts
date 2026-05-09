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
const TECH_ROW_HEIGHT = 16;
const DESCRIPTION_ROW_HEIGHT = 16;
const DATABASE_CAP_HEIGHT = 14;
const PERSON_ICON_HEIGHT = 18;

const C4_KINDS = new Set<NodeKind>([
  "person",
  "system",
  "system-external",
  "container",
  "component",
  "database",
]);

/**
 * Compute final geometry for a node, factoring in attribute / operation
 * rows that grow the box. The renderer always commits to this geometry
 * before drawing edges so port snapping uses the same rectangle.
 */
export function computeNodeGeometry(args: RenderNodeArgs): NodeGeometry {
  const { node, x, y, width, height } = args;
  const rowHeights =
    node.kind === "class" || node.kind === "interface" || node.kind === "abstract-class"
      ? (node.attributes?.length ?? 0) * ATTRIBUTE_ROW_HEIGHT +
        (node.operations?.length ?? 0) * ATTRIBUTE_ROW_HEIGHT
      : node.kind === "entity"
        ? (node.attributes?.length ?? 0) * ATTRIBUTE_ROW_HEIGHT
        : 0;
  const c4Padding = c4ExtraHeight(node);
  const finalHeight = Math.max(height, HEADER_HEIGHT + rowHeights + c4Padding);
  return { id: node.id, x, y, width, height: finalHeight };
}

function c4ExtraHeight(node: DiagramNode): number {
  if (!C4_KINDS.has(node.kind)) return 0;
  let extra = 0;
  if (node.kind === "database") extra += DATABASE_CAP_HEIGHT;
  if (node.kind === "person") extra += PERSON_ICON_HEIGHT;
  if (node.technology) extra += TECH_ROW_HEIGHT;
  if (node.description) extra += DESCRIPTION_ROW_HEIGHT;
  return extra;
}

export function renderNode(args: RenderNodeArgs): VNode {
  const geometry = computeNodeGeometry(args);
  const { node } = args;
  const children: VNode[] = [];

  children.push(renderFrame(node, geometry));
  children.push(...renderHeaderRows(node, geometry));
  if (node.kind === "class" || node.kind === "interface" || node.kind === "abstract-class") {
    children.push(...renderAttributeRows(node.attributes ?? [], geometry));
    children.push(
      ...renderOperationRows(
        node.operations ?? [],
        geometry,
        (node.attributes?.length ?? 0) * ATTRIBUTE_ROW_HEIGHT,
      ),
    );
  } else if (node.kind === "entity") {
    children.push(...renderAttributeRows(node.attributes ?? [], geometry));
  }

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
      return renderPersonFrame(geom);
    case "system":
      return renderC4Rect(geom, "system");
    case "system-external":
      return renderC4Rect(geom, "external", { dashed: true });
    case "container":
      return renderC4Rect(geom, "container");
    case "component":
      return renderC4Rect(geom, "component");
    case "database":
      return renderDatabaseFrame(geom);
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
    default:
      return v("rect", {
        x: 0,
        y: 0,
        width: geom.width,
        height: geom.height,
        rx: 8,
        ry: 8,
        fill: "var(--uml-node-bg)",
        stroke: "var(--uml-node-border)",
        "stroke-width": "1.5",
      });
  }
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

function renderPersonFrame(geom: NodeGeometry): VNode {
  // Rounded rect frame plus a small stick-figure icon centred at the top
  // so the C4 affordance reads even when label text is short.
  const cx = geom.width / 2;
  const iconTop = 10;
  const headRadius = 5;
  const head = v("circle", {
    cx,
    cy: iconTop,
    r: headRadius,
    fill: "var(--uml-c4-person-text, var(--uml-node-text))",
  });
  const body = v("path", {
    d: `M ${cx} ${iconTop + headRadius} L ${cx} ${iconTop + headRadius + 8} M ${cx - 6} ${iconTop + headRadius + 4} L ${cx + 6} ${iconTop + headRadius + 4} M ${cx} ${iconTop + headRadius + 8} L ${cx - 4} ${iconTop + headRadius + 14} M ${cx} ${iconTop + headRadius + 8} L ${cx + 4} ${iconTop + headRadius + 14}`,
    stroke: "var(--uml-c4-person-text, var(--uml-node-text))",
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
    fill: "var(--uml-c4-person-bg, var(--uml-node-bg))",
    stroke: "var(--uml-c4-person-border, var(--uml-node-border))",
    "stroke-width": "1.5",
  });
  return v("g", { "data-uml-frame": "person" }, [frame, head, body]);
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
  if (node.kind === "person") {
    return { topOffset: PERSON_ICON_HEIGHT + 14, lineHeight: 16 };
  }
  return { topOffset: 14, lineHeight: 16 };
}

function renderHeaderRows(node: DiagramNode, geom: NodeGeometry): VNode[] {
  const rows: VNode[] = [];
  const layout = headerLayoutFor(node);
  let y = layout.topOffset;

  if (node.stereotype) {
    rows.push(
      v(
        "text",
        {
          x: geom.width / 2,
          y,
          "text-anchor": "middle",
          "font-family": "var(--uml-font-sans)",
          "font-size": "var(--uml-font-size-sm)",
          fill: "var(--uml-node-stereotype)",
        },
        undefined,
        { text: `«${node.stereotype}»`, classes: ["uml-node-stereotype"] },
      ),
    );
    y += layout.lineHeight;
  }

  rows.push(
    v(
      "text",
      {
        x: geom.width / 2,
        y: y + 8,
        "text-anchor": "middle",
        "font-family": "var(--uml-font-sans)",
        "font-size": "var(--uml-font-size-base)",
        fill: c4TextColor(node.kind),
      },
      undefined,
      { text: node.label, classes: ["uml-node-label"] },
    ),
  );
  y += layout.lineHeight + 4;

  if (node.technology && C4_KINDS.has(node.kind)) {
    const subtitle = formatTechSubtitle(node);
    rows.push(
      v(
        "text",
        {
          x: geom.width / 2,
          y,
          "text-anchor": "middle",
          "font-family": "var(--uml-font-mono)",
          "font-size": "var(--uml-font-size-sm)",
          fill: "var(--uml-c4-tech-text, var(--uml-text-muted))",
        },
        undefined,
        { text: subtitle, classes: ["uml-node-tech"] },
      ),
    );
    y += TECH_ROW_HEIGHT;
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
  if (kind === "system") return "var(--uml-c4-system-text, var(--uml-node-text))";
  if (kind === "system-external") return "var(--uml-c4-external-text, var(--uml-node-text))";
  if (kind === "container") return "var(--uml-c4-container-text, var(--uml-node-text))";
  if (kind === "component") return "var(--uml-c4-component-text, var(--uml-node-text))";
  if (kind === "database") return "var(--uml-c4-database-text, var(--uml-node-text))";
  return "var(--uml-node-text)";
}

function formatTechSubtitle(node: DiagramNode): string {
  const labelByKind: Record<string, string> = {
    container: "Container",
    component: "Component",
    database: "Database",
    system: "System",
    "system-external": "System",
    person: "Person",
  };
  const prefix = labelByKind[node.kind] ?? "Tech";
  return `[${prefix}: ${node.technology}]`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function renderAttributeRows(attributes: readonly Attribute[], _geom: NodeGeometry): VNode[] {
  return attributes.map((attribute, index) =>
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
        text: formatAttribute(attribute),
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
      },
      undefined,
      {
        text: formatOperation(operation),
        classes: ["uml-node-operation"],
      },
    ),
  );
}

function formatAttribute(attribute: Attribute): string {
  const visibility = visibilityMarker(attribute.visibility);
  const type = attribute.type ? `: ${attribute.type}` : "";
  const flags = [
    attribute.primaryKey ? "PK" : null,
    attribute.foreignKey ? "FK" : null,
    attribute.nullable === false ? "NN" : null,
  ].filter(Boolean);
  const flagText = flags.length > 0 ? ` [${flags.join(",")}]` : "";
  return `${visibility}${attribute.name}${type}${flagText}`;
}

function formatOperation(operation: Operation): string {
  const visibility = visibilityMarker(operation.visibility);
  const params = (operation.parameters ?? [])
    .map((p) => `${p.name}${p.type ? `: ${p.type}` : ""}`)
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

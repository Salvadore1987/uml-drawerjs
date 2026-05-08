import type { Attribute, DiagramNode, NodeKind, Operation } from "../model/types.js";
import { v } from "./types.js";
import type { NodeGeometry, VNode } from "./types.js";

/**
 * Per-kind node renderer. Each `NodeKind` becomes an `<g>` group containing
 * a frame, a label band, an optional stereotype badge, and (for class /
 * entity) attribute rows. Coordinates and class names are the only
 * theme-touching surface — every visual property is read from the
 * `--uml-*` contract via inline `style="… var(--uml-…)"` declarations,
 * never from hex literals.
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
  const finalHeight = Math.max(height, HEADER_HEIGHT + rowHeights);
  return { id: node.id, x, y, width, height: finalHeight };
}

export function renderNode(args: RenderNodeArgs): VNode {
  const geometry = computeNodeGeometry(args);
  const { node } = args;
  const children: VNode[] = [];

  children.push(renderFrame(node.kind, geometry));
  children.push(renderHeader(node, geometry));
  if (node.stereotype) children.push(renderStereotype(node, geometry));
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

function renderFrame(kind: NodeKind, geom: NodeGeometry): VNode {
  // Use a rounded rectangle as the universal frame; per-kind shapes (cylinder
  // for database, actor stick figure) are visual refinements that the
  // theming contract can opt into via class selectors. MVP uses one shape.
  const radius = kind === "actor" ? geom.width / 2 : 8;
  return v("rect", {
    x: 0,
    y: 0,
    width: geom.width,
    height: geom.height,
    rx: radius,
    ry: radius,
    fill: "var(--uml-node-bg)",
    stroke: "var(--uml-node-border)",
    "stroke-width": "1.5",
  });
}

function renderHeader(node: DiagramNode, geom: NodeGeometry): VNode {
  return v(
    "text",
    {
      x: geom.width / 2,
      y: 22,
      "text-anchor": "middle",
      "font-family": "var(--uml-font-sans)",
      "font-size": "var(--uml-font-size-base)",
      fill: "var(--uml-node-text)",
    },
    undefined,
    { text: node.label, classes: ["uml-node-label"] },
  );
}

function renderStereotype(node: DiagramNode, geom: NodeGeometry): VNode {
  return v(
    "text",
    {
      x: geom.width / 2,
      y: 12,
      "text-anchor": "middle",
      "font-family": "var(--uml-font-sans)",
      "font-size": "var(--uml-font-size-sm)",
      fill: "var(--uml-node-stereotype)",
    },
    undefined,
    {
      text: `«${node.stereotype}»`,
      classes: ["uml-node-stereotype"],
    },
  );
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

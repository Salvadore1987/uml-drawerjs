import type { Diagram } from "../model/types.js";

/**
 * Build a screen-reader-friendly summary of a diagram. Returned as plain
 * text so the React adapter (or vanilla bootstrap) can drop it into a
 * visually-hidden `<div role="region" aria-label="Diagram contents">`
 * next to the SVG canvas.
 *
 * The format is deliberately compact and deterministic: per-type heading,
 * list of nodes (with stereotype + technology where present), list of
 * relationships in `(source, target, kind, label?)` form.
 */
export function summarizeForA11y(diagram: Diagram): string {
  const lines: string[] = [];
  lines.push(
    `${diagramTypeLabel(diagram.type)} diagram${diagram.title ? `: ${diagram.title}` : ""}`,
  );
  lines.push("");
  lines.push(`${diagram.nodes.length} elements:`);
  for (const node of diagram.nodes) {
    lines.push(`- ${describeNode(node)}`);
  }
  if (diagram.edges.length > 0) {
    lines.push("");
    lines.push(`${diagram.edges.length} relationships:`);
    const labelById = new Map(diagram.nodes.map((n) => [n.id, n.label || n.id] as const));
    for (const edge of diagram.edges) {
      const from = labelById.get(edge.source) ?? edge.source;
      const to = labelById.get(edge.target) ?? edge.target;
      const labelPart = edge.label ? ` (${edge.label})` : "";
      lines.push(`- ${from} ${arrow(edge.kind)} ${to}${labelPart}`);
    }
  }
  return lines.join("\n");
}

function describeNode(node: Diagram["nodes"][number]): string {
  const stereotype = node.stereotype ? ` «${node.stereotype}»` : "";
  const tech = node.technology ? ` [${node.technology}]` : "";
  return `${node.label || node.id} (${node.kind})${stereotype}${tech}`;
}

function arrow(kind: Diagram["edges"][number]["kind"]): string {
  switch (kind) {
    case "inheritance":
      return "extends";
    case "realization":
      return "implements";
    case "composition":
      return "owns";
    case "aggregation":
      return "aggregates";
    case "dependency":
      return "depends on";
    case "association":
      return "associates with";
    case "uses":
    case "depends-on":
      return "uses";
    case "one-to-one":
      return "1:1";
    case "one-to-many":
      return "1:N";
    case "many-to-many":
      return "M:N";
    case "sync-call":
      return "calls";
    case "async-call":
      return "asynchronously calls";
    case "return":
      return "returns to";
    case "create":
      return "creates";
    case "destroy":
      return "destroys";
    case "lost-message":
      return "sends (lost)";
    case "found-message":
      return "receives (found)";
  }
}

function diagramTypeLabel(type: Diagram["type"]): string {
  switch (type) {
    case "c4-context":
      return "C4 Context";
    case "c4-container":
      return "C4 Container";
    case "c4-component":
      return "C4 Component";
    case "class":
      return "Class";
    case "er":
      return "Entity-Relationship";
    case "sequence":
      return "Sequence";
  }
}

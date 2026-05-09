import type { Diagram, DiagramEdge, DiagramNode } from "../model/types.js";
import { escapeStringLiteral, lookupAlias, nodeAlias } from "./format.js";

/**
 * Render a C4 (Context / Container / Component) diagram body. Boundaries
 * become `System_Boundary(alias, "label") { ... }` blocks; relationships
 * use `Rel(from, to, "label", "tech"?)`.
 *
 * Edges may carry a synthetic `[tech]` suffix on the label — that's how the
 * parser preserves the optional fourth `Rel(...)` argument until the AST
 * grows a dedicated `technology` field on edges (tracked in ADR-0003). The
 * generator decodes that suffix back into the fourth argument so round-trip
 * stays lossless.
 */
export function renderC4(diagram: Diagram, aliases: Map<string, string>): string[] {
  const lines: string[] = [];

  for (const group of diagram.groups) {
    if (group.kind !== "boundary") continue;
    const alias = lookupAlias(aliases, group.id);
    lines.push(`System_Boundary(${alias}, "${escapeStringLiteral(group.label)}") {`);
    for (const childId of group.children) {
      const child = diagram.nodes.find((n) => n.id === childId);
      if (child) lines.push(`  ${formatC4Node(child, aliases)}`);
    }
    lines.push("}");
  }

  const groupedNodeIds = new Set(
    diagram.groups.filter((g) => g.kind === "boundary").flatMap((g) => g.children),
  );
  for (const node of diagram.nodes) {
    if (groupedNodeIds.has(node.id)) continue;
    lines.push(formatC4Node(node, aliases));
  }

  for (const edge of diagram.edges) {
    lines.push(formatC4Edge(edge, aliases));
  }

  return lines;
}

function formatC4Node(node: DiagramNode, aliases: Map<string, string>): string {
  const alias = nodeAlias(aliases, node);
  const label = escapeStringLiteral(node.label);
  switch (node.kind) {
    case "person":
      return formatPersonLike("Person", alias, label, node.description);
    case "person-external":
      return formatPersonLike("Person_Ext", alias, label, node.description);
    case "system":
      return formatPersonLike("System", alias, label, node.description);
    case "system-external":
      return formatPersonLike("System_Ext", alias, label, node.description);
    case "container":
      return formatContainerLike("Container", alias, label, node.technology, node.description);
    case "container-external":
      return formatContainerLike("Container_Ext", alias, label, node.technology, node.description);
    case "component":
      return formatContainerLike("Component", alias, label, node.technology, node.description);
    case "database":
      // Without context we can't tell whether this DB lives at Context /
      // Container / Component scope — the parser collapses SystemDb /
      // ContainerDb / ComponentDb into the same `database` kind. When a
      // technology is set we emit ContainerDb (the only Db macro that
      // accepts $techn); otherwise SystemDb, which round-trips at all
      // three tiers because the parser accepts each variant.
      if (node.technology) {
        return formatContainerLike("ContainerDb", alias, label, node.technology, node.description);
      }
      return formatPersonLike("SystemDb", alias, label, node.description);
    case "queue":
      // Same shape collapse as `database`: SystemQueue / ContainerQueue
      // map to one kind. Pick ContainerQueue when there's a technology
      // (Container tier signature), SystemQueue otherwise (Context tier).
      if (node.technology) {
        return formatContainerLike(
          "ContainerQueue",
          alias,
          label,
          node.technology,
          node.description,
        );
      }
      return formatPersonLike("SystemQueue", alias, label, node.description);
    default:
      // C4 dispatchers only ever see C4 kinds in practice; fall back to a
      // raw `Component(alias, "label")` so the generator never throws.
      return `Component(${alias}, "${label}")`;
  }
}

function formatPersonLike(
  macro: string,
  alias: string,
  label: string,
  description: string | undefined,
): string {
  if (description !== undefined && description !== "") {
    return `${macro}(${alias}, "${label}", "${escapeStringLiteral(description)}")`;
  }
  return `${macro}(${alias}, "${label}")`;
}

function formatContainerLike(
  macro: string,
  alias: string,
  label: string,
  technology: string | undefined,
  description: string | undefined,
): string {
  const hasTech = technology !== undefined && technology !== "";
  const hasDesc = description !== undefined && description !== "";
  if (hasDesc) {
    const tech = hasTech ? escapeStringLiteral(technology) : "";
    return `${macro}(${alias}, "${label}", "${tech}", "${escapeStringLiteral(description)}")`;
  }
  if (hasTech) {
    return `${macro}(${alias}, "${label}", "${escapeStringLiteral(technology)}")`;
  }
  return `${macro}(${alias}, "${label}")`;
}

function formatC4Edge(edge: DiagramEdge, aliases: Map<string, string>): string {
  const from = lookupAlias(aliases, edge.source);
  const to = lookupAlias(aliases, edge.target);
  const { label, technology } = splitTechSuffix(edge.label ?? "");
  if (technology !== null) {
    return `Rel(${from}, ${to}, "${escapeStringLiteral(label)}", "${escapeStringLiteral(technology)}")`;
  }
  return `Rel(${from}, ${to}, "${escapeStringLiteral(label)}")`;
}

/**
 * Detect a `[tech]` suffix that the parser appends to `Rel` labels when the
 * source carried a fourth argument. Returns `{ label, technology: null }`
 * when no suffix is present, so the caller can tell apart "edge has no
 * tech" from "edge has empty tech".
 */
function splitTechSuffix(value: string): { label: string; technology: string | null } {
  const match = /^(.*?)\s*\[([^\]]*)\]$/u.exec(value);
  if (!match) return { label: value, technology: null };
  const labelPart = match[1] ?? "";
  const tech = match[2] ?? "";
  return { label: labelPart, technology: tech };
}

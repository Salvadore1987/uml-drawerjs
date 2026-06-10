import { hasAsyncTag } from "../model/query.js";
import type { Diagram, DiagramEdge, DiagramNode, DiagramType } from "../model/types.js";
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
  // Component-tier diagrams wrap their components in Container_Boundary
  // per c4model.com; the other tiers use System_Boundary as the canonical
  // wrapper macro.
  const boundaryMacro = diagram.type === "c4-component" ? "Container_Boundary" : "System_Boundary";

  // Async edges need the dashed line-style declared BEFORE the Rel lines so
  // real PlantUML renderers apply it. The parser consumes incoming
  // `AddRelTag("async", ...)` lines, so the opaque check only guards
  // documents serialized before that behavior existed.
  if (diagram.edges.some(hasAsyncTag) && !opaqueDeclaresAsyncRelTag(diagram)) {
    lines.push('AddRelTag("async", $lineStyle = DashedLine())');
  }

  for (const group of diagram.groups) {
    if (group.kind !== "boundary") continue;
    const alias = lookupAlias(aliases, group.id);
    lines.push(`${boundaryMacro}(${alias}, "${escapeStringLiteral(group.label)}") {`);
    for (const childId of group.children) {
      const child = diagram.nodes.find((n) => n.id === childId);
      if (child) lines.push(`  ${formatC4Node(child, aliases, diagram.type)}`);
    }
    lines.push("}");
  }

  const groupedNodeIds = new Set(
    diagram.groups.filter((g) => g.kind === "boundary").flatMap((g) => g.children),
  );
  for (const node of diagram.nodes) {
    if (groupedNodeIds.has(node.id)) continue;
    lines.push(formatC4Node(node, aliases, diagram.type));
  }

  for (const edge of diagram.edges) {
    lines.push(formatC4Edge(edge, aliases));
  }

  return lines;
}

function formatC4Node(
  node: DiagramNode,
  aliases: Map<string, string>,
  diagramType: DiagramType,
): string {
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
    case "component-external":
      return formatContainerLike("Component_Ext", alias, label, node.technology, node.description);
    case "database":
      // The parser collapses SystemDb / ContainerDb / ComponentDb into the
      // same `database` kind, so the generator picks the macro by diagram
      // tier (Component-tier emits ComponentDb; Container-tier emits
      // ContainerDb when tech is present; Context-tier falls through to
      // SystemDb). Each tier's parser accepts the matching macro, so the
      // round-trip stays lossless within a given diagram type.
      if (diagramType === "c4-component" && node.technology) {
        return formatContainerLike("ComponentDb", alias, label, node.technology, node.description);
      }
      if (node.technology) {
        return formatContainerLike("ContainerDb", alias, label, node.technology, node.description);
      }
      return formatPersonLike("SystemDb", alias, label, node.description);
    case "database-external":
      // External-database twin of the `database` case: the parser folds
      // SystemDb_Ext / ContainerDb_Ext / ComponentDb_Ext into this single
      // kind, so the generator re-selects the macro by diagram tier (and the
      // presence of technology) to keep the round-trip lossless per tier.
      if (diagramType === "c4-component" && node.technology) {
        return formatContainerLike(
          "ComponentDb_Ext",
          alias,
          label,
          node.technology,
          node.description,
        );
      }
      if (node.technology) {
        return formatContainerLike(
          "ContainerDb_Ext",
          alias,
          label,
          node.technology,
          node.description,
        );
      }
      return formatPersonLike("SystemDb_Ext", alias, label, node.description);
    case "queue":
      if (diagramType === "c4-component" && node.technology) {
        return formatContainerLike(
          "ComponentQueue",
          alias,
          label,
          node.technology,
          node.description,
        );
      }
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

/**
 * Defensive duplicate guard for the `AddRelTag("async", ...)` header — only
 * relevant for ASTs serialized before the parser learned to consume the
 * declaration (it would sit in `metadata.opaque` and be re-emitted there).
 */
function opaqueDeclaresAsyncRelTag(diagram: Diagram): boolean {
  return (
    diagram.metadata.opaque?.some((line) => /^AddRelTag\(\s*"async"/u.test(line.trim())) ?? false
  );
}

function formatC4Edge(edge: DiagramEdge, aliases: Map<string, string>): string {
  const from = lookupAlias(aliases, edge.source);
  const to = lookupAlias(aliases, edge.target);
  // Non-empty `tags` round-trip as the `$tags="a+b"` named argument; the
  // empty array means "absent" (commands clear tags with `[]`, never
  // `undefined`, because applyPatch skips undefined patch values).
  const tagsSuffix =
    edge.tags && edge.tags.length > 0
      ? `, $tags="${escapeStringLiteral(edge.tags.join("+"))}"`
      : "";
  // Prefer the dedicated `technology` field. Fall back to the legacy `[tech]`
  // suffix encoding only for ASTs created before the field existed.
  const hasTechField = edge.technology !== undefined && edge.technology !== "";
  const legacy = splitTechSuffix(edge.label ?? "");
  const technology = hasTechField
    ? edge.technology!
    : edge.technology !== undefined
      ? null // explicit empty technology → no 4th arg
      : legacy.technology;
  const label = edge.technology !== undefined ? (edge.label ?? "") : legacy.label;
  if (technology !== null) {
    // C4-PlantUML's Rel macro requires the third (label) argument when a
    // fourth (technology) is present, so we keep the empty string only in
    // this branch.
    return `Rel(${from}, ${to}, "${escapeStringLiteral(label)}", "${escapeStringLiteral(technology)}"${tagsSuffix})`;
  }
  // Always emit the third (label) argument — `Rel(from, to)` is a
  // parameter-count mismatch against the upstream C4-PlantUML macro
  // (`$label` has no default value), causing "Function not found Rel"
  // on plantuml.com and any server using the stdlib's bundled C4 macros.
  // The lint pass still flags empty labels as content-quality issues.
  return `Rel(${from}, ${to}, "${escapeStringLiteral(label)}"${tagsSuffix})`;
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

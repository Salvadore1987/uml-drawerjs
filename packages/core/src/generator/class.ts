import type {
  Attribute,
  Diagram,
  DiagramEdge,
  DiagramNode,
  EdgeEndpoint,
  EdgeKind,
  EnumLiteral,
  Operation,
  OperationParameter,
  Visibility,
} from "../model/types.js";
import { escapeStringLiteral, lookupAlias, nodeAlias } from "./format.js";

/**
 * Render a class-diagram body. Node declarations are emitted in `ast.nodes`
 * order; when a node carries members (attributes / operations / enum
 * literals) the declaration expands to a `class Foo<T> { ... }` block.
 *
 * Edge arrows are picked deterministically from a forward-arrow table keyed
 * by `EdgeKind`, which matches the parser's canonical mapping (so `<|--`
 * parses to inheritance and gen always emits `--|>` for inheritance — the
 * round-trip normalises arrow direction).
 */
export function renderClass(diagram: Diagram, aliases: Map<string, string>): string[] {
  const lines: string[] = [];

  // Emit packages first so their `{ … }` block contains the member nodes
  // declared inside them, mirroring the parser's containment rules.
  const childToPackage = new Map<string, string>();
  for (const group of diagram.groups) {
    if (group.kind === "package") {
      for (const childId of group.children) childToPackage.set(childId, group.id);
    }
  }

  const packageGroups = diagram.groups.filter((g) => g.kind === "package");
  const nodesById = new Map<string, DiagramNode>(diagram.nodes.map((n) => [n.id, n]));

  for (const group of packageGroups) {
    // Emit a stable alias (`package "Label" as alias {`) so the alias-keyed
    // `@drawer:meta` layout override round-trips back onto the group — without
    // it a resized package reverts to its auto-fit / default size on re-parse.
    lines.push(
      `package "${escapeStringLiteral(group.label)}" as ${lookupAlias(aliases, group.id)} {`,
    );
    for (const childId of group.children) {
      const child = nodesById.get(childId);
      if (!child) continue;
      for (const declLine of formatClassDeclaration(child, aliases)) {
        lines.push(`  ${declLine}`);
      }
    }
    lines.push("}");
  }

  // Loose nodes — those not contained in any package.
  for (const node of diagram.nodes) {
    if (childToPackage.has(node.id)) continue;
    lines.push(...formatClassDeclaration(node, aliases));
  }

  for (const edge of diagram.edges) {
    lines.push(formatClassEdge(edge, aliases));
  }
  return lines;
}

function formatClassDeclaration(node: DiagramNode, aliases: Map<string, string>): string[] {
  const head = formatClassHead(node, aliases);
  const memberLines = formatMembers(node);
  if (memberLines.length === 0) return [head];
  return [`${head} {`, ...memberLines.map((line) => `  ${line}`), "}"];
}

function formatClassHead(node: DiagramNode, aliases: Map<string, string>): string {
  // `class Foo` ties the visual name to the alias; when the label can't be
  // used as the alias verbatim (spaces / punctuation / a duplicate, so the
  // alias index fell back to a generated token), emit the `"label" as alias`
  // form so the real label round-trips instead of showing the alias/GUID.
  const name = formatNameToken(node, aliases);
  const generics = formatGenerics(node.generics);
  const stereotype = node.stereotype ? ` <<${node.stereotype}>>` : "";
  switch (node.kind) {
    case "class":
      return `class ${name}${generics}${stereotype}`;
    case "interface":
      return `interface ${name}${generics}${stereotype}`;
    case "abstract-class":
      return `abstract class ${name}${generics}${stereotype}`;
    case "enum":
      return `enum ${name}${stereotype}`;
    default:
      // Class diagrams shouldn't see other kinds; emit `class` as a safe
      // fallback so the generator never throws on malformed AST.
      return `class ${name}${stereotype}`;
  }
}

/**
 * Name token for a class-like declaration: a bare `alias` when the alias is
 * exactly the label, otherwise the `"label" as alias` form so labels that
 * aren't valid PlantUML identifiers survive the round-trip.
 */
function formatNameToken(node: DiagramNode, aliases: Map<string, string>): string {
  const alias = nodeAlias(aliases, node);
  if (alias === node.label) return alias;
  return `"${escapeStringLiteral(node.label)}" as ${alias}`;
}

function formatGenerics(generics: string[] | undefined): string {
  if (!generics || generics.length === 0) return "";
  return `<${generics.join(", ")}>`;
}

function formatMembers(node: DiagramNode): string[] {
  const lines: string[] = [];
  if (node.kind === "enum") {
    for (const literal of node.enumLiterals ?? []) {
      lines.push(formatEnumLiteral(literal));
    }
  }
  for (const attr of node.attributes ?? []) {
    lines.push(formatAttribute(attr));
  }
  for (const op of node.operations ?? []) {
    lines.push(formatOperation(op));
  }
  return lines;
}

function formatEnumLiteral(literal: EnumLiteral): string {
  return literal.name;
}

function formatAttribute(attr: Attribute): string {
  const segments: string[] = [];
  if (attr.static) segments.push("{static}");
  const visibility = visibilityMarker(attr.visibility);
  const head = visibility ? `${visibility}${attr.name}` : attr.name;
  let typed = head;
  if (attr.type) typed += `: ${attr.type}`;
  if (attr.multiplicity) typed += ` [${attr.multiplicity}]`;
  if (attr.default !== undefined && attr.default !== "") typed += ` = ${attr.default}`;
  if (attr.readonly) typed += " {readonly}";
  segments.push(typed);
  return segments.join(" ");
}

function formatOperation(op: Operation): string {
  const segments: string[] = [];
  if (op.abstract) segments.push("{abstract}");
  if (op.static) segments.push("{static}");
  const visibility = visibilityMarker(op.visibility);
  const params = (op.parameters ?? []).map(formatParameter).join(", ");
  let signature = visibility ? `${visibility}${op.name}` : op.name;
  signature += `(${params})`;
  if (op.returnType) signature += `: ${op.returnType}`;
  segments.push(signature);
  return segments.join(" ");
}

function formatParameter(param: OperationParameter): string {
  let text = param.name;
  if (param.type) text += `: ${param.type}`;
  if (param.default !== undefined && param.default !== "") text += ` = ${param.default}`;
  return text;
}

function visibilityMarker(visibility: Visibility | undefined): string {
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

const FORWARD_ARROWS: Record<EdgeKind, string | null> = {
  // Class — canonical forward forms. `<|--` and `..|>` parse identically
  // when reversed, so we always pick the forward arrow on output.
  inheritance: "--|>",
  realization: "..|>",
  composition: "*--",
  aggregation: "o--",
  dependency: "..>",
  association: "-->",
  // The other kinds belong to non-class diagrams; not used here.
  uses: null,
  "depends-on": null,
  "one-to-one": null,
  "one-to-many": null,
  "many-to-many": null,
  "sync-call": null,
  "async-call": null,
  return: null,
  create: null,
  destroy: null,
  "lost-message": null,
  "found-message": null,
};

function formatClassEdge(edge: DiagramEdge, aliases: Map<string, string>): string {
  const from = lookupAlias(aliases, edge.source);
  const to = lookupAlias(aliases, edge.target);
  const arrow = FORWARD_ARROWS[edge.kind] ?? "-->";
  const sourceMult = formatEndpointLiteral(edge.ends?.source);
  const targetMult = formatEndpointLiteral(edge.ends?.target);
  const labelSuffix = formatEdgeLabel(edge);
  const head = sourceMult ? `${from} ${sourceMult}` : from;
  const tail = targetMult ? `${targetMult} ${to}` : to;
  return `${head} ${arrow} ${tail}${labelSuffix}`;
}

function formatEndpointLiteral(end: EdgeEndpoint | undefined): string {
  if (!end?.multiplicity) return "";
  return `"${end.multiplicity}"`;
}

function formatEdgeLabel(edge: DiagramEdge): string {
  // Prefer per-end role names when the label is empty; PlantUML's `:` syntax
  // can only carry a single label, so combine roles into the form `srcRole / tgtRole`.
  const explicit = edge.label?.trim();
  if (explicit) return ` : ${explicit}`;
  const sourceRole = edge.ends?.source?.role?.trim();
  const targetRole = edge.ends?.target?.role?.trim();
  if (sourceRole && targetRole) return ` : ${sourceRole} / ${targetRole}`;
  if (targetRole) return ` : ${targetRole}`;
  if (sourceRole) return ` : ${sourceRole}`;
  return "";
}

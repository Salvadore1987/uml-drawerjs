import type { Diagram, DiagramEdge, DiagramNode, EdgeKind } from "../model/types.js";
import { lookupAlias, nodeAlias } from "./format.js";

/**
 * Render a class-diagram body. Node declarations are emitted in
 * `ast.nodes` order; edge arrows are picked deterministically from a
 * forward-arrow table keyed by `EdgeKind`, which matches the parser's
 * canonical mapping (so `<|--` parses to inheritance and gen always emits
 * `--|>` for inheritance — the round-trip normalises arrow direction).
 */
export function renderClass(diagram: Diagram, aliases: Map<string, string>): string[] {
  const lines: string[] = [];
  for (const node of diagram.nodes) {
    lines.push(formatClassNode(node, aliases));
  }
  for (const edge of diagram.edges) {
    lines.push(formatClassEdge(edge, aliases));
  }
  return lines;
}

function formatClassNode(node: DiagramNode, aliases: Map<string, string>): string {
  const alias = nodeAlias(aliases, node);
  const stereotype = node.stereotype ? ` <<${node.stereotype}>>` : "";
  switch (node.kind) {
    case "class":
      return `class ${alias}${stereotype}`;
    case "interface":
      return `interface ${alias}${stereotype}`;
    case "abstract-class":
      return `abstract class ${alias}${stereotype}`;
    case "enum":
      return `enum ${alias}${stereotype}`;
    default:
      // Class diagrams shouldn't see other kinds; emit `class` as a safe
      // fallback so the generator never throws on malformed AST.
      return `class ${alias}${stereotype}`;
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
};

function formatClassEdge(edge: DiagramEdge, aliases: Map<string, string>): string {
  const from = lookupAlias(aliases, edge.source);
  const to = lookupAlias(aliases, edge.target);
  const arrow = FORWARD_ARROWS[edge.kind] ?? "-->";
  const suffix = edge.label && edge.label.trim() !== "" ? ` : ${edge.label}` : "";
  return `${from} ${arrow} ${to}${suffix}`;
}

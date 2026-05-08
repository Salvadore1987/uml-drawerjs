import type { Diagram, DiagramEdge, DiagramNode, EdgeKind } from "../model/types.js";
import { escapeStringLiteral, lookupAlias, nodeAlias } from "./format.js";

/**
 * Render a sequence-diagram body. Participants come first (in `ast.nodes`
 * order so the parser's alias-allocation order matches), then messages.
 * If a node's `label` differs from its alias we emit the
 * `participant "Label" as alias` form so the visual label survives.
 */
export function renderSequence(diagram: Diagram, aliases: Map<string, string>): string[] {
  const lines: string[] = [];
  for (const node of diagram.nodes) {
    lines.push(formatParticipant(node, aliases));
  }
  for (const edge of diagram.edges) {
    lines.push(formatMessage(edge, aliases));
  }
  return lines;
}

function formatParticipant(node: DiagramNode, aliases: Map<string, string>): string {
  const alias = nodeAlias(aliases, node);
  const keyword = node.kind === "actor" ? "actor" : "participant";
  // Aliases derived from id (`n_id_1`) almost never match the human label
  // (`User`); emit the `"label" as alias` form so the rendered diagram
  // keeps the original label.
  if (node.label !== alias) {
    return `${keyword} "${escapeStringLiteral(node.label)}" as ${alias}`;
  }
  return `${keyword} ${alias}`;
}

const ARROW_BY_KIND: Partial<Record<EdgeKind, string>> = {
  "sync-call": "->",
  "async-call": "->>",
  return: "-->",
  create: "->",
  destroy: "->",
};

function formatMessage(edge: DiagramEdge, aliases: Map<string, string>): string {
  const from = lookupAlias(aliases, edge.source);
  const to = lookupAlias(aliases, edge.target);
  const arrow = ARROW_BY_KIND[edge.kind] ?? "->";
  const suffix = edge.label && edge.label.trim() !== "" ? ` : ${edge.label}` : "";
  return `${from} ${arrow} ${to}${suffix}`;
}

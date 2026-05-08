import type { Diagram, DiagramEdge, EdgeKind } from "../model/types.js";
import { lookupAlias, nodeAlias } from "./format.js";

/**
 * Render an Entity-Relationship diagram body. Crow's-foot relationships are
 * emitted using the canonical forward form picked by `EdgeKind`. The parser
 * accepts both directions of `one-to-many` (`||--o{` and `}o--||`); the
 * generator always emits `||--o{`, so a round-trip normalises direction.
 */
export function renderEr(diagram: Diagram, aliases: Map<string, string>): string[] {
  const lines: string[] = [];
  for (const node of diagram.nodes) {
    lines.push(`entity ${nodeAlias(aliases, node)}`);
  }
  for (const edge of diagram.edges) {
    lines.push(formatErEdge(edge, aliases));
  }
  return lines;
}

const FORWARD_ARROWS: Partial<Record<EdgeKind, string>> = {
  "one-to-one": "||--||",
  "one-to-many": "||--o{",
  "many-to-many": "}o--o{",
};

function formatErEdge(edge: DiagramEdge, aliases: Map<string, string>): string {
  const from = lookupAlias(aliases, edge.source);
  const to = lookupAlias(aliases, edge.target);
  const arrow = FORWARD_ARROWS[edge.kind] ?? "||--||";
  const suffix = edge.label && edge.label.trim() !== "" ? ` : ${edge.label}` : "";
  return `${from} ${arrow} ${to}${suffix}`;
}

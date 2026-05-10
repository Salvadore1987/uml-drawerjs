import type { Attribute, Diagram, DiagramEdge, EdgeKind } from "../model/types.js";
import { lookupAlias, nodeAlias } from "./format.js";

/**
 * Render an Entity-Relationship diagram body. When entities have attributes
 * the declaration expands to an `entity Foo { ... }` block; otherwise a
 * single-line `entity Foo` is emitted. Crow's-foot relationships are emitted
 * using the canonical forward form picked by `EdgeKind`. The parser accepts
 * both directions of `one-to-many` (`||--o{` and `}o--||`); the generator
 * always emits `||--o{`, so a round-trip normalises direction.
 */
export function renderEr(diagram: Diagram, aliases: Map<string, string>): string[] {
  const lines: string[] = [];
  for (const node of diagram.nodes) {
    const head = `entity ${nodeAlias(aliases, node)}`;
    const attrs = node.attributes ?? [];
    if (attrs.length === 0) {
      lines.push(head);
    } else {
      lines.push(`${head} {`);
      for (const attr of attrs) lines.push(`  ${formatErAttribute(attr)}`);
      lines.push("}");
    }
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

function formatErAttribute(attr: Attribute): string {
  // Prefix marker: `*` for primary key (implies NN), `+` for foreign key.
  // Both can apply (a column can be both PK and FK), but the line shape only
  // shows one prefix — PK wins (it implies non-null and is the dominant
  // marker visually).
  let line = "";
  if (attr.primaryKey) line += "* ";
  else if (attr.foreignKey) line += "+ ";
  line += attr.name;
  if (attr.type) line += ` : ${attr.type}`;
  if (attr.default !== undefined && attr.default !== "") line += ` = ${attr.default}`;
  // Only emit `<<NN>>` when not implied by PK. Both PK *and* FK still need
  // the marker if NN was explicitly set, but PK already forces non-null so
  // it's redundant there.
  if (attr.nullable === false && !attr.primaryKey) line += " <<NN>>";
  return line;
}

import type { DiagramEdge, DiagramNode, EdgeKind } from "../../model/types.js";
import { errorAtLine, SYNTAX_ERROR_CODES } from "../errors.js";
import type { ParseContext } from "../context.js";
import { freshId, resolveAlias } from "../context.js";
import type { SourceLine } from "../tokenizer.js";

/**
 * ER-diagram declarations: `entity Foo` plus crow's-foot relationship
 * arrows. The MVP recognises the four common cardinality combinations and
 * promotes them to canonical `EdgeKind` values.
 */

const ENTITY_DECL = /^entity\s+(\w+)(?:\s+as\s+\w+)?\s*\{?$/u;

interface CrowDescriptor {
  pattern: RegExp;
  kind: EdgeKind;
  cardinality: { source: string; target: string };
}

const RELS: CrowDescriptor[] = [
  {
    pattern: /^(\w+)\s+\|\|--\|\|\s+(\w+)(?:\s*:\s*(.+))?$/u,
    kind: "one-to-one",
    cardinality: { source: "1", target: "1" },
  },
  {
    pattern: /^(\w+)\s+\|\|--o\{\s+(\w+)(?:\s*:\s*(.+))?$/u,
    kind: "one-to-many",
    cardinality: { source: "1", target: "0..*" },
  },
  {
    pattern: /^(\w+)\s+\}o--\|\|\s+(\w+)(?:\s*:\s*(.+))?$/u,
    kind: "one-to-many",
    cardinality: { source: "0..*", target: "1" },
  },
  {
    pattern: /^(\w+)\s+\}o--o\{\s+(\w+)(?:\s*:\s*(.+))?$/u,
    kind: "many-to-many",
    cardinality: { source: "0..*", target: "0..*" },
  },
];

export function handleErLine(ctx: ParseContext, line: SourceLine): boolean {
  const text = line.text.trim();

  const decl = ENTITY_DECL.exec(text);
  if (decl?.[1]) {
    consumeEntityDecl(ctx, decl[1]);
    return true;
  }

  for (const rel of RELS) {
    const match = rel.pattern.exec(text);
    if (match) {
      consumeRel(ctx, line, match, rel);
      return true;
    }
  }

  if (text === "}") return true;
  return false;
}

function consumeEntityDecl(ctx: ParseContext, alias: string): void {
  const id = resolveAlias(ctx, alias, "create");
  if (id === null) return;
  const node: DiagramNode = { id, kind: "entity", label: alias };
  ctx.nodes.push(node);
}

function consumeRel(
  ctx: ParseContext,
  line: SourceLine,
  match: RegExpExecArray,
  descriptor: CrowDescriptor,
): void {
  const sourceAlias = match[1];
  const targetAlias = match[2];
  const label = match[3];
  if (!sourceAlias || !targetAlias) return;

  const sourceId = resolveAlias(ctx, sourceAlias, "lookup");
  const targetId = resolveAlias(ctx, targetAlias, "lookup");
  if (sourceId === null || targetId === null) {
    const missing = sourceId === null ? sourceAlias : targetAlias;
    ctx.errors.push(
      errorAtLine(
        SYNTAX_ERROR_CODES.UnknownReference,
        `ER relation references unknown entity '${missing}'`,
        line,
      ),
    );
    return;
  }

  const edge: DiagramEdge = {
    id: freshId(ctx),
    source: sourceId,
    target: targetId,
    kind: descriptor.kind,
    cardinality: { ...descriptor.cardinality },
  };
  if (label && label.trim() !== "") edge.label = label.trim();
  ctx.edges.push(edge);
}

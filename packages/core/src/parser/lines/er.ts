import type { DiagramEdge, DiagramNode, EdgeKind } from "../../model/types.js";
import { errorAtLine, SYNTAX_ERROR_CODES } from "../errors.js";
import type { ParseContext } from "../context.js";
import { freshId, resolveAlias } from "../context.js";
import type { SourceLine } from "../tokenizer.js";
import { handleEntityMember } from "./erMembers.js";

/**
 * ER-diagram declarations: `entity Foo` (with optional `{ ... }` body),
 * crow's-foot relationship arrows, and per-attribute primary/foreign-key
 * markers parsed from the body lines.
 */

const ENTITY_DECL = /^entity\s+(?:"([^"]+)"\s+as\s+(\w+)|(\w+))(?:\s+as\s+(\w+))?\s*(\{)?$/u;

interface CrowDescriptor {
  pattern: RegExp;
  kind: EdgeKind;
  /** Crow's-foot relations carry cardinality; UML ownership relations don't. */
  cardinality?: { source: string; target: string };
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
  // UML ownership relations between entities (no cardinality). Listed after the
  // crow's-foot forms so `}o--o{` etc. never fall through to the bare `o--`.
  {
    pattern: /^(\w+)\s+\*--\s+(\w+)(?:\s*:\s*(.+))?$/u,
    kind: "composition",
  },
  {
    pattern: /^(\w+)\s+o--\s+(\w+)(?:\s*:\s*(.+))?$/u,
    kind: "aggregation",
  },
];

export function handleErLine(ctx: ParseContext, line: SourceLine): boolean {
  const text = line.text.trim();

  // Closing brace pops an entity-body frame first; otherwise return true to
  // remain a no-op (legacy behaviour for unmatched `}`).
  if (text === "}") {
    if (ctx.openEntityStack.length > 0) {
      ctx.openEntityStack.pop();
      return true;
    }
    return true;
  }

  // While inside an entity body, route attribute lines to the member parser
  // before falling back to declaration / relationship patterns.
  if (ctx.openEntityStack.length > 0 && text !== "" && text !== "}") {
    if (handleEntityMember(ctx, text)) return true;
  }

  const decl = ENTITY_DECL.exec(text);
  if (decl) {
    consumeEntityDecl(ctx, decl);
    return true;
  }

  for (const rel of RELS) {
    const match = rel.pattern.exec(text);
    if (match) {
      consumeRel(ctx, line, match, rel);
      return true;
    }
  }

  return false;
}

function consumeEntityDecl(ctx: ParseContext, match: RegExpExecArray): void {
  const quotedLabel = match[1];
  const quotedAlias = match[2];
  const bareIdent = match[3];
  const trailingAlias = match[4];
  const openBrace = match[5];

  // Three accepted forms:
  //   entity "Customer Order" as customerOrder
  //   entity Customer
  //   entity Customer as customerAlias
  const alias = quotedAlias ?? trailingAlias ?? bareIdent;
  const label = quotedLabel ?? bareIdent;
  if (!alias || !label) return;

  const id = resolveAlias(ctx, alias, "create");
  if (id === null) return;
  const node: DiagramNode = { id, kind: "entity", label };
  // Keep the explicit alias so the generator re-emits the same
  // `"label" as alias` token across round-trips.
  if (quotedAlias !== undefined || trailingAlias !== undefined) node.alias = alias;
  ctx.nodes.push(node);

  if (openBrace !== undefined) {
    ctx.openEntityStack.push({ nodeId: id });
  }
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
  };
  if (descriptor.cardinality) edge.cardinality = { ...descriptor.cardinality };
  if (label && label.trim() !== "") edge.label = label.trim();
  ctx.edges.push(edge);
}

import type { DiagramEdge, EdgeKind, NodeKind } from "../../model/types.js";
import { errorAtLine, SYNTAX_ERROR_CODES } from "../errors.js";
import type { ParseContext } from "../context.js";
import { freshId, resolveAlias } from "../context.js";
import type { SourceLine } from "../tokenizer.js";

/**
 * Sequence-diagram declarations and message arrows. Activations / notes /
 * alt-opt-loop blocks remain unsupported in MVP and fall through to the
 * opaque bucket so generator round-trip stays lossless.
 */

const PARTICIPANT_DECL =
  /^(actor|participant|database|control|boundary|entity|collections|queue)\s+(?:"([^"]+)"|(\w+))(?:\s+as\s+(\w+))?$/u;

interface ArrowDescriptor {
  pattern: RegExp;
  kind: EdgeKind;
}

const ARROWS: ArrowDescriptor[] = [
  { pattern: /^(\w+)\s+->>\s+(\w+)\s*(?::\s*(.+))?$/u, kind: "async-call" },
  { pattern: /^(\w+)\s+-->\s+(\w+)\s*(?::\s*(.+))?$/u, kind: "return" },
  { pattern: /^(\w+)\s+->\s+(\w+)\s*(?::\s*(.+))?$/u, kind: "sync-call" },
];

export function handleSequenceLine(ctx: ParseContext, line: SourceLine): boolean {
  const text = line.text.trim();

  const decl = PARTICIPANT_DECL.exec(text);
  if (decl) {
    consumeParticipant(ctx, decl);
    return true;
  }

  for (const arrow of ARROWS) {
    const match = arrow.pattern.exec(text);
    if (match) {
      consumeArrow(ctx, line, match, arrow.kind);
      return true;
    }
  }

  return false;
}

function consumeParticipant(ctx: ParseContext, match: RegExpExecArray): void {
  const keyword = match[1];
  const quotedLabel = match[2];
  const ident = match[3];
  const aliasAfterAs = match[4];
  if (!keyword) return;

  const alias = aliasAfterAs ?? ident ?? quotedLabel;
  if (!alias) return;

  const label = quotedLabel ?? ident ?? alias;
  const kind: NodeKind = keyword === "actor" ? "actor" : "lifeline";
  const id = resolveAlias(ctx, alias, "create");
  if (id === null) return;
  ctx.nodes.push({ id, kind, label });
}

function consumeArrow(
  ctx: ParseContext,
  line: SourceLine,
  match: RegExpExecArray,
  kind: EdgeKind,
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
        `Message references unknown participant '${missing}'`,
        line,
      ),
    );
    return;
  }

  const edge: DiagramEdge = {
    id: freshId(ctx),
    source: sourceId,
    target: targetId,
    kind,
  };
  if (label && label.trim() !== "") edge.label = label.trim();
  ctx.edges.push(edge);
}

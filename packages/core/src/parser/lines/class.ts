import type { DiagramEdge, DiagramNode, EdgeKind, NodeKind } from "../../model/types.js";
import { errorAtLine, SYNTAX_ERROR_CODES } from "../errors.js";
import type { ParseContext } from "../context.js";
import { freshId, resolveAlias } from "../context.js";
import type { SourceLine } from "../tokenizer.js";

/**
 * Class-diagram declarations and relationship arrows. Members ({attributes}
 * / {operations}) inside `{ ... }` blocks are not yet modelled — they fall
 * through to the opaque bucket and are tracked for a follow-up.
 */

const NODE_DECL =
  /^(?:(abstract)\s+)?(class|interface|enum|abstract)\s+(\w+)(?:\s*<<\s*(\w+)\s*>>)?\s*\{?$/u;

const EDGE_LINE =
  /^(\w+)\s+("(?:[^"\\]|\\.)*"\s+)?(\.\.\|>|--\|>|\.\.>|\*--|o--|<\|--|<\|\.\.|<--|-->|<-\.|\.->|--|\.\.) ?\s*("(?:[^"\\]|\\.)*"\s+)?(\w+)(?:\s*:\s*(.+))?$/u;

interface ArrowDescriptor {
  kind: EdgeKind;
  /** When true, the arrow points "backwards" (left side declares the inheriting party). */
  reverse: boolean;
}

const ARROWS: Record<string, ArrowDescriptor> = {
  "-->": { kind: "association", reverse: false },
  "<--": { kind: "association", reverse: true },
  "--": { kind: "association", reverse: false },
  "..": { kind: "dependency", reverse: false },
  "..>": { kind: "dependency", reverse: false },
  "<..": { kind: "dependency", reverse: true },
  ".->": { kind: "dependency", reverse: false },
  "<-.": { kind: "dependency", reverse: true },
  "..|>": { kind: "realization", reverse: false },
  "<|..": { kind: "realization", reverse: true },
  "--|>": { kind: "inheritance", reverse: false },
  "<|--": { kind: "inheritance", reverse: true },
  "*--": { kind: "composition", reverse: false },
  "o--": { kind: "aggregation", reverse: false },
};

export function handleClassLine(ctx: ParseContext, line: SourceLine): boolean {
  const text = line.text.trim();

  const decl = NODE_DECL.exec(text);
  if (decl) {
    consumeNodeDecl(ctx, decl);
    return true;
  }

  const edge = EDGE_LINE.exec(text);
  if (edge) {
    consumeEdge(ctx, line, edge);
    return true;
  }

  // Members inside a `{ ... }` block — not modelled in MVP.
  if (text === "}") return true;

  return false;
}

function consumeNodeDecl(ctx: ParseContext, match: RegExpExecArray): void {
  const abstractMod = match[1];
  const keyword = match[2];
  const ident = match[3];
  const stereotype = match[4];
  if (!keyword || !ident) return;

  const kind: NodeKind =
    keyword === "interface"
      ? "interface"
      : keyword === "enum"
        ? "enum"
        : keyword === "abstract" || abstractMod !== undefined
          ? "abstract-class"
          : "class";

  const id = resolveAlias(ctx, ident, "create");
  if (id === null) return;
  const node: DiagramNode = { id, kind, label: ident };
  if (stereotype) node.stereotype = stereotype;
  ctx.nodes.push(node);
}

function consumeEdge(ctx: ParseContext, line: SourceLine, match: RegExpExecArray): void {
  const sourceAlias = match[1];
  const arrow = match[3];
  const targetAlias = match[5];
  const label = match[6];
  if (!sourceAlias || !arrow || !targetAlias) return;

  const descriptor = ARROWS[arrow];
  if (!descriptor) {
    ctx.errors.push(
      errorAtLine(SYNTAX_ERROR_CODES.Malformed, `Unsupported class-diagram arrow '${arrow}'`, line),
    );
    return;
  }

  const fromId = resolveAlias(ctx, descriptor.reverse ? targetAlias : sourceAlias, "lookup");
  const toId = resolveAlias(ctx, descriptor.reverse ? sourceAlias : targetAlias, "lookup");
  if (fromId === null || toId === null) {
    const missing =
      fromId === null
        ? descriptor.reverse
          ? targetAlias
          : sourceAlias
        : descriptor.reverse
          ? sourceAlias
          : targetAlias;
    ctx.errors.push(
      errorAtLine(
        SYNTAX_ERROR_CODES.UnknownReference,
        `Edge references unknown class '${missing}'`,
        line,
      ),
    );
    return;
  }

  const edge: DiagramEdge = {
    id: freshId(ctx),
    source: fromId,
    target: toId,
    kind: descriptor.kind,
  };
  if (label !== undefined && label.trim() !== "") edge.label = label.trim();
  ctx.edges.push(edge);
}

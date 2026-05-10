import type {
  DiagramEdge,
  DiagramGroup,
  DiagramNode,
  EdgeKind,
  NodeKind,
} from "../../model/types.js";
import { errorAtLine, SYNTAX_ERROR_CODES } from "../errors.js";
import type { ParseContext } from "../context.js";
import { freshId, resolveAlias } from "../context.js";
import type { SourceLine } from "../tokenizer.js";
import { applyGenerics, handleClassMember } from "./classMembers.js";

/**
 * Class-diagram declarations and relationship arrows. Member bodies
 * (`{ +balance: Decimal; +deposit(): void }`) are parsed by
 * `./classMembers.ts` while `ctx.openClassStack` is non-empty.
 */

const NODE_DECL =
  /^(?:(abstract)\s+)?(class|interface|enum|abstract)\s+(\w+)(?:\s*<\s*([^<>]+(?:<[^<>]*>[^<>]*)*)\s*>)?(?:\s*<<\s*([\w-]+)\s*>>)?(\s*\{)?$/u;

/**
 * UML package container. Authors write `package "com.bank" {` or
 * `package com.bank {`; both forms are accepted. Nested packages are
 * supported via the same `openGroupStack` machinery used for C4 boundaries.
 */
const PACKAGE_DECL = /^package\s+(?:"([^"]+)"|(\S+))(?:\s*<<[\w-]+>>)?\s*\{$/u;

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

  // Closing brace pops a class-body frame first; otherwise pops a
  // package group frame from the shared `openGroupStack`.
  if (text === "}") {
    if (ctx.openClassStack.length > 0) {
      ctx.openClassStack.pop();
      return true;
    }
    if (ctx.openGroupStack.length > 0) {
      ctx.openGroupStack.pop();
      return true;
    }
    return false;
  }

  const pkg = PACKAGE_DECL.exec(text);
  if (pkg) {
    consumePackage(ctx, pkg);
    return true;
  }

  // While inside a class body, route attribute / operation / enum-literal
  // lines to the member parser before falling back to declaration / edge
  // patterns. This keeps `class Foo {  bar: Bar  }` from being mis-parsed
  // as another node declaration.
  if (ctx.openClassStack.length > 0 && text !== "" && text !== "}") {
    if (handleClassMember(ctx, text)) return true;
  }

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

  return false;
}

function consumePackage(ctx: ParseContext, match: RegExpExecArray): void {
  const quoted = match[1];
  const bare = match[2];
  const label = quoted ?? bare;
  if (!label) return;
  const id = freshId(ctx);
  const group: DiagramGroup = {
    id,
    kind: "package",
    label,
    children: [],
  };
  if (bare && /^[A-Za-z0-9_.]+$/u.test(bare)) {
    group.alias = bare;
  }
  ctx.groups.push(group);

  // Nested package: register itself as a child of the enclosing group
  // (boundary or package) before pushing onto the stack.
  const top = ctx.openGroupStack[ctx.openGroupStack.length - 1];
  if (top !== undefined) {
    const parent = ctx.groups.find((g) => g.id === top);
    if (parent) parent.children.push(id);
  }
  ctx.openGroupStack.push(id);
}

function consumeNodeDecl(ctx: ParseContext, match: RegExpExecArray): void {
  const abstractMod = match[1];
  const keyword = match[2];
  const ident = match[3];
  const generics = match[4];
  const stereotype = match[5];
  const openBrace = match[6];
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
  applyGenerics(node, generics);
  ctx.nodes.push(node);

  // Attach to the innermost open package group so `package com.bank { class
  // Account }` reflects containment in the AST.
  const top = ctx.openGroupStack[ctx.openGroupStack.length - 1];
  if (top !== undefined) {
    const parent = ctx.groups.find((g) => g.id === top);
    if (parent) parent.children.push(id);
  }

  if (openBrace !== undefined) {
    ctx.openClassStack.push({ nodeId: id, kind });
  }
}

function consumeEdge(ctx: ParseContext, line: SourceLine, match: RegExpExecArray): void {
  const sourceAlias = match[1];
  const sourceMultRaw = match[2];
  const arrow = match[3];
  const targetMultRaw = match[4];
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

  // Per-end multiplicity strings (`Foo "1" *-- "0..*" Bar`). Swap source /
  // target when the arrow was reversed so the AST reflects the *forward*
  // direction (matches generator's canonical-arrow output).
  const rawSource = descriptor.reverse ? targetMultRaw : sourceMultRaw;
  const rawTarget = descriptor.reverse ? sourceMultRaw : targetMultRaw;
  const sourceMult = unquoteMultiplicity(rawSource);
  const targetMult = unquoteMultiplicity(rawTarget);
  if (sourceMult !== undefined || targetMult !== undefined) {
    edge.ends = {};
    if (sourceMult !== undefined) edge.ends.source = { multiplicity: sourceMult };
    if (targetMult !== undefined) edge.ends.target = { multiplicity: targetMult };
  }

  ctx.edges.push(edge);
}

function unquoteMultiplicity(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const match = /^"((?:[^"\\]|\\.)*)"$/u.exec(trimmed);
  if (!match) return undefined;
  return match[1];
}

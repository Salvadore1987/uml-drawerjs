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
import { handleClassMember } from "./classMembers.js";

/**
 * Class-diagram declarations and relationship arrows. Member bodies
 * (`{ +balance: Decimal; +deposit(): void }`) are parsed by
 * `./classMembers.ts` while `ctx.openClassStack` is non-empty.
 */

// Accepts three name forms, mirroring the ER `entity` grammar:
//   class Account                       → label = alias = "Account"
//   class "New Class" as n_abc          → label "New Class", alias "n_abc"
//   class Account as acc                → label "Account", alias "acc"
// The quoted `"label" as alias` form is what lets class names that aren't
// bare `\w+` identifiers (spaces, punctuation) round-trip instead of
// collapsing to a generated alias.
const NODE_DECL =
  /^(?:(abstract)\s+)?(class|interface|enum|abstract)\s+(?:"([^"]+)"\s+as\s+(\w+)|(\w+))(?:\s+as\s+(\w+))?(?:\s*<\s*([^<>]+(?:<[^<>]*>[^<>]*)*)\s*>)?(?:\s*<<\s*([^<>]+?)\s*>>)?(\s*\{)?$/u;

/**
 * UML package container. Authors write `package "com.bank" {` or
 * `package com.bank {`; both forms are accepted. Nested packages are
 * supported via the same `openGroupStack` machinery used for C4 boundaries.
 */
const PACKAGE_DECL = /^package\s+(?:"([^"]+)"|(\S+))(?:\s+as\s+(\w+))?(?:\s*<<[^<>]+>>)?\s*\{$/u;

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
  const explicitAlias = match[3];
  const label = quoted ?? bare;
  if (!label) return;
  // Prefer the explicit `as alias`; otherwise reuse a bare identifier label
  // as the alias. Registering the alias via `resolveAlias` is what lets
  // `finalize` remap an alias-keyed `layoutOverrides` entry back onto this
  // group's fresh id — without it a resized package loses its size/position
  // on every re-parse.
  const alias = explicitAlias ?? (bare && /^[A-Za-z0-9_.]+$/u.test(bare) ? bare : undefined);
  const id = alias ? resolveAlias(ctx, alias, "create") : freshId(ctx);
  if (id === null) return;
  const group: DiagramGroup = {
    id,
    kind: "package",
    label,
    children: [],
  };
  if (alias) {
    group.alias = alias;
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
  const quotedLabel = match[3];
  const quotedAlias = match[4];
  const bareIdent = match[5];
  const trailingAlias = match[6];
  // match[7] is the legacy class-level generics capture (e.g. `class Box<T>`).
  // Generics are no longer modelled — the group stays in NODE_DECL so old
  // declarations still parse, but the captured value is ignored.
  const stereotype = match[8];
  const openBrace = match[9];
  if (!keyword) return;

  // `"label" as alias` and `bare as alias` carry an explicit alias; the
  // plain `bare` form uses the identifier as both label and alias.
  const alias = quotedAlias ?? trailingAlias ?? bareIdent;
  const label = quotedLabel ?? bareIdent;
  if (!alias || !label) return;

  const kind: NodeKind =
    keyword === "interface"
      ? "interface"
      : keyword === "enum"
        ? "enum"
        : keyword === "abstract" || abstractMod !== undefined
          ? "abstract-class"
          : "class";

  const id = resolveAlias(ctx, alias, "create");
  if (id === null) return;
  const node: DiagramNode = { id, kind, label };
  // Persist the explicit alias so the generator can re-emit the same
  // `"label" as alias` token (keeps the alias stable across round-trips).
  if (quotedAlias !== undefined || trailingAlias !== undefined) node.alias = alias;
  if (stereotype) node.stereotype = stereotype;
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

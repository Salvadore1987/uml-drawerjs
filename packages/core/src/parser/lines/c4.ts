import type { DiagramEdge, DiagramNode, NodeKind } from "../../model/types.js";
import { errorAtLine, SYNTAX_ERROR_CODES } from "../errors.js";
import type { ParseContext } from "../context.js";
import { freshId, resolveAlias } from "../context.js";
import type { SourceLine } from "../tokenizer.js";

/**
 * Pattern matchers for the supported C4 macros (Person / System / Container
 * / Component / their _Ext + Db variants + Boundary + Rel*).
 *
 * The grammar is deliberately narrow: each macro must be a single line with
 * its arguments as quoted strings. Anything outside this shape falls through
 * to the opaque-line bucket so the original text round-trips unchanged.
 */

interface NodeMacroSpec {
  pattern: RegExp;
  kind: NodeKind;
  /** Names of capture groups in order. Maps to fields on `DiagramNode`. */
  shape: NodeMacroShape;
}

type NodeMacroShape = "personLike" | "containerLike";

const NODE_MACROS: NodeMacroSpec[] = [
  // Person / Person_Ext: (alias, "label", "description"?)
  // Person_Ext is matched BEFORE Person so the longer prefix wins.
  {
    pattern: /^Person_Ext\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "person-external",
    shape: "personLike",
  },
  {
    pattern: /^Person\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "person",
    shape: "personLike",
  },
  // System variants — Db / Queue first (longer prefixes win), then plain.
  // (alias, "label", "description"?) — no tech on Context tier.
  {
    pattern: /^SystemDb_Ext\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "database",
    shape: "personLike",
  },
  {
    pattern: /^SystemDb\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "database",
    shape: "personLike",
  },
  {
    pattern: /^SystemQueue_Ext\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "queue",
    shape: "personLike",
  },
  {
    pattern: /^SystemQueue\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "queue",
    shape: "personLike",
  },
  {
    pattern: /^System_Ext\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "system-external",
    shape: "personLike",
  },
  {
    pattern: /^System\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "system",
    shape: "personLike",
  },
  // Container variants — Db / Queue first, then plain.
  // (alias, "label", "tech"?, "description"?)
  {
    pattern:
      /^ContainerDb_Ext\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "database",
    shape: "containerLike",
  },
  {
    pattern:
      /^ContainerDb\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "database",
    shape: "containerLike",
  },
  {
    pattern:
      /^ContainerQueue_Ext\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "queue",
    shape: "containerLike",
  },
  {
    pattern:
      /^ContainerQueue\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "queue",
    shape: "containerLike",
  },
  // Container_Ext is matched BEFORE Container so the longer prefix wins.
  {
    pattern:
      /^Container_Ext\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "container-external",
    shape: "containerLike",
  },
  {
    pattern:
      /^Container\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "container",
    shape: "containerLike",
  },
  // Component / ComponentDb: (alias, "label", "tech"?, "description"?)
  {
    pattern:
      /^ComponentDb\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "database",
    shape: "containerLike",
  },
  {
    pattern:
      /^ComponentQueue\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "queue",
    shape: "containerLike",
  },
  {
    pattern:
      /^Component\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "component",
    shape: "containerLike",
  },
];

const BOUNDARY =
  /^(?:System_Boundary|Enterprise_Boundary|Boundary)\(\s*(\w+)\s*,\s*"([^"]*)"\s*\)\s*\{?$/u;
const REL = /^Rel(?:_[UDLR])?\(\s*(\w+)\s*,\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?\s*\)$/u;

export function handleC4Line(ctx: ParseContext, line: SourceLine): boolean {
  const text = line.text.trim();

  for (const spec of NODE_MACROS) {
    const match = spec.pattern.exec(text);
    if (match) {
      consumeNodeMacro(ctx, line, match, spec);
      return true;
    }
  }

  const boundaryMatch = BOUNDARY.exec(text);
  if (boundaryMatch) {
    consumeBoundary(ctx, boundaryMatch);
    return true;
  }

  const relMatch = REL.exec(text);
  if (relMatch) {
    consumeRel(ctx, line, relMatch);
    return true;
  }

  // Closing brace of a Boundary block — not modelled in MVP. Mark consumed
  // so it stays out of the opaque bucket.
  if (text === "}") return true;

  return false;
}

function consumeNodeMacro(
  ctx: ParseContext,
  _line: SourceLine,
  match: RegExpExecArray,
  spec: NodeMacroSpec,
): void {
  const alias = match[1];
  const label = match[2];
  if (alias === undefined || label === undefined) return;
  const id = resolveAlias(ctx, alias, "create");
  if (id === null) return;

  const node: DiagramNode = { id, kind: spec.kind, label };
  if (spec.shape === "personLike") {
    const description = match[3];
    if (description !== undefined && description !== "") node.description = description;
  } else {
    const tech = match[3];
    const description = match[4];
    if (tech !== undefined && tech !== "") node.technology = tech;
    if (description !== undefined && description !== "") node.description = description;
  }
  ctx.nodes.push(node);
}

function consumeBoundary(ctx: ParseContext, match: RegExpExecArray): void {
  const alias = match[1];
  const label = match[2];
  if (alias === undefined || label === undefined) return;
  const id = resolveAlias(ctx, alias, "create");
  if (id === null) return;
  ctx.groups.push({ id, kind: "boundary", label, children: [] });
}

function consumeRel(ctx: ParseContext, line: SourceLine, match: RegExpExecArray): void {
  const fromAlias = match[1];
  const toAlias = match[2];
  const label = match[3];
  const tech = match[4];
  if (fromAlias === undefined || toAlias === undefined || label === undefined) return;

  const sourceId = resolveAlias(ctx, fromAlias, "lookup");
  const targetId = resolveAlias(ctx, toAlias, "lookup");
  if (sourceId === null || targetId === null) {
    const missing = sourceId === null ? fromAlias : toAlias;
    ctx.errors.push(
      errorAtLine(
        SYNTAX_ERROR_CODES.UnknownReference,
        `Rel references unknown alias '${missing}'`,
        line,
      ),
    );
    return;
  }

  const edge: DiagramEdge = {
    id: freshId(ctx),
    source: sourceId,
    target: targetId,
    kind: "uses",
  };
  // Technology rides as a `[tech]` suffix on the label until we expose a
  // dedicated field on `DiagramEdge`. Tracked in ADR-0003.
  if (tech !== undefined && tech !== "") {
    edge.label = label === "" ? `[${tech}]` : `${label} [${tech}]`;
  } else if (label !== "") {
    edge.label = label;
  }
  ctx.edges.push(edge);
}

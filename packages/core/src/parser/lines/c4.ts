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
  // Component variants — Db / Queue (+ _Ext) first so the longer
  // prefixes win, then Component_Ext, then plain Component.
  // (alias, "label", "tech"?, "description"?)
  {
    pattern:
      /^ComponentDb_Ext\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "database",
    shape: "containerLike",
  },
  {
    pattern:
      /^ComponentDb\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "database",
    shape: "containerLike",
  },
  {
    pattern:
      /^ComponentQueue_Ext\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "queue",
    shape: "containerLike",
  },
  {
    pattern:
      /^ComponentQueue\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "queue",
    shape: "containerLike",
  },
  // Component_Ext is matched BEFORE Component so the longer prefix wins.
  {
    pattern:
      /^Component_Ext\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?(?:\s*,\s*"([^"]*)")?\s*\)$/u,
    kind: "component-external",
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
  /^(?:System_Boundary|Enterprise_Boundary|Container_Boundary|Boundary)\(\s*(\w+)\s*,\s*"([^"]*)"\s*\)\s*\{?$/u;
const REL =
  /^Rel(?:_[UDLR])?\(\s*(\w+)\s*,\s*(\w+)(?:\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?)?\s*\)$/u;

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

  // Closing brace of a Boundary block. Pop the open-group stack so any
  // following macros land at the parent scope (or top-level).
  if (text === "}") {
    if (ctx.openGroupStack.length > 0) ctx.openGroupStack.pop();
    return true;
  }

  return false;
}

/**
 * Auto-attach a freshly-created node id to the innermost open boundary,
 * if any. Called by `consumeNodeMacro` after pushing into `ctx.nodes`.
 */
function attachToOpenGroup(ctx: ParseContext, childId: string): void {
  const top = ctx.openGroupStack[ctx.openGroupStack.length - 1];
  if (!top) return;
  const group = ctx.groups.find((g) => g.id === top);
  if (!group) return;
  group.children.push(childId);
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

  // Persist the original PlantUML alias on the node so the generator can
  // round-trip authored names (`Person(customer, ...)` survives instead of
  // collapsing to `Person(Customer, ...)` or `Person(n_<uuid>, ...)`).
  const node: DiagramNode = { id, kind: spec.kind, label, alias };
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
  attachToOpenGroup(ctx, id);
}

function consumeBoundary(ctx: ParseContext, match: RegExpExecArray): void {
  const alias = match[1];
  const label = match[2];
  if (alias === undefined || label === undefined) return;
  const id = resolveAlias(ctx, alias, "create");
  if (id === null) return;
  // Preserve the original PlantUML alias on the group so generator
  // output round-trips with the same symbolic name (and the props
  // panel can edit it).
  ctx.groups.push({ id, kind: "boundary", label, alias, children: [] });
  // Nested boundary: register itself as a child of the enclosing group
  // before pushing onto the stack, so `parent.children` matches the
  // visual containment.
  attachToOpenGroup(ctx, id);
  ctx.openGroupStack.push(id);
}

function consumeRel(ctx: ParseContext, line: SourceLine, match: RegExpExecArray): void {
  const fromAlias = match[1];
  const toAlias = match[2];
  // Both `label` and `tech` are optional now — the new grammar accepts
  // `Rel(a, b)` (no third arg) as well as `Rel(a, b, "label", "tech"?)`.
  const label = match[3] ?? "";
  const tech = match[4];
  if (fromAlias === undefined || toAlias === undefined) return;

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
  // `label` is the action name (verb phrase); `tech` the relationship
  // technology — each maps to its own field on `DiagramEdge`.
  if (label !== "") {
    edge.label = label;
  }
  if (tech !== undefined && tech !== "") {
    edge.technology = tech;
  }
  ctx.edges.push(edge);
}

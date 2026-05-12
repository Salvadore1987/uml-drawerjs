import type {
  CombinedFragment,
  DiagramEdge,
  DiagramNode,
  EdgeKind,
  FragmentKind,
  FragmentOperand,
  NodeKind,
  SequenceDivider,
  SequenceNote,
} from "../../model/types.js";
import { errorAtLine, SYNTAX_ERROR_CODES } from "../errors.js";
import type { ParseContext } from "../context.js";
import { freshId, resolveAlias } from "../context.js";
import type { SourceLine } from "../tokenizer.js";

/**
 * Sequence-diagram grammar. Covers the canonical UML / PlantUML subset:
 * lifeline declarations with stereotype keywords, message arrows (sync /
 * async / return / create / destroy with `**` / `!!` shortcuts and
 * `++` / `--` activation shortcuts), explicit `activate` / `deactivate`,
 * single- and multi-line notes (`note left|right of X` / `note over A, B`),
 * combined fragments (`alt` / `else` / `opt` / `loop` / `par` / `break` /
 * `critical` / `ref over X, Y`), `==dividers==`, and `autonumber`.
 */

const PARTICIPANT_DECL =
  /^(actor|participant|database|control|boundary|entity|collections|queue)\s+(?:"([^"]+)"|(\w+))(?:\s+as\s+(\w+))?$/u;

const LIFELINE_KIND_MAP: Record<string, NodeKind> = {
  participant: "lifeline",
  actor: "actor",
  boundary: "lifeline-boundary",
  control: "lifeline-control",
  entity: "lifeline-entity",
  database: "database",
  queue: "queue",
  collections: "lifeline-collections",
};

interface ArrowDescriptor {
  pattern: RegExp;
  kind: EdgeKind;
}

// `**` (create) / `!!` (destroy) override the kind; `++` / `--` set
// activation flags. The trailing modifier is captured separately so each
// arrow descriptor only needs to know its base kind.
const ARROWS: ArrowDescriptor[] = [
  {
    pattern: /^(\w+)\s+->>\s+(\w+)\s*(\+\+|--|\*\*|!!)?\s*(?::\s*(.+))?$/u,
    kind: "async-call",
  },
  {
    pattern: /^(\w+)\s+-->\s+(\w+)\s*(\+\+|--|\*\*|!!)?\s*(?::\s*(.+))?$/u,
    kind: "return",
  },
  {
    pattern: /^(\w+)\s+->\s+(\w+)\s*(\+\+|--|\*\*|!!)?\s*(?::\s*(.+))?$/u,
    kind: "sync-call",
  },
];

const ACTIVATE = /^activate\s+(\w+)\s*$/u;
const DEACTIVATE = /^deactivate\s+(\w+)\s*$/u;

// Found / lost messages: arrow originates from / ends at "outside the
// diagram", drawn as a filled circle endpoint. Encoded with a single
// real participant — the AST stores the same id on both `source` and
// `target` and the renderer reinterprets based on `kind`.
const FOUND_MESSAGE = /^\[->\s*(\w+)\s*(?::\s*(.+))?$/u;
const LOST_MESSAGE = /^(\w+)\s*->\]\s*(?::\s*(.+))?$/u;

const NOTE_LR_INLINE = /^note\s+(left|right)\s+of\s+(\w+)\s*:\s*(.+)$/iu;
const NOTE_OVER_INLINE = /^note\s+over\s+(\w+(?:\s*,\s*\w+)?)\s*:\s*(.+)$/iu;
const NOTE_LR_OPEN = /^note\s+(left|right)\s+of\s+(\w+)\s*$/iu;
const NOTE_OVER_OPEN = /^note\s+over\s+(\w+(?:\s*,\s*\w+)?)\s*$/iu;
const NOTE_END = /^end\s*note\s*$/iu;

const FRAGMENT_OPEN = /^(alt|opt|loop|par|break|critical)(?:\s+(.+))?$/iu;
const FRAGMENT_REF = /^ref\s+over\s+(\w+(?:\s*,\s*\w+)*)(?:\s*:\s*(.+))?$/iu;
const FRAGMENT_ELSE = /^else(?:\s+(.+))?$/iu;
const FRAGMENT_END = /^end\s*$/iu;

const DIVIDER = /^==\s*(.+?)\s*==$/u;
const AUTONUMBER = /^autonumber(?:\s+stop|\s+(\d+)(?:\s+(\d+))?(?:\s+"([^"]+)")?)?\s*$/iu;
const CREATE = /^create\s+(\w+)\s*$/u;
const DESTROY = /^destroy\s+(\w+)\s*$/u;

export function handleSequenceLine(ctx: ParseContext, line: SourceLine): boolean {
  const text = line.text.trim();

  // Multi-line note body — accumulate until `end note`.
  const topNote = ctx.openNoteStack[ctx.openNoteStack.length - 1];
  if (topNote) {
    if (NOTE_END.test(text)) {
      const note = ctx.notes.find((n) => n.id === topNote.noteId);
      if (note) note.text = topNote.lines.join("\n");
      ctx.openNoteStack.pop();
      return true;
    }
    topNote.lines.push(text);
    return true;
  }

  if (consumeAutoNumber(ctx, text)) return true;

  const decl = PARTICIPANT_DECL.exec(text);
  if (decl) {
    consumeParticipant(ctx, decl);
    return true;
  }

  if (consumeFragment(ctx, line, text)) return true;
  if (consumeNote(ctx, line, text)) return true;
  if (consumeDivider(ctx, text)) return true;
  if (consumeActivation(ctx, line, text)) return true;
  if (consumeFoundOrLost(ctx, line, text)) return true;
  if (consumeCreateOrDestroyKeyword(ctx, text)) return true;

  for (const arrow of ARROWS) {
    const match = arrow.pattern.exec(text);
    if (match) {
      consumeArrow(ctx, line, match, arrow.kind);
      return true;
    }
  }

  return false;
}

function consumeAutoNumber(ctx: ParseContext, text: string): boolean {
  const match = AUTONUMBER.exec(text);
  if (!match) return false;
  // `autonumber stop` resets the metadata.
  if (/\bstop\b/iu.test(text)) {
    ctx.sequenceAutoNumber = null;
    return true;
  }
  const start = match[1] ? Number.parseInt(match[1], 10) : 1;
  const increment = match[2] ? Number.parseInt(match[2], 10) : 1;
  const format = match[3];
  ctx.sequenceAutoNumber = format ? { start, increment, format } : { start, increment };
  return true;
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
  const kind = LIFELINE_KIND_MAP[keyword] ?? "lifeline";
  const id = resolveAlias(ctx, alias, "create");
  if (id === null) return;
  // Persist the original `as`-alias (or bare identifier) so the generator
  // round-trips `participant "Web App" as web` instead of regenerating the
  // alias from the label.
  const node: DiagramNode = { id, kind, label, alias };
  ctx.nodes.push(node);
}

function consumeFragment(ctx: ParseContext, line: SourceLine, text: string): boolean {
  // `ref` is the only fragment kind that's a single-line declaration with
  // no body — emit it directly.
  const refMatch = FRAGMENT_REF.exec(text);
  if (refMatch) {
    const label = refMatch[2]?.trim();
    const fragment: CombinedFragment = {
      id: freshId(ctx),
      kind: "ref",
      operands: [{ id: freshId(ctx), edges: [] }],
    };
    if (label) fragment.label = label;
    attachFragment(ctx, fragment);
    return true;
  }

  const openMatch = FRAGMENT_OPEN.exec(text);
  if (openMatch && openMatch[1]) {
    const kind = openMatch[1].toLowerCase() as FragmentKind;
    const guardOrLabel = openMatch[2]?.trim();
    const operand: FragmentOperand = { id: freshId(ctx), edges: [] };
    if (guardOrLabel) operand.guard = guardOrLabel;
    const fragment: CombinedFragment = {
      id: freshId(ctx),
      kind,
      operands: [operand],
    };
    attachFragment(ctx, fragment);
    ctx.openFragmentStack.push({
      fragmentId: fragment.id,
      currentOperandId: operand.id,
    });
    return true;
  }

  const elseMatch = FRAGMENT_ELSE.exec(text);
  if (elseMatch) {
    const top = ctx.openFragmentStack[ctx.openFragmentStack.length - 1];
    if (!top) {
      ctx.errors.push(
        errorAtLine(
          SYNTAX_ERROR_CODES.Malformed,
          "`else` outside of an `alt`/`par` fragment",
          line,
        ),
      );
      return true;
    }
    const fragment = ctx.fragments.find((f) => f.id === top.fragmentId);
    if (fragment) {
      const guard = elseMatch[1]?.trim();
      const operand: FragmentOperand = { id: freshId(ctx), edges: [] };
      if (guard) operand.guard = guard;
      fragment.operands.push(operand);
      top.currentOperandId = operand.id;
    }
    return true;
  }

  if (FRAGMENT_END.test(text) && ctx.openFragmentStack.length > 0) {
    ctx.openFragmentStack.pop();
    return true;
  }

  return false;
}

function attachFragment(ctx: ParseContext, fragment: CombinedFragment): void {
  const parentFrame = ctx.openFragmentStack[ctx.openFragmentStack.length - 1];
  if (parentFrame) {
    fragment.parentId = parentFrame.fragmentId;
    fragment.parentOperandId = parentFrame.currentOperandId;
  }
  ctx.fragments.push(fragment);
}

function consumeNote(ctx: ParseContext, line: SourceLine, text: string): boolean {
  const lr = NOTE_LR_INLINE.exec(text);
  if (lr) {
    const placement = lr[1]?.toLowerCase() as "left" | "right";
    const target = lr[2];
    const noteText = lr[3];
    if (!target || !noteText) return true;
    const targetId = resolveAlias(ctx, target, "lookup");
    if (targetId === null) {
      reportUnknownParticipant(ctx, line, target);
      return true;
    }
    const note: SequenceNote = {
      id: freshId(ctx),
      placement,
      participants: [targetId],
      text: noteText.trim(),
    };
    if (ctx.lastEdgeId) note.anchorEdgeId = ctx.lastEdgeId;
    ctx.notes.push(note);
    return true;
  }

  const over = NOTE_OVER_INLINE.exec(text);
  if (over) {
    const participants = parseParticipantList(ctx, line, over[1]);
    const noteText = over[2];
    if (!participants || !noteText) return true;
    const note: SequenceNote = {
      id: freshId(ctx),
      placement: "over",
      participants,
      text: noteText.trim(),
    };
    if (ctx.lastEdgeId) note.anchorEdgeId = ctx.lastEdgeId;
    ctx.notes.push(note);
    return true;
  }

  const lrOpen = NOTE_LR_OPEN.exec(text);
  if (lrOpen) {
    const placement = lrOpen[1]?.toLowerCase() as "left" | "right";
    const target = lrOpen[2];
    if (!target) return true;
    const targetId = resolveAlias(ctx, target, "lookup");
    if (targetId === null) {
      reportUnknownParticipant(ctx, line, target);
      return true;
    }
    const note: SequenceNote = {
      id: freshId(ctx),
      placement,
      participants: [targetId],
      text: "",
    };
    if (ctx.lastEdgeId) note.anchorEdgeId = ctx.lastEdgeId;
    ctx.notes.push(note);
    ctx.openNoteStack.push({ noteId: note.id, lines: [] });
    return true;
  }

  const overOpen = NOTE_OVER_OPEN.exec(text);
  if (overOpen) {
    const participants = parseParticipantList(ctx, line, overOpen[1]);
    if (!participants) return true;
    const note: SequenceNote = {
      id: freshId(ctx),
      placement: "over",
      participants,
      text: "",
    };
    if (ctx.lastEdgeId) note.anchorEdgeId = ctx.lastEdgeId;
    ctx.notes.push(note);
    ctx.openNoteStack.push({ noteId: note.id, lines: [] });
    return true;
  }

  return false;
}

function parseParticipantList(
  ctx: ParseContext,
  line: SourceLine,
  raw: string | undefined,
): string[] | null {
  if (!raw) return null;
  const tokens = raw.split(/\s*,\s*/u).filter(Boolean);
  const ids: string[] = [];
  for (const token of tokens) {
    const id = resolveAlias(ctx, token, "lookup");
    if (id === null) {
      reportUnknownParticipant(ctx, line, token);
      return null;
    }
    ids.push(id);
  }
  return ids;
}

function consumeDivider(ctx: ParseContext, text: string): boolean {
  const match = DIVIDER.exec(text);
  if (!match || !match[1]) return false;
  const divider: SequenceDivider = {
    id: freshId(ctx),
    label: match[1].trim(),
  };
  if (ctx.lastEdgeId) divider.afterEdgeId = ctx.lastEdgeId;
  ctx.dividers.push(divider);
  return true;
}

function consumeActivation(ctx: ParseContext, line: SourceLine, text: string): boolean {
  const activate = ACTIVATE.exec(text);
  if (activate) {
    const alias = activate[1];
    if (!alias) return true;
    const nodeId = resolveAlias(ctx, alias, "lookup");
    if (nodeId === null) {
      reportUnknownParticipant(ctx, line, alias);
      return true;
    }
    openActivation(ctx, nodeId);
    return true;
  }

  const deactivate = DEACTIVATE.exec(text);
  if (deactivate) {
    const alias = deactivate[1];
    if (!alias) return true;
    const nodeId = resolveAlias(ctx, alias, "lookup");
    if (nodeId === null) {
      reportUnknownParticipant(ctx, line, alias);
      return true;
    }
    closeActivation(ctx, nodeId);
    return true;
  }

  return false;
}

function consumeFoundOrLost(ctx: ParseContext, line: SourceLine, text: string): boolean {
  const found = FOUND_MESSAGE.exec(text);
  if (found) {
    const target = found[1];
    const label = found[2];
    if (!target) return true;
    const targetId = resolveAlias(ctx, target, "lookup");
    if (targetId === null) {
      reportUnknownParticipant(ctx, line, target);
      return true;
    }
    pushSyntheticEdge(ctx, "found-message", targetId, label);
    return true;
  }
  const lost = LOST_MESSAGE.exec(text);
  if (lost) {
    const source = lost[1];
    const label = lost[2];
    if (!source) return true;
    const sourceId = resolveAlias(ctx, source, "lookup");
    if (sourceId === null) {
      reportUnknownParticipant(ctx, line, source);
      return true;
    }
    pushSyntheticEdge(ctx, "lost-message", sourceId, label);
    return true;
  }
  return false;
}

function pushSyntheticEdge(
  ctx: ParseContext,
  kind: "found-message" | "lost-message",
  participantId: string,
  label: string | undefined,
): void {
  // Found / lost encode "outside the diagram" as the same participant on
  // both ends. The renderer detects the kind and draws a filled-circle
  // endpoint instead of a second lifeline column.
  const edge: DiagramEdge = {
    id: freshId(ctx),
    source: participantId,
    target: participantId,
    kind,
  };
  if (label && label.trim() !== "") edge.label = label.trim();
  ctx.edges.push(edge);
  ctx.lastEdgeId = edge.id;

  const top = ctx.openFragmentStack[ctx.openFragmentStack.length - 1];
  if (top) {
    const fragment = ctx.fragments.find((f) => f.id === top.fragmentId);
    const operand = fragment?.operands.find((o) => o.id === top.currentOperandId);
    operand?.edges.push(edge.id);
  }
}

function consumeCreateOrDestroyKeyword(_ctx: ParseContext, text: string): boolean {
  // Standalone `create X` / `destroy X` lines: parsed and dropped — the
  // shortcut form `A -> B **` / `!!` is the round-trip path. This keeps
  // the AST loss-free for the canonical syntax we emit.
  if (CREATE.test(text) || DESTROY.test(text)) {
    return true;
  }
  return false;
}

function consumeArrow(
  ctx: ParseContext,
  line: SourceLine,
  match: RegExpExecArray,
  baseKind: EdgeKind,
): void {
  const sourceAlias = match[1];
  const targetAlias = match[2];
  const modifier = match[3];
  const label = match[4];
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

  let kind = baseKind;
  let activatesTarget = false;
  let deactivatesSource = false;
  if (modifier === "**") kind = "create";
  else if (modifier === "!!") kind = "destroy";
  else if (modifier === "++") activatesTarget = true;
  else if (modifier === "--") deactivatesSource = true;

  const edge: DiagramEdge = {
    id: freshId(ctx),
    source: sourceId,
    target: targetId,
    kind,
  };
  if (label && label.trim() !== "") edge.label = label.trim();
  if (activatesTarget) edge.activatesTarget = true;
  if (deactivatesSource) edge.deactivatesSource = true;
  ctx.edges.push(edge);
  ctx.lastEdgeId = edge.id;

  // If we're inside a fragment, append the edge to the current operand.
  const top = ctx.openFragmentStack[ctx.openFragmentStack.length - 1];
  if (top) {
    const fragment = ctx.fragments.find((f) => f.id === top.fragmentId);
    const operand = fragment?.operands.find((o) => o.id === top.currentOperandId);
    operand?.edges.push(edge.id);
  }

  // Activation shortcuts are bound to the edge: `++` opens an activation
  // on the target starting at this edge; `--` closes the most recent
  // activation on the source ending at this edge. Both translate into
  // ActivationInterval entries on the affected lifeline node.
  if (activatesTarget) openActivation(ctx, targetId, edge.id);
  if (deactivatesSource) closeActivation(ctx, sourceId, edge.id);
}

function openActivation(ctx: ParseContext, lifelineNodeId: string, fromEdgeId?: string): void {
  const node = ctx.nodes.find((n) => n.id === lifelineNodeId);
  if (!node) return;
  const anchorEdge = fromEdgeId ?? ctx.lastEdgeId;
  if (!anchorEdge) return;
  const interval = { id: freshId(ctx), fromEdgeId: anchorEdge };
  if (!node.activations) node.activations = [];
  node.activations.push(interval);
  const stack = ctx.openActivations.get(lifelineNodeId) ?? [];
  stack.push({ activationId: interval.id, lifelineNodeId });
  ctx.openActivations.set(lifelineNodeId, stack);
}

function closeActivation(ctx: ParseContext, lifelineNodeId: string, toEdgeId?: string): void {
  const stack = ctx.openActivations.get(lifelineNodeId);
  if (!stack || stack.length === 0) return;
  const open = stack.pop();
  if (!open) return;
  const node = ctx.nodes.find((n) => n.id === lifelineNodeId);
  const interval = node?.activations?.find((a) => a.id === open.activationId);
  const closeAt = toEdgeId ?? ctx.lastEdgeId;
  if (interval && closeAt) interval.toEdgeId = closeAt;
}

function reportUnknownParticipant(ctx: ParseContext, line: SourceLine, alias: string): void {
  ctx.errors.push(
    errorAtLine(
      SYNTAX_ERROR_CODES.UnknownReference,
      `Reference to unknown participant '${alias}'`,
      line,
    ),
  );
}

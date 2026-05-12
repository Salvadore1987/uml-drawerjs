import type {
  CombinedFragment,
  Diagram,
  DiagramEdge,
  DiagramNode,
  EdgeKind,
  FragmentOperand,
  NodeKind,
  SequenceDivider,
  SequenceNote,
} from "../model/types.js";
import { escapeStringLiteral, lookupAlias, nodeAlias } from "./format.js";

/**
 * Render a sequence-diagram body as a render-plan walker:
 *
 *   1. `autonumber` line (if metadata set)
 *   2. Lifeline declarations (with the right keyword for each kind)
 *   3. For each chronological edge in `diagram.edges`:
 *        - any divider anchored after the previous edge
 *        - any note anchored to this edge or before it
 *        - fragment open / else / end markers as needed
 *        - explicit `activate X` / `deactivate X` lines surrounding the edge
 *        - the edge itself with optional `**` / `!!` shortcut
 *
 * Activation `++` / `--` shortcuts are normalised to explicit lines so the
 * generator output is unambiguous regardless of how the AST was authored.
 */
export function renderSequence(diagram: Diagram, aliases: Map<string, string>): string[] {
  const lines: string[] = [];

  if (diagram.metadata.sequenceAutoNumber) {
    lines.push(formatAutoNumber(diagram.metadata.sequenceAutoNumber));
  }

  for (const node of diagram.nodes) {
    lines.push(formatParticipant(node, aliases));
  }

  const fragments = diagram.fragments ?? [];
  const notes = diagram.notes ?? [];
  const dividers = diagram.dividers ?? [];

  // Pre-compute per-edge maps for chronological emission.
  const edgeIndex = new Map<string, number>();
  diagram.edges.forEach((edge, i) => edgeIndex.set(edge.id, i));

  // Anchor lookups: items appearing *after* the most recent edge with id ===
  // anchorEdgeId / afterEdgeId, or at the top when null.
  const dividerByAnchor = groupBy(dividers, (d) => d.afterEdgeId ?? "");
  const noteByAnchor = groupBy(notes, (n) => n.anchorEdgeId ?? "");

  // Top-of-diagram anchors (no preceding edge yet).
  flushTopAnchors(lines, dividerByAnchor.get("") ?? [], noteByAnchor.get("") ?? [], aliases);

  // Build a sparse map of fragment events keyed by edge id.
  const enterFragmentsAt = new Map<string, CombinedFragment[]>();
  const exitFragmentsAt = new Map<string, CombinedFragment[]>();
  const operandSwitchesAt = new Map<
    string,
    { fragmentId: string; from: FragmentOperand; to: FragmentOperand }[]
  >();

  for (const fragment of fragments) {
    const firstEdge = firstEdgeOf(fragment);
    if (firstEdge) push(enterFragmentsAt, firstEdge, fragment);
    const lastEdge = lastEdgeOf(fragment);
    if (lastEdge) push(exitFragmentsAt, lastEdge, fragment);
    for (let i = 1; i < fragment.operands.length; i += 1) {
      const prev = fragment.operands[i - 1];
      const next = fragment.operands[i];
      if (!prev || !next) continue;
      const switchAt = next.edges[0];
      if (switchAt)
        push(operandSwitchesAt, switchAt, { fragmentId: fragment.id, from: prev, to: next });
    }
  }

  // Activation events keyed by edge id.
  const activateAt = new Map<string, string[]>(); // edgeId -> lifeline aliases
  const deactivateAt = new Map<string, string[]>();
  for (const node of diagram.nodes) {
    for (const interval of node.activations ?? []) {
      push(activateAt, interval.fromEdgeId, lookupAlias(aliases, node.id));
      if (interval.toEdgeId) {
        push(deactivateAt, interval.toEdgeId, lookupAlias(aliases, node.id));
      }
    }
  }

  for (const edge of diagram.edges) {
    // Fragment open markers — emitted before the edge they introduce.
    for (const fragment of enterFragmentsAt.get(edge.id) ?? []) {
      lines.push(formatFragmentOpen(fragment));
    }

    // Operand switches (`else …`) — also before the edge that begins them.
    for (const sw of operandSwitchesAt.get(edge.id) ?? []) {
      lines.push(formatFragmentElse(sw.to));
    }

    // `activate X` lines for activations that begin on this edge — emit
    // before the edge so the activation is open when the message arrives.
    for (const alias of activateAt.get(edge.id) ?? []) {
      lines.push(`activate ${alias}`);
    }

    // The edge itself.
    lines.push(formatMessage(edge, aliases));

    // `deactivate X` for activations that close on this edge.
    for (const alias of deactivateAt.get(edge.id) ?? []) {
      lines.push(`deactivate ${alias}`);
    }

    // Notes anchored to this edge — emitted after.
    for (const note of noteByAnchor.get(edge.id) ?? []) {
      lines.push(...formatNote(note, aliases));
    }

    // Dividers anchored after this edge.
    for (const divider of dividerByAnchor.get(edge.id) ?? []) {
      lines.push(`== ${divider.label} ==`);
    }

    // Fragment end markers — after dividers/notes so the brace closes
    // the correct visual scope.
    for (const fragment of exitFragmentsAt.get(edge.id) ?? []) {
      // For nested fragments we emit one `end` per fragment closing here.
      lines.push("end");
      void fragment; // explicitly note the fragment is closing
    }
  }

  return lines;
}

function flushTopAnchors(
  lines: string[],
  dividers: SequenceDivider[],
  notes: SequenceNote[],
  aliases: Map<string, string>,
): void {
  for (const note of notes) lines.push(...formatNote(note, aliases));
  for (const divider of dividers) lines.push(`== ${divider.label} ==`);
}

function formatAutoNumber(opts: { start: number; increment: number; format?: string }): string {
  const head = `autonumber ${opts.start} ${opts.increment}`;
  return opts.format ? `${head} "${escapeStringLiteral(opts.format)}"` : head;
}

function formatParticipant(node: DiagramNode, aliases: Map<string, string>): string {
  const alias = nodeAlias(aliases, node);
  const keyword = lifelineKeyword(node.kind);
  // Aliases derived from id (`n_id_1`) almost never match the human label
  // (`User`); emit the `"label" as alias` form so the rendered diagram
  // keeps the original label.
  if (node.label !== alias) {
    return `${keyword} "${escapeStringLiteral(node.label)}" as ${alias}`;
  }
  return `${keyword} ${alias}`;
}

const LIFELINE_KEYWORD: Partial<Record<NodeKind, string>> = {
  actor: "actor",
  lifeline: "participant",
  "lifeline-boundary": "boundary",
  "lifeline-control": "control",
  "lifeline-entity": "entity",
  "lifeline-collections": "collections",
  database: "database",
  queue: "queue",
};

function lifelineKeyword(kind: NodeKind): string {
  return LIFELINE_KEYWORD[kind] ?? "participant";
}

const ARROW_BY_KIND: Partial<Record<EdgeKind, string>> = {
  "sync-call": "->",
  "async-call": "->>",
  return: "-->",
  create: "->",
  destroy: "->",
};

function formatMessage(edge: DiagramEdge, aliases: Map<string, string>): string {
  const from = lookupAlias(aliases, edge.source);
  const to = lookupAlias(aliases, edge.target);
  const labelSuffix = edge.label && edge.label.trim() !== "" ? ` : ${edge.label}` : "";
  // Found / lost messages: one end is "outside the diagram", encoded as
  // `[-> X` (found) and `X ->]` (lost). The AST uses source===target for
  // these — the kind disambiguates which side is the real participant.
  if (edge.kind === "found-message") {
    return `[-> ${to}${labelSuffix}`;
  }
  if (edge.kind === "lost-message") {
    return `${from} ->]${labelSuffix}`;
  }
  const arrow = ARROW_BY_KIND[edge.kind] ?? "->";
  let modifier = "";
  if (edge.kind === "create") modifier = " **";
  else if (edge.kind === "destroy") modifier = " !!";
  return `${from} ${arrow} ${to}${modifier}${labelSuffix}`;
}

function formatFragmentOpen(fragment: CombinedFragment): string {
  if (fragment.kind === "ref") {
    const label = fragment.label ? ` : ${fragment.label}` : "";
    // `ref over` requires the participants — but the fragment doesn't
    // store them directly; we fall back to listing the union of edges'
    // endpoints. For now emit a label-only header; renderer derives
    // participants from edge ids.
    return `ref${label}`;
  }
  const head = fragment.kind;
  const operand = fragment.operands[0];
  const guard = operand?.guard ?? fragment.label ?? "";
  return guard ? `${head} ${guard}` : head;
}

function formatFragmentElse(operand: FragmentOperand): string {
  return operand.guard ? `else ${operand.guard}` : "else";
}

function formatNote(note: SequenceNote, aliases: Map<string, string>): string[] {
  const partAliases = note.participants.map((id) => lookupAlias(aliases, id));
  if (note.placement === "over") {
    const participants = partAliases.join(", ");
    if (note.text.includes("\n")) {
      return [`note over ${participants}`, ...note.text.split("\n"), "end note"];
    }
    return [`note over ${participants} : ${note.text}`];
  }
  // left | right of <participant>
  const target = partAliases[0] ?? "";
  if (note.text.includes("\n")) {
    return [`note ${note.placement} of ${target}`, ...note.text.split("\n"), "end note"];
  }
  return [`note ${note.placement} of ${target} : ${note.text}`];
}

function firstEdgeOf(fragment: CombinedFragment): string | undefined {
  for (const op of fragment.operands) {
    if (op.edges.length > 0) return op.edges[0];
  }
  return undefined;
}

function lastEdgeOf(fragment: CombinedFragment): string | undefined {
  for (let i = fragment.operands.length - 1; i >= 0; i -= 1) {
    const op = fragment.operands[i];
    if (op && op.edges.length > 0) return op.edges[op.edges.length - 1];
  }
  return undefined;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

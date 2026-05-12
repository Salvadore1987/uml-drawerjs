import type { CombinedFragment, Diagram } from "../model/types.js";
import type { Command } from "./base.js";

/**
 * Grow or shrink a combined fragment along one of four sides.
 *
 * Vertical (`"top"` / `"bottom"`) — mutates `topExtraPx` /
 * `bottomExtraPx` on the fragment in raw layout pixels. The caller
 * pre-snaps `delta` to the grid step (default 12 px), so each drag
 * step shifts the frame by exactly one visible grid cell. Operand
 * `edges` lists are left untouched — the frame can extend past its
 * first / last contained edge into empty cells above / below.
 *   top,    delta < 0 px  → topExtraPx += |delta|   (extend upward).
 *   top,    delta > 0 px  → topExtraPx -= delta     (shrink at top).
 *   bottom, delta > 0 px  → bottomExtraPx += delta  (extend downward).
 *   bottom, delta < 0 px  → bottomExtraPx -= |delta| (shrink at bottom).
 *
 * Horizontal (`"left"` / `"right"`) — adjusts the optional
 * `coveredParticipants` slice on the fragment, which the renderer uses
 * to pin the X-span to a contiguous range of lifeline columns. When
 * the slice is currently undefined we derive an implicit starting
 * range from the participants of the contained edges, so the first
 * drag never starts from an empty list:
 *   right, delta > 0  → rightmost index += delta (extends coverage).
 *   right, delta < 0  → rightmost index -= |delta| (shrinks; clamped
 *                       to keep at least one lifeline covered).
 *   left,  delta > 0  → leftmost index += delta (shrinks from the
 *                       left).
 *   left,  delta < 0  → leftmost index -= |delta| (extends to the
 *                       left).
 *
 * `apply` / `invert` snapshot the full pre- and post-state of the
 * fragment so undo round-trips byte-equal.
 */
export type FragmentResizeSide = "top" | "bottom" | "left" | "right";

export interface ResizeSequenceFragmentPayload {
  readonly fragmentId: string;
  readonly before: CombinedFragment;
  readonly after: CombinedFragment;
}

export type ResizeSequenceFragmentCommand = Command<
  "ResizeSequenceFragment",
  ResizeSequenceFragmentPayload
>;

export function resizeSequenceFragmentCommand(
  fragmentId: string,
  side: FragmentResizeSide,
  delta: number,
  diagram: Diagram,
): ResizeSequenceFragmentCommand {
  const fragment = diagram.fragments?.find((f) => f.id === fragmentId);
  if (!fragment) {
    throw new Error(`resizeSequenceFragmentCommand: fragment ${fragmentId} not found`);
  }

  const before = structuredClone(fragment);
  const after = structuredClone(fragment);

  // Horizontal sides mutate `coveredParticipants` against the lifeline
  // order; vertical sides mutate the per-pixel visual offsets. Neither
  // path touches operand edges — the user gets purely visual control
  // independent of message density. The caller (interactions.ts)
  // pre-snaps `delta` to the grid step (12 px) for vertical sides and
  // to integer column shifts for horizontal sides.
  if (side === "left" || side === "right") {
    if (delta === 0) return makeCmd(fragmentId, before, after);
    applyHorizontalResize(after, side, delta, diagram);
    return makeCmd(fragmentId, before, after);
  }

  if (delta === 0) {
    return makeCmd(fragmentId, before, after);
  }

  // Vertical resize is purely visual: per-pixel offset stored on
  // `topExtraPx` / `bottomExtraPx`, applied as raw layout pixels by
  // the renderer.
  if (side === "bottom") {
    after.bottomExtraPx = (after.bottomExtraPx ?? 0) + delta;
  } else {
    // side === "top": negative delta (drag up) extends upward,
    // positive delta (drag down) shrinks at the top — invert sign
    // so the stored offset is always "pixels added above the auto top".
    after.topExtraPx = (after.topExtraPx ?? 0) - delta;
  }

  return makeCmd(fragmentId, before, after);
}

function makeCmd(
  fragmentId: string,
  before: CombinedFragment,
  after: CombinedFragment,
): ResizeSequenceFragmentCommand {
  const payload: ResizeSequenceFragmentPayload = { fragmentId, before, after };
  return {
    kind: "ResizeSequenceFragment",
    payload,
    apply: (input) => replaceFragment(input, payload.after),
    invert: (input) => replaceFragment(input, payload.before),
  };
}

function replaceFragment(diagram: Diagram, fragment: CombinedFragment): Diagram {
  const current = diagram.fragments ?? [];
  const fragments = current.map((f) => (f.id === fragment.id ? fragment : f));
  return { ...diagram, fragments };
}

/**
 * Mutate `fragment.coveredParticipants` so the fragment's horizontal
 * span grows / shrinks by `deltaColumns` along `side`. The participant
 * list is always reset to the contiguous slice `nodes[left..right]`
 * (inclusive) so the renderer's contiguous-slice invariant holds.
 *
 * When `coveredParticipants` is currently absent we derive an implicit
 * starting range from the participants of the contained edges so the
 * first resize gesture has something to anchor against.
 */
function applyHorizontalResize(
  fragment: CombinedFragment,
  side: "left" | "right",
  deltaColumns: number,
  diagram: Diagram,
): void {
  const lifelineIds = diagram.nodes.map((n) => n.id);
  if (lifelineIds.length === 0) return;
  const indexById = new Map(lifelineIds.map((id, i) => [id, i] as const));

  let coveredIndices: number[] = [];
  if (fragment.coveredParticipants && fragment.coveredParticipants.length > 0) {
    coveredIndices = fragment.coveredParticipants
      .map((id) => indexById.get(id))
      .filter((i): i is number => i !== undefined);
  }
  if (coveredIndices.length === 0) {
    // Derive from edge participants.
    const edgeParticipantIds = new Set<string>();
    const edgeIdsInFragment = new Set<string>();
    for (const op of fragment.operands) for (const id of op.edges) edgeIdsInFragment.add(id);
    for (const edge of diagram.edges) {
      if (!edgeIdsInFragment.has(edge.id)) continue;
      edgeParticipantIds.add(edge.source);
      edgeParticipantIds.add(edge.target);
    }
    for (const id of edgeParticipantIds) {
      const idx = indexById.get(id);
      if (idx !== undefined) coveredIndices.push(idx);
    }
  }
  if (coveredIndices.length === 0) {
    // Still nothing — bail; renderer would have nothing to anchor to.
    return;
  }
  coveredIndices.sort((a, b) => a - b);
  let left = coveredIndices[0]!;
  let right = coveredIndices[coveredIndices.length - 1]!;

  if (side === "right") {
    right = Math.max(left, Math.min(lifelineIds.length - 1, right + deltaColumns));
  } else {
    left = Math.min(right, Math.max(0, left + deltaColumns));
  }

  const next: string[] = [];
  for (let i = left; i <= right; i += 1) {
    const id = lifelineIds[i];
    if (id) next.push(id);
  }
  fragment.coveredParticipants = next;
}

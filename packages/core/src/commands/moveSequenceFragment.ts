import type { Diagram } from "../model/types.js";
import type { Command } from "./base.js";

/**
 * Shift the entire chronological span of a combined fragment up or down by
 * `deltaRows` rows. A fragment's visual position is derived from the
 * indices of its contained edges inside `diagram.edges`, so "moving" the
 * fragment means reordering its edges as a single contiguous block.
 *
 * The block is the half-open range `[fromMin .. fromMax]` — the smallest
 * and largest indices in `diagram.edges` that belong to the fragment.
 * Any unrelated edges interleaved inside that range are moved together
 * with the fragment (drag-to-reorder treats the fragment as a unit). The
 * block's new start is clamped so it never extends past the end of
 * `diagram.edges`.
 *
 * Symmetric `apply` / `invert` snapshot `fromMinIndex` and `toMinIndex` at
 * construction, so undo round-trips byte-equal even after intermediate
 * commands.
 */
export interface MoveSequenceFragmentPayload {
  readonly fragmentId: string;
  readonly fromMinIndex: number;
  readonly toMinIndex: number;
  readonly blockSize: number;
}

export type MoveSequenceFragmentCommand = Command<
  "MoveSequenceFragment",
  MoveSequenceFragmentPayload
>;

export function moveSequenceFragmentCommand(
  fragmentId: string,
  deltaRows: number,
  diagram: Diagram,
): MoveSequenceFragmentCommand {
  const fragment = diagram.fragments?.find((f) => f.id === fragmentId);
  if (!fragment) {
    throw new Error(`moveSequenceFragmentCommand: fragment ${fragmentId} not found`);
  }
  const fragmentEdgeIds = new Set<string>();
  for (const op of fragment.operands) for (const id of op.edges) fragmentEdgeIds.add(id);

  let minIndex = Number.POSITIVE_INFINITY;
  let maxIndex = -1;
  diagram.edges.forEach((edge, i) => {
    if (fragmentEdgeIds.has(edge.id)) {
      if (i < minIndex) minIndex = i;
      if (i > maxIndex) maxIndex = i;
    }
  });
  if (!Number.isFinite(minIndex) || maxIndex < 0) {
    throw new Error(`moveSequenceFragmentCommand: fragment ${fragmentId} has no edges`);
  }

  const blockSize = maxIndex - minIndex + 1;
  const maxStart = diagram.edges.length - blockSize;
  const target = Math.max(0, Math.min(minIndex + deltaRows, maxStart));

  const payload: MoveSequenceFragmentPayload = {
    fragmentId,
    fromMinIndex: minIndex,
    toMinIndex: target,
    blockSize,
  };
  return {
    kind: "MoveSequenceFragment",
    payload,
    apply(input): Diagram {
      return moveBlock(input, payload.fromMinIndex, payload.blockSize, payload.toMinIndex);
    },
    invert(input): Diagram {
      return moveBlock(input, payload.toMinIndex, payload.blockSize, payload.fromMinIndex);
    },
  };
}

function moveBlock(diagram: Diagram, from: number, size: number, to: number): Diagram {
  if (from === to || size <= 0) return diagram;
  const edges = [...diagram.edges];
  const block = edges.splice(from, size);
  edges.splice(to, 0, ...block);
  return { ...diagram, edges };
}

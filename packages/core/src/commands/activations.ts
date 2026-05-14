import type { ActivationInterval, Diagram, DiagramNode } from "../model/types.js";
import { applyPatch, replaceNode } from "./base.js";
import type { Command } from "./base.js";

/**
 * Sequence-only commands that operate on a lifeline's `activations[]` —
 * the per-node array of `ActivationInterval` records.
 *
 * Activations come in two flavours (see `ActivationInterval` doc):
 *   - Edge-anchored — `fromEdgeId` is set; authored via the PlantUML
 *     parser (`++`, `activate X`).
 *   - Standalone — neither edge id is set; the activation positions
 *     itself in raw layout pixels via `topPx` / `heightPx`. Created by
 *     the "Activation Bar" palette item so the user can drop one on a
 *     lifeline without first wiring a message.
 *
 * Resize mode mutates `topPx` (top handle) and `heightPx` (bottom
 * handle) for standalone activations; for edge-anchored activations the
 * same handles mutate `topExtraPx` / `bottomExtraPx`. Both paths flow
 * through `resizeActivationCommand`, which decides based on whether the
 * interval has `fromEdgeId`.
 */

function replaceActivation(node: DiagramNode, next: ActivationInterval): DiagramNode {
  const list = node.activations ?? [];
  return {
    ...node,
    activations: list.map((a) => (a.id === next.id ? next : a)),
  };
}

function appendActivation(node: DiagramNode, next: ActivationInterval): DiagramNode {
  return { ...node, activations: [...(node.activations ?? []), next] };
}

function dropActivation(node: DiagramNode, activationId: string): DiagramNode {
  const list = node.activations ?? [];
  const next = list.filter((a) => a.id !== activationId);
  if (next.length === 0) {
    const { activations: _omit, ...rest } = node;
    return rest as DiagramNode;
  }
  return { ...node, activations: next };
}

function findNodeWithActivation(
  diagram: Diagram,
  activationId: string,
): { node: DiagramNode; interval: ActivationInterval } | null {
  for (const node of diagram.nodes) {
    for (const interval of node.activations ?? []) {
      if (interval.id === activationId) return { node, interval };
    }
  }
  return null;
}

// ---------- add ----------

export interface AddActivationPayload {
  readonly nodeId: string;
  readonly activation: ActivationInterval;
}

export type AddActivationCommand = Command<"AddActivation", AddActivationPayload>;

export function addActivationCommand(
  nodeId: string,
  activation: ActivationInterval,
): AddActivationCommand {
  const snapshot = structuredClone(activation);
  const payload: AddActivationPayload = { nodeId, activation: snapshot };
  return {
    kind: "AddActivation",
    payload,
    apply(input) {
      const node = input.nodes.find((n) => n.id === payload.nodeId);
      if (!node) return input;
      return replaceNode(input, appendActivation(node, payload.activation));
    },
    invert(input) {
      const node = input.nodes.find((n) => n.id === payload.nodeId);
      if (!node) return input;
      return replaceNode(input, dropActivation(node, payload.activation.id));
    },
  };
}

// ---------- remove ----------

export interface RemoveActivationPayload {
  readonly nodeId: string;
  readonly removed: ActivationInterval;
  readonly index: number;
}

export type RemoveActivationCommand = Command<"RemoveActivation", RemoveActivationPayload>;

export function removeActivationCommand(
  activationId: string,
  diagram: Diagram,
): RemoveActivationCommand {
  const found = findNodeWithActivation(diagram, activationId);
  if (!found) {
    throw new Error(`removeActivationCommand: activation ${activationId} not found`);
  }
  const list = found.node.activations ?? [];
  const index = list.findIndex((a) => a.id === activationId);
  const removed = structuredClone(found.interval);
  const payload: RemoveActivationPayload = { nodeId: found.node.id, removed, index };
  return {
    kind: "RemoveActivation",
    payload,
    apply(input) {
      const node = input.nodes.find((n) => n.id === payload.nodeId);
      if (!node) return input;
      return replaceNode(input, dropActivation(node, payload.removed.id));
    },
    invert(input) {
      const node = input.nodes.find((n) => n.id === payload.nodeId);
      if (!node) return input;
      const list2 = node.activations ?? [];
      const next = [...list2];
      next.splice(payload.index, 0, payload.removed);
      return replaceNode(input, { ...node, activations: next });
    },
  };
}

// ---------- update ----------

export type ActivationPatch = Partial<Omit<ActivationInterval, "id">>;

export interface UpdateActivationPayload {
  readonly nodeId: string;
  readonly before: ActivationInterval;
  readonly after: ActivationInterval;
}

export type UpdateActivationCommand = Command<"UpdateActivation", UpdateActivationPayload>;

export function updateActivationCommand(
  activationId: string,
  patch: ActivationPatch,
  diagram: Diagram,
): UpdateActivationCommand {
  const found = findNodeWithActivation(diagram, activationId);
  if (!found) {
    throw new Error(`updateActivationCommand: activation ${activationId} not found`);
  }
  const before = structuredClone(found.interval);
  const after = structuredClone(applyPatch(found.interval, patch as Partial<ActivationInterval>));
  const payload: UpdateActivationPayload = { nodeId: found.node.id, before, after };
  return {
    kind: "UpdateActivation",
    payload,
    apply(input) {
      const node = input.nodes.find((n) => n.id === payload.nodeId);
      if (!node) return input;
      return replaceNode(input, replaceActivation(node, payload.after));
    },
    invert(input) {
      const node = input.nodes.find((n) => n.id === payload.nodeId);
      if (!node) return input;
      return replaceNode(input, replaceActivation(node, payload.before));
    },
  };
}

// ---------- move to another lifeline ----------

export interface MoveActivationToLifelinePayload {
  readonly activationId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly activation: ActivationInterval;
  readonly fromIndex: number;
}

export type MoveActivationToLifelineCommand = Command<
  "MoveActivationToLifeline",
  MoveActivationToLifelinePayload
>;

/**
 * Atomically reassign an activation interval from one lifeline node to
 * another. Used by the canvas's drag-to-move gesture when the user pulls
 * the bar sideways onto a different lifeline column. The interval is
 * removed from the source node's `activations` array and appended to
 * the target's. Edge anchors (`fromEdgeId` / `toEdgeId`) are preserved
 * verbatim — the caller is responsible for choosing a target lifeline
 * where those anchors still make sense; for standalone activations
 * there's no such constraint.
 */
export function moveActivationToLifelineCommand(
  activationId: string,
  toNodeId: string,
  diagram: Diagram,
): MoveActivationToLifelineCommand {
  const found = findNodeWithActivation(diagram, activationId);
  if (!found) {
    throw new Error(`moveActivationToLifelineCommand: activation ${activationId} not found`);
  }
  if (found.node.id === toNodeId) {
    throw new Error(
      `moveActivationToLifelineCommand: source and target nodes are the same (${toNodeId})`,
    );
  }
  const list = found.node.activations ?? [];
  const fromIndex = list.findIndex((a) => a.id === activationId);
  const activation = structuredClone(found.interval);
  const payload: MoveActivationToLifelinePayload = {
    activationId,
    fromNodeId: found.node.id,
    toNodeId,
    activation,
    fromIndex,
  };
  return {
    kind: "MoveActivationToLifeline",
    payload,
    apply(input) {
      const fromNode = input.nodes.find((n) => n.id === payload.fromNodeId);
      const toNode = input.nodes.find((n) => n.id === payload.toNodeId);
      if (!fromNode || !toNode) return input;
      const stripped = replaceNode(input, dropActivation(fromNode, payload.activationId));
      const target = stripped.nodes.find((n) => n.id === payload.toNodeId);
      if (!target) return stripped;
      return replaceNode(stripped, appendActivation(target, payload.activation));
    },
    invert(input) {
      const toNode = input.nodes.find((n) => n.id === payload.toNodeId);
      const fromNode = input.nodes.find((n) => n.id === payload.fromNodeId);
      if (!toNode || !fromNode) return input;
      const stripped = replaceNode(input, dropActivation(toNode, payload.activationId));
      const source = stripped.nodes.find((n) => n.id === payload.fromNodeId);
      if (!source) return stripped;
      const restoredList = source.activations ?? [];
      const next = [...restoredList];
      next.splice(payload.fromIndex, 0, payload.activation);
      return replaceNode(stripped, { ...source, activations: next });
    },
  };
}

// ---------- resize ----------

/**
 * N / S handle pull on an activation bar. The caller pre-snaps `delta`
 * to the grid step (default 12 px). Sign convention mirrors the fragment
 * resize command:
 *   side = "top",    delta < 0 → extend upward (top edge moves up)
 *   side = "top",    delta > 0 → shrink at top
 *   side = "bottom", delta > 0 → extend downward
 *   side = "bottom", delta < 0 → shrink at bottom
 *
 * Standalone activations mutate `topPx` / `heightPx` directly; edge-
 * anchored activations mutate `topExtraPx` / `bottomExtraPx` so they
 * keep tracking the anchored message while picking up the offset.
 */
export type ActivationResizeSide = "top" | "bottom";

export interface ResizeActivationPayload {
  readonly nodeId: string;
  readonly before: ActivationInterval;
  readonly after: ActivationInterval;
}

export type ResizeActivationCommand = Command<"ResizeActivation", ResizeActivationPayload>;

export function resizeActivationCommand(
  activationId: string,
  side: ActivationResizeSide,
  delta: number,
  diagram: Diagram,
): ResizeActivationCommand {
  const found = findNodeWithActivation(diagram, activationId);
  if (!found) {
    throw new Error(`resizeActivationCommand: activation ${activationId} not found`);
  }
  const before = structuredClone(found.interval);
  const after = structuredClone(found.interval);

  if (delta !== 0) {
    if (after.fromEdgeId === undefined) {
      // Standalone — adjust raw pixel position / height.
      const top = after.topPx ?? 0;
      const h = after.heightPx ?? 0;
      if (side === "top") {
        const nextTop = top + delta;
        const nextH = h - delta;
        after.topPx = nextTop;
        after.heightPx = Math.max(nextH, 1);
      } else {
        after.heightPx = Math.max(h + delta, 1);
      }
    } else {
      // Edge-anchored — keep the message anchors and bias visually.
      if (side === "top") {
        after.topExtraPx = (after.topExtraPx ?? 0) - delta;
      } else {
        after.bottomExtraPx = (after.bottomExtraPx ?? 0) + delta;
      }
    }
  }

  const payload: ResizeActivationPayload = { nodeId: found.node.id, before, after };
  return {
    kind: "ResizeActivation",
    payload,
    apply(input) {
      const node = input.nodes.find((n) => n.id === payload.nodeId);
      if (!node) return input;
      return replaceNode(input, replaceActivation(node, payload.after));
    },
    invert(input) {
      const node = input.nodes.find((n) => n.id === payload.nodeId);
      if (!node) return input;
      return replaceNode(input, replaceActivation(node, payload.before));
    },
  };
}

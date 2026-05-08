import type { Command } from "../commands/base.js";

/**
 * Predicate that decides whether `next` should be coalesced into the
 * frame already containing `previous`. Returning `true` glues both
 * commands into a single undo step.
 */
export type CoalescePredicate = (previous: Command, next: Command) => boolean;

/**
 * Built-in coalesce: same command kind. Useful for repeat actions like
 * burst-typing into a label or repeated arrow-key nudges.
 */
export const sameKind: CoalescePredicate = (previous, next) => previous.kind === next.kind;

/**
 * Built-in coalesce: same `kind` AND same target id. Inspects a small set
 * of well-known payload shapes (`nodeId`, `edgeId`, `groupId`) so callers
 * don't need to pattern-match on every command type.
 */
export const sameKindAndTarget: CoalescePredicate = (previous, next) => {
  if (previous.kind !== next.kind) return false;
  return targetId(previous) === targetId(next);
};

/** No coalescing — every command opens its own undo frame. */
export const never: CoalescePredicate = () => false;

function targetId(command: Command): string | undefined {
  const payload = command.payload;
  if (typeof payload !== "object" || payload === null) return undefined;
  if ("nodeId" in payload && typeof (payload as { nodeId: unknown }).nodeId === "string") {
    return (payload as { nodeId: string }).nodeId;
  }
  if ("edgeId" in payload && typeof (payload as { edgeId: unknown }).edgeId === "string") {
    return (payload as { edgeId: string }).edgeId;
  }
  if ("groupId" in payload && typeof (payload as { groupId: unknown }).groupId === "string") {
    return (payload as { groupId: string }).groupId;
  }
  return undefined;
}

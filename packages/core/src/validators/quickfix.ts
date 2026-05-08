import type { Command } from "../commands/base.js";
import { removeEdgeCommand } from "../commands/removeEdge.js";
import { removeNodeCommand } from "../commands/removeNode.js";
import { updateGroupCommand } from "../commands/group.js";
import { updateNodeCommand } from "../commands/updateNode.js";
import { findEdge, findGroup, findNode } from "../model/query.js";
import type { Diagram, DiagramError } from "../model/types.js";
import { LINT_ERROR_CODES, SEMANTIC_ERROR_CODES } from "./codes.js";

/**
 * Quick-fix registry. Each entry maps an error code to a builder that
 * inspects the offending error against the current diagram and returns a
 * `Command` that resolves it (or `null` when the error context has gone
 * stale — e.g. the dangling edge has already been removed elsewhere).
 *
 * Validators stay pure: they emit errors without `fix`. Bind a fixer with
 * `attachQuickFixes(errors, diagram, dispatch)` which produces a new error
 * array where each fixable error has its `fix` field populated.
 */
export interface QuickFixSuggestion {
  /** Error code this suggestion resolves. */
  readonly code: string;
  /** UI label — short imperative phrase, e.g. "Remove dangling edge". */
  readonly label: string;
  /** Build the actual command from the live diagram, or null when stale. */
  build(diagram: Diagram, error: DiagramError): Command | null;
}

const REGISTRY: Record<string, QuickFixSuggestion> = {
  [SEMANTIC_ERROR_CODES.NodeLabelEmpty]: {
    code: SEMANTIC_ERROR_CODES.NodeLabelEmpty,
    label: "Set placeholder label",
    build(diagram, error) {
      const nodeId = error.nodeId;
      if (!nodeId || !findNode(diagram, nodeId)) return null;
      return updateNodeCommand(nodeId, { label: "Untitled" }, diagram);
    },
  },
  [SEMANTIC_ERROR_CODES.GroupLabelEmpty]: {
    code: SEMANTIC_ERROR_CODES.GroupLabelEmpty,
    label: "Set placeholder label",
    build(diagram, error) {
      const groupId = error.groupId;
      if (!groupId || !findGroup(diagram, groupId)) return null;
      return updateGroupCommand(groupId, { label: "Untitled Group" }, diagram);
    },
  },
  [SEMANTIC_ERROR_CODES.EdgeDanglingSource]: {
    code: SEMANTIC_ERROR_CODES.EdgeDanglingSource,
    label: "Remove dangling edge",
    build(diagram, error) {
      const edgeId = error.edgeId;
      if (!edgeId || !findEdge(diagram, edgeId)) return null;
      return removeEdgeCommand(edgeId, diagram);
    },
  },
  [SEMANTIC_ERROR_CODES.EdgeDanglingTarget]: {
    code: SEMANTIC_ERROR_CODES.EdgeDanglingTarget,
    label: "Remove dangling edge",
    build(diagram, error) {
      const edgeId = error.edgeId;
      if (!edgeId || !findEdge(diagram, edgeId)) return null;
      return removeEdgeCommand(edgeId, diagram);
    },
  },
  [SEMANTIC_ERROR_CODES.GroupChildMissing]: {
    code: SEMANTIC_ERROR_CODES.GroupChildMissing,
    label: "Drop unknown children",
    build(diagram, error) {
      const groupId = error.groupId;
      if (!groupId) return null;
      const group = findGroup(diagram, groupId);
      if (!group) return null;
      const knownIds = new Set<string>([
        ...diagram.nodes.map((n) => n.id),
        ...diagram.groups.map((g) => g.id),
      ]);
      const filtered = group.children.filter((id) => knownIds.has(id));
      if (filtered.length === group.children.length) return null;
      return updateGroupCommand(groupId, { children: filtered }, diagram);
    },
  },
  [LINT_ERROR_CODES.OrphanNode]: {
    code: LINT_ERROR_CODES.OrphanNode,
    label: "Remove orphan node",
    build(diagram, error) {
      const nodeId = error.nodeId;
      if (!nodeId || !findNode(diagram, nodeId)) return null;
      return removeNodeCommand(nodeId, diagram);
    },
  },
};

/** Returns the registered quick-fix for an error code, or null. */
export function getQuickFix(code: string): QuickFixSuggestion | null {
  return REGISTRY[code] ?? null;
}

/** Build a `Command` for an error, or `null` when no fix applies. */
export function buildQuickFixCommand(diagram: Diagram, error: DiagramError): Command | null {
  const suggestion = getQuickFix(error.code);
  if (!suggestion) return null;
  return suggestion.build(diagram, error);
}

/**
 * Return a new error array where every fixable error has its `fix` closure
 * populated. The closure captures both the live diagram and the caller's
 * `dispatch`, so calling `error.fix.apply()` actually mutates the model.
 *
 * `dispatch` is the seam between the validator stack and the command bus —
 * usually it is `bus.dispatch.bind(bus)`, but tests pass a plain function
 * that records the command for inspection.
 */
export function attachQuickFixes(
  errors: readonly DiagramError[],
  diagram: Diagram,
  dispatch: (command: Command) => void,
): DiagramError[] {
  return errors.map((error) => {
    const suggestion = getQuickFix(error.code);
    if (!suggestion) return { ...error };
    return {
      ...error,
      fix: {
        label: suggestion.label,
        apply(): void {
          const command = suggestion.build(diagram, error);
          if (command) dispatch(command);
        },
      },
    };
  });
}

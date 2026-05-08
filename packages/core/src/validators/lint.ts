import type { Diagram, DiagramEdge, DiagramError, EdgeKind } from "../model/types.js";
import { LINT_ERROR_CODES } from "./codes.js";

/**
 * Lint-level checks: soft-failure rules that surface as warnings (or as
 * errors when the model is genuinely broken, like an inheritance cycle).
 * The lint layer assumes semantic + constraint invariants already hold —
 * dangling edges are filtered out so a missing endpoint never spawns a
 * cascading "orphan" warning.
 */
export function validateLint(diagram: Diagram): DiagramError[] {
  const errors: DiagramError[] = [];

  reportOrphanNodes(diagram, errors);
  reportDuplicateLabels(diagram, errors);
  reportInheritanceCycles(diagram, errors);

  return errors;
}

function reportOrphanNodes(diagram: Diagram, errors: DiagramError[]): void {
  // Sequence diagrams treat lifelines without messages as legitimate setup;
  // skip the orphan check for them so we don't flag every yet-to-be-wired
  // participant.
  if (diagram.type === "sequence") return;

  const referenced = new Set<string>();
  for (const edge of diagram.edges) {
    referenced.add(edge.source);
    referenced.add(edge.target);
  }
  for (const group of diagram.groups) {
    for (const childId of group.children) referenced.add(childId);
  }

  for (const node of diagram.nodes) {
    if (!referenced.has(node.id)) {
      errors.push({
        severity: "warning",
        code: LINT_ERROR_CODES.OrphanNode,
        message: `Node '${node.label || node.id}' has no incident edges or grouping`,
        nodeId: node.id,
      });
    }
  }
}

function reportDuplicateLabels(diagram: Diagram, errors: DiagramError[]): void {
  const counts = new Map<string, number>();
  for (const node of diagram.nodes) {
    const label = node.label.trim();
    if (label === "") continue; // empty label is a separate semantic error
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  for (const node of diagram.nodes) {
    const label = node.label.trim();
    if ((counts.get(label) ?? 0) > 1) {
      errors.push({
        severity: "warning",
        code: LINT_ERROR_CODES.DuplicateLabel,
        message: `Duplicate node label '${label}'`,
        nodeId: node.id,
      });
    }
  }
}

const HIERARCHY_EDGE_KINDS = new Set<EdgeKind>(["inheritance", "realization"]);

/**
 * Detect cycles among inheritance / realization edges (class diagrams).
 * Treats a cycle as `severity: "error"` because it makes the type system
 * the diagram describes inconsistent — the renderer will still draw it,
 * but downstream consumers (codegen, layouters) can lock up on cycles.
 */
function reportInheritanceCycles(diagram: Diagram, errors: DiagramError[]): void {
  if (diagram.type !== "class") return;

  const adjacency = new Map<string, string[]>();
  for (const edge of diagram.edges) {
    if (!HIERARCHY_EDGE_KINDS.has(edge.kind)) continue;
    const list = adjacency.get(edge.source) ?? [];
    list.push(edge.target);
    adjacency.set(edge.source, list);
  }

  const reportedNodes = new Set<string>();
  const state = new Map<string, "visiting" | "done">();

  const visit = (nodeId: string, stack: string[]): void => {
    const status = state.get(nodeId);
    if (status === "done") return;
    if (status === "visiting") {
      const cycleStart = stack.indexOf(nodeId);
      const cycle = cycleStart >= 0 ? stack.slice(cycleStart) : [nodeId];
      for (const id of cycle) {
        if (reportedNodes.has(id)) continue;
        reportedNodes.add(id);
        errors.push({
          severity: "error",
          code: LINT_ERROR_CODES.InheritanceCycle,
          message: `Inheritance cycle through node '${id}'`,
          nodeId: id,
        });
      }
      return;
    }
    state.set(nodeId, "visiting");
    stack.push(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      visit(next, stack);
    }
    stack.pop();
    state.set(nodeId, "done");
  };

  for (const node of diagram.nodes) visit(node.id, []);
}

/** Re-exported for callers that want to grok edge participation in lint. */
export function isHierarchyEdge(edge: DiagramEdge): boolean {
  return HIERARCHY_EDGE_KINDS.has(edge.kind);
}

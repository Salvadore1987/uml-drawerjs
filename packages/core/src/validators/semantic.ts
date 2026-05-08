import type { Diagram, DiagramError } from "../model/types.js";
import { SEMANTIC_ERROR_CODES } from "./codes.js";

/**
 * Semantic-level validator: enforces invariants that should hold on any
 * structurally valid `Diagram`, regardless of its declared type. Every
 * issue surfaces with `severity: "error"` because the AST is internally
 * inconsistent — downstream layers (constraints, layout, renderer) assume
 * these invariants and may produce undefined behaviour without them.
 */
export function validateSemantics(diagram: Diagram): DiagramError[] {
  const errors: DiagramError[] = [];

  reportDuplicateIds(diagram, errors);
  reportEmptyLabels(diagram, errors);
  reportDanglingEdges(diagram, errors);
  reportMissingGroupChildren(diagram, errors);

  return errors;
}

function reportDuplicateIds(diagram: Diagram, errors: DiagramError[]): void {
  const collect = (
    items: { id: string }[],
    code: string,
    message: (id: string) => string,
    field: "nodeId" | "edgeId" | "groupId",
  ): void => {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.id)) {
        errors.push({
          severity: "error",
          code,
          message: message(item.id),
          [field]: item.id,
        });
      }
      seen.add(item.id);
    }
  };

  collect(
    diagram.nodes,
    SEMANTIC_ERROR_CODES.DuplicateNodeId,
    (id) => `Duplicate node id '${id}'`,
    "nodeId",
  );
  collect(
    diagram.edges,
    SEMANTIC_ERROR_CODES.DuplicateEdgeId,
    (id) => `Duplicate edge id '${id}'`,
    "edgeId",
  );
  collect(
    diagram.groups,
    SEMANTIC_ERROR_CODES.DuplicateGroupId,
    (id) => `Duplicate group id '${id}'`,
    "groupId",
  );
}

function reportEmptyLabels(diagram: Diagram, errors: DiagramError[]): void {
  for (const node of diagram.nodes) {
    if (node.label.trim() === "") {
      errors.push({
        severity: "error",
        code: SEMANTIC_ERROR_CODES.NodeLabelEmpty,
        message: `Node '${node.id}' has an empty label`,
        nodeId: node.id,
      });
    }
  }
  for (const group of diagram.groups) {
    if (group.label.trim() === "") {
      errors.push({
        severity: "error",
        code: SEMANTIC_ERROR_CODES.GroupLabelEmpty,
        message: `Group '${group.id}' has an empty label`,
        groupId: group.id,
      });
    }
  }
}

function reportDanglingEdges(diagram: Diagram, errors: DiagramError[]): void {
  const knownIds = new Set<string>();
  for (const node of diagram.nodes) knownIds.add(node.id);
  for (const group of diagram.groups) knownIds.add(group.id);

  for (const edge of diagram.edges) {
    if (!knownIds.has(edge.source)) {
      errors.push({
        severity: "error",
        code: SEMANTIC_ERROR_CODES.EdgeDanglingSource,
        message: `Edge '${edge.id}' has unknown source '${edge.source}'`,
        edgeId: edge.id,
      });
    }
    if (!knownIds.has(edge.target)) {
      errors.push({
        severity: "error",
        code: SEMANTIC_ERROR_CODES.EdgeDanglingTarget,
        message: `Edge '${edge.id}' has unknown target '${edge.target}'`,
        edgeId: edge.id,
      });
    }
  }
}

function reportMissingGroupChildren(diagram: Diagram, errors: DiagramError[]): void {
  const knownIds = new Set<string>();
  for (const node of diagram.nodes) knownIds.add(node.id);
  for (const group of diagram.groups) knownIds.add(group.id);

  for (const group of diagram.groups) {
    for (const childId of group.children) {
      if (!knownIds.has(childId)) {
        errors.push({
          severity: "error",
          code: SEMANTIC_ERROR_CODES.GroupChildMissing,
          message: `Group '${group.id}' references unknown child '${childId}'`,
          groupId: group.id,
        });
      }
    }
  }
}

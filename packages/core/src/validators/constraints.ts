import type {
  Diagram,
  DiagramEdge,
  DiagramError,
  DiagramNode,
  DiagramType,
  EdgeKind,
  NodeKind,
} from "../model/types.js";
import { CONSTRAINT_ERROR_CODES } from "./codes.js";

/**
 * Constraint validator: per-diagram-type rules that the universal semantic
 * level cannot express. The AST shape is uniform across diagram types (one
 * union of `NodeKind` / `EdgeKind`), so the constraints layer is what
 * actually enforces "a Sequence diagram only contains lifelines and actors"
 * etc. Without these, a class-shaped node could end up in an ER diagram
 * and slip past validation.
 */
export function validateConstraints(diagram: Diagram): DiagramError[] {
  const errors: DiagramError[] = [];

  for (const node of diagram.nodes) {
    if (!isNodeKindAllowed(diagram.type, node.kind)) {
      errors.push({
        severity: "error",
        code: CONSTRAINT_ERROR_CODES.NodeKindNotAllowed,
        message: `Node kind '${node.kind}' is not allowed in a '${diagram.type}' diagram`,
        nodeId: node.id,
      });
    }
  }

  for (const edge of diagram.edges) {
    if (!isEdgeKindAllowed(diagram.type, edge.kind)) {
      errors.push({
        severity: "error",
        code: CONSTRAINT_ERROR_CODES.EdgeKindNotAllowed,
        message: `Edge kind '${edge.kind}' is not allowed in a '${diagram.type}' diagram`,
        edgeId: edge.id,
      });
    }
  }

  if (diagram.type === "sequence") {
    enforceSequenceEdgeEndpoints(diagram, errors);
  }
  if (diagram.type === "er") {
    enforceErEdgeEndpoints(diagram, errors);
    enforceErCardinality(diagram, errors);
  }
  if (isC4(diagram.type)) {
    enforceC4BoundaryChildren(diagram, errors);
  }

  return errors;
}

const C4_NODE_KINDS = new Set<NodeKind>([
  "person",
  "system",
  "system-external",
  "container",
  "component",
  "database",
]);
const CLASS_NODE_KINDS = new Set<NodeKind>(["class", "interface", "abstract-class", "enum"]);
const ER_NODE_KINDS = new Set<NodeKind>(["entity"]);
const SEQUENCE_NODE_KINDS = new Set<NodeKind>(["lifeline", "actor"]);

function isNodeKindAllowed(type: DiagramType, kind: NodeKind): boolean {
  switch (type) {
    case "c4-context":
    case "c4-container":
    case "c4-component":
      return C4_NODE_KINDS.has(kind);
    case "class":
      return CLASS_NODE_KINDS.has(kind);
    case "er":
      return ER_NODE_KINDS.has(kind);
    case "sequence":
      return SEQUENCE_NODE_KINDS.has(kind);
  }
}

const C4_EDGE_KINDS = new Set<EdgeKind>(["uses", "depends-on"]);
const CLASS_EDGE_KINDS = new Set<EdgeKind>([
  "association",
  "inheritance",
  "realization",
  "composition",
  "aggregation",
  "dependency",
]);
const ER_EDGE_KINDS = new Set<EdgeKind>(["one-to-one", "one-to-many", "many-to-many"]);
const SEQUENCE_EDGE_KINDS = new Set<EdgeKind>([
  "sync-call",
  "async-call",
  "return",
  "create",
  "destroy",
]);

function isEdgeKindAllowed(type: DiagramType, kind: EdgeKind): boolean {
  switch (type) {
    case "c4-context":
    case "c4-container":
    case "c4-component":
      return C4_EDGE_KINDS.has(kind);
    case "class":
      return CLASS_EDGE_KINDS.has(kind);
    case "er":
      return ER_EDGE_KINDS.has(kind);
    case "sequence":
      return SEQUENCE_EDGE_KINDS.has(kind);
  }
}

function isC4(type: DiagramType): boolean {
  return type === "c4-context" || type === "c4-container" || type === "c4-component";
}

function enforceSequenceEdgeEndpoints(diagram: Diagram, errors: DiagramError[]): void {
  const lifelineLikeIds = new Set(
    diagram.nodes.filter((n) => SEQUENCE_NODE_KINDS.has(n.kind)).map((n: DiagramNode) => n.id),
  );
  for (const edge of diagram.edges) {
    if (!lifelineLikeIds.has(edge.source) || !lifelineLikeIds.has(edge.target)) {
      errors.push({
        severity: "error",
        code: CONSTRAINT_ERROR_CODES.SequenceEdgeNonLifeline,
        message: `Sequence edge '${edge.id}' must connect lifelines or actors`,
        edgeId: edge.id,
      });
    }
  }
}

function enforceErEdgeEndpoints(diagram: Diagram, errors: DiagramError[]): void {
  const entityIds = new Set(
    diagram.nodes.filter((n) => n.kind === "entity").map((n: DiagramNode) => n.id),
  );
  for (const edge of diagram.edges) {
    if (!entityIds.has(edge.source) || !entityIds.has(edge.target)) {
      errors.push({
        severity: "error",
        code: CONSTRAINT_ERROR_CODES.ErEdgeNonEntity,
        message: `ER edge '${edge.id}' must connect entities`,
        edgeId: edge.id,
      });
    }
  }
}

const ER_CARDINALITY_TOKEN = /^[01](?:\.\.(?:\*|[1-9][0-9]*))?$|^\*$|^[1-9][0-9]*$|^0\.\.\*$/u;

function enforceErCardinality(diagram: Diagram, errors: DiagramError[]): void {
  for (const edge of diagram.edges) {
    if (!ER_EDGE_KINDS.has(edge.kind)) continue;
    const cardinality = edge.cardinality;
    if (!cardinality || cardinality.source === undefined || cardinality.target === undefined) {
      errors.push({
        severity: "error",
        code: CONSTRAINT_ERROR_CODES.ErCardinalityMissing,
        message: `ER edge '${edge.id}' is missing source/target cardinality`,
        edgeId: edge.id,
      });
      continue;
    }
    reportInvalidCardinality(edge, "source", cardinality.source, errors);
    reportInvalidCardinality(edge, "target", cardinality.target, errors);
  }
}

function reportInvalidCardinality(
  edge: DiagramEdge,
  side: "source" | "target",
  token: string,
  errors: DiagramError[],
): void {
  if (!ER_CARDINALITY_TOKEN.test(token)) {
    errors.push({
      severity: "error",
      code: CONSTRAINT_ERROR_CODES.ErCardinalityInvalid,
      message: `ER edge '${edge.id}' has invalid ${side} cardinality '${token}'`,
      edgeId: edge.id,
    });
  }
}

/**
 * C4 Boundary blocks may only contain other C4 nodes (Person / System /
 * Container / Component / Database / nested boundaries). The semantic
 * validator already reports if a boundary references an unknown id, so
 * here we only check the kind-level rule.
 */
function enforceC4BoundaryChildren(diagram: Diagram, errors: DiagramError[]): void {
  const nodeKinds = new Map(diagram.nodes.map((node) => [node.id, node.kind] as const));
  const groupIds = new Set(diagram.groups.map((g) => g.id));

  for (const group of diagram.groups) {
    if (group.kind !== "boundary") continue;
    for (const childId of group.children) {
      const kind = nodeKinds.get(childId);
      if (kind === undefined) {
        // Either an unknown id (reported by semantic) or a nested group —
        // nested boundaries are allowed and need no per-kind check here.
        if (!groupIds.has(childId)) continue;
        continue;
      }
      if (!C4_NODE_KINDS.has(kind)) {
        errors.push({
          severity: "error",
          code: CONSTRAINT_ERROR_CODES.C4BoundaryChildKind,
          message: `C4 boundary '${group.id}' contains a non-C4 node kind '${kind}'`,
          groupId: group.id,
          nodeId: childId,
        });
      }
    }
  }
}

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
    enforceSequenceFragments(diagram, errors);
    enforceSequenceActivations(diagram, errors);
    enforceSequenceNotes(diagram, errors);
  }
  if (diagram.type === "er") {
    enforceErEdgeEndpoints(diagram, errors);
    enforceErCardinality(diagram, errors);
    enforceEntityMemberRules(diagram, errors);
  }
  if (isC4(diagram.type)) {
    enforceC4BoundaryChildren(diagram, errors);
    enforceC4BoundaryTier(diagram, errors);
  }
  if (diagram.type === "c4-context") {
    enforceC4ContextTier(diagram, errors);
  }
  if (diagram.type === "c4-container") {
    enforceC4ContainerTier(diagram, errors);
  }
  if (diagram.type === "class") {
    enforceClassMemberRules(diagram, errors);
  }

  return errors;
}

/**
 * Classic-UML semantics for class-diagram members. These are not
 * expressible at the kind-whitelist level — they constrain the *contents*
 * of a class node:
 *
 *   - `enum` may carry only `enumLiterals` — operations / attributes /
 *     generics on an enum are a UML modelling error.
 *   - `interface` operations are implicitly abstract; an explicit
 *     `abstract: false` is contradictory.
 *   - Concrete classes (`class`) cannot host abstract operations — that
 *     conflates "abstract" (no body) with "virtual" (overridable).
 */
function enforceClassMemberRules(diagram: Diagram, errors: DiagramError[]): void {
  for (const node of diagram.nodes) {
    if (node.kind === "enum") {
      if ((node.operations?.length ?? 0) > 0) {
        errors.push({
          severity: "error",
          code: CONSTRAINT_ERROR_CODES.ClassEnumHasOperations,
          message: `Enum '${node.label}' cannot declare operations`,
          nodeId: node.id,
        });
      }
      if ((node.attributes?.length ?? 0) > 0) {
        errors.push({
          severity: "error",
          code: CONSTRAINT_ERROR_CODES.ClassEnumHasAttributes,
          message: `Enum '${node.label}' cannot declare attributes — use enumLiterals`,
          nodeId: node.id,
        });
      }
      if ((node.generics?.length ?? 0) > 0) {
        errors.push({
          severity: "error",
          code: CONSTRAINT_ERROR_CODES.ClassEnumHasGenerics,
          message: `Enum '${node.label}' cannot declare generic type parameters`,
          nodeId: node.id,
        });
      }
    }
    if (node.kind === "interface") {
      for (const op of node.operations ?? []) {
        if (op.abstract === false) {
          errors.push({
            severity: "error",
            code: CONSTRAINT_ERROR_CODES.ClassInterfaceMethodNotAbstract,
            message: `Interface method '${op.name}' must be abstract`,
            nodeId: node.id,
          });
        }
      }
    }
    if (node.kind === "class") {
      for (const op of node.operations ?? []) {
        if (op.abstract === true) {
          errors.push({
            severity: "error",
            code: CONSTRAINT_ERROR_CODES.ClassAbstractOutsideAbstractClass,
            message: `Abstract method '${op.name}' is only allowed on an abstract class or interface`,
            nodeId: node.id,
          });
        }
      }
    }
  }
}

/**
 * Soft check: warn when a System Context diagram contains kinds that
 * c4model.com places on the deeper Container / Component tiers. Render
 * still proceeds — the diagnostic shows up in the errors panel and the
 * CodeMirror lint gutter.
 */
function enforceC4ContextTier(diagram: Diagram, errors: DiagramError[]): void {
  for (const node of diagram.nodes) {
    if (!C4_NODE_KINDS.has(node.kind)) continue;
    if (C4_CONTEXT_NODE_KINDS.has(node.kind)) continue;
    errors.push({
      severity: "warning",
      code: CONSTRAINT_ERROR_CODES.C4ContextKindMismatch,
      message: `Node kind '${node.kind}' is not part of a System Context diagram per c4model.com — move it to a Container or Component diagram.`,
      nodeId: node.id,
    });
  }
}

/**
 * Twin of `enforceC4ContextTier` for the Container tier. Components live
 * one level deeper, so flagging them on a Container diagram steers the
 * author toward the right tier.
 */
function enforceC4ContainerTier(diagram: Diagram, errors: DiagramError[]): void {
  for (const node of diagram.nodes) {
    if (!C4_NODE_KINDS.has(node.kind)) continue;
    if (C4_CONTAINER_NODE_KINDS.has(node.kind)) continue;
    errors.push({
      severity: "warning",
      code: CONSTRAINT_ERROR_CODES.C4ContainerKindMismatch,
      message: `Node kind '${node.kind}' is not part of a Container diagram per c4model.com — move it to a Component diagram.`,
      nodeId: node.id,
    });
  }
}

const C4_NODE_KINDS = new Set<NodeKind>([
  "person",
  "person-external",
  "system",
  "system-external",
  "container",
  "container-external",
  "component",
  "component-external",
  "database",
  "queue",
]);

/**
 * Subset of `C4_NODE_KINDS` that c4model.com permits on a System Context
 * diagram. Container / Component are deliberately excluded — they belong
 * on the deeper-tier diagrams. This matches the canonical guidance at
 * <https://c4model.com/diagrams/system-context>.
 *
 * The constraint is reported at WARNING severity (not ERROR), because
 * c4model itself frames the levels as guidance and our renderer copes
 * with mixed-level diagrams. Authors who genuinely want a hybrid view
 * can ignore the warning.
 */
const C4_CONTEXT_NODE_KINDS = new Set<NodeKind>([
  "person",
  "person-external",
  "system",
  "system-external",
  "database",
  "queue",
]);

/**
 * Subset of `C4_NODE_KINDS` that c4model.com permits on a Container
 * diagram per <https://c4model.com/diagrams/container>. Components are
 * excluded — they belong on the deeper Component-tier diagram.
 *
 * Like the Context-tier rule, this is reported at WARNING severity so
 * authors who deliberately mix levels still get a working render.
 */
const C4_CONTAINER_NODE_KINDS = new Set<NodeKind>([
  "person",
  "person-external",
  "system",
  "system-external",
  "container",
  "container-external",
  "database",
  "queue",
]);
const CLASS_NODE_KINDS = new Set<NodeKind>(["class", "interface", "abstract-class", "enum"]);
const ER_NODE_KINDS = new Set<NodeKind>(["entity"]);
const SEQUENCE_NODE_KINDS = new Set<NodeKind>([
  "lifeline",
  "actor",
  "lifeline-boundary",
  "lifeline-control",
  "lifeline-entity",
  "lifeline-collections",
  "database",
  "queue",
]);

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
  "lost-message",
  "found-message",
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

/**
 * Combined fragments must satisfy two structural rules:
 *  - `alt` and `par` need at least two operands (otherwise an `opt` would
 *    be the right kind);
 *  - every operand needs at least one message edge.
 *
 * Both rules guard against malformed AST input from imports / commands and
 * surface to the editor's error panel.
 */
function enforceSequenceFragments(diagram: Diagram, errors: DiagramError[]): void {
  for (const fragment of diagram.fragments ?? []) {
    if ((fragment.kind === "alt" || fragment.kind === "par") && fragment.operands.length < 2) {
      errors.push({
        severity: "error",
        code: CONSTRAINT_ERROR_CODES.SequenceFragmentTooFewOperands,
        message: `Combined fragment '${fragment.kind}' requires at least two operands`,
      });
    }
    for (const operand of fragment.operands) {
      if (operand.edges.length === 0 && fragment.kind !== "ref") {
        errors.push({
          severity: "warning",
          code: CONSTRAINT_ERROR_CODES.SequenceFragmentEmptyOperand,
          message: `Combined fragment '${fragment.kind}' has an empty operand`,
        });
      }
    }
  }
}

/**
 * Activation intervals reference message edges by id; an unbalanced /
 * dangling reference is almost always an authoring mistake.
 */
function enforceSequenceActivations(diagram: Diagram, errors: DiagramError[]): void {
  const edgeIds = new Set(diagram.edges.map((e) => e.id));
  for (const node of diagram.nodes) {
    for (const interval of node.activations ?? []) {
      // Standalone activations (no `fromEdgeId`) anchor by raw layout
      // coordinates and don't need any message edge to exist; skip them.
      if (interval.fromEdgeId === undefined) continue;
      const fromOk = edgeIds.has(interval.fromEdgeId);
      const toOk = interval.toEdgeId === undefined || edgeIds.has(interval.toEdgeId);
      if (!fromOk || !toOk) {
        errors.push({
          severity: "error",
          code: CONSTRAINT_ERROR_CODES.SequenceActivationUnbalanced,
          message: `Activation '${interval.id}' on lifeline '${node.label}' references a missing message edge`,
          nodeId: node.id,
        });
      }
    }
  }
}

/**
 * Notes need non-empty text and existing participants. Multi-participant
 * `over` notes still apply: every id must resolve to a known lifeline.
 */
function enforceSequenceNotes(diagram: Diagram, errors: DiagramError[]): void {
  const lifelineIds = new Set(diagram.nodes.map((n) => n.id));
  for (const note of diagram.notes ?? []) {
    if (note.text.trim() === "") {
      errors.push({
        severity: "warning",
        code: CONSTRAINT_ERROR_CODES.SequenceNoteEmpty,
        message: `Sequence note '${note.id}' has empty text`,
      });
    }
    for (const participant of note.participants) {
      if (!lifelineIds.has(participant)) {
        errors.push({
          severity: "error",
          code: CONSTRAINT_ERROR_CODES.SequenceNoteOrphanParticipant,
          message: `Sequence note '${note.id}' references unknown lifeline '${participant}'`,
        });
      }
    }
  }
}

/**
 * UML ER entities are attribute-only — no operations, generics, or enum
 * literals. The fields exist on the unified `DiagramNode` shape, but
 * carrying them on an entity is a modelling error and would silently
 * confuse generators / exporters.
 */
function enforceEntityMemberRules(diagram: Diagram, errors: DiagramError[]): void {
  for (const node of diagram.nodes) {
    if (node.kind !== "entity") continue;
    if ((node.operations?.length ?? 0) > 0) {
      errors.push({
        severity: "error",
        code: CONSTRAINT_ERROR_CODES.ErEntityHasOperations,
        message: `Entity '${node.label}' cannot declare operations`,
        nodeId: node.id,
      });
    }
    if ((node.enumLiterals?.length ?? 0) > 0) {
      errors.push({
        severity: "error",
        code: CONSTRAINT_ERROR_CODES.ErEntityHasEnumLiterals,
        message: `Entity '${node.label}' cannot declare enum literals`,
        nodeId: node.id,
      });
    }
    if ((node.generics?.length ?? 0) > 0) {
      errors.push({
        severity: "error",
        code: CONSTRAINT_ERROR_CODES.ErEntityHasGenerics,
        message: `Entity '${node.label}' cannot declare generic type parameters`,
        nodeId: node.id,
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
 * Tier-aware boundary check: c4model.com treats `System_Boundary` as the
 * envelope around the SUBJECT system, so its children should be tier-N+1
 * (Containers in a Container diagram, Components in a Component diagram).
 *
 * A `system` node inside a Container-diagram boundary almost always means
 * the author dragged a Software-System palette item where they wanted a
 * Container — flag it as a warning so the author can swap kinds via the
 * props panel (or a future quick-fix). External nodes are exempt because
 * "external system inside our boundary" is occasionally legitimate.
 */
function enforceC4BoundaryTier(diagram: Diagram, errors: DiagramError[]): void {
  if (diagram.type === "c4-context") return; // Context boundary may contain anything tier-0.

  const allowedInside =
    diagram.type === "c4-container"
      ? CONTAINER_BOUNDARY_CHILD_KINDS
      : COMPONENT_BOUNDARY_CHILD_KINDS;
  const tierLabel = diagram.type === "c4-container" ? "Container" : "Component";

  const nodeKinds = new Map(diagram.nodes.map((node) => [node.id, node.kind] as const));
  for (const group of diagram.groups) {
    if (group.kind !== "boundary") continue;
    for (const childId of group.children) {
      const kind = nodeKinds.get(childId);
      if (kind === undefined) continue;
      if (!C4_NODE_KINDS.has(kind)) continue; // covered by C4BoundaryChildKind
      if (allowedInside.has(kind)) continue;
      errors.push({
        severity: "warning",
        code: CONSTRAINT_ERROR_CODES.C4BoundaryTierMismatch,
        message: `Node kind '${kind}' inside a ${tierLabel}-tier boundary should be a ${tierLabel.toLowerCase()} per c4model.com — convert it via the properties panel.`,
        groupId: group.id,
        nodeId: childId,
      });
    }
  }
}

const CONTAINER_BOUNDARY_CHILD_KINDS = new Set<NodeKind>([
  "container",
  "container-external",
  "database",
  "queue",
]);

const COMPONENT_BOUNDARY_CHILD_KINDS = new Set<NodeKind>([
  "component",
  "component-external",
  "database",
  "queue",
]);

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

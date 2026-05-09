/**
 * Stable error codes emitted by the multi-level validator stack.
 *
 * Codes never change once published — downstream consumers (the props panel,
 * the CodeMirror lint extension, the quick-fix registry) match on them. New
 * rules append new codes; existing codes don't get repurposed.
 *
 * Levels:
 *   - SYNTAX_*    — emitted by the parser (re-exported from `parser/errors`).
 *   - SEM_*       — semantic invariants (id uniqueness, edge endpoints, …).
 *   - CONSTRAINT_*— per-diagram-type rules (kind whitelists, cardinality).
 *   - LINT_*      — soft warnings (orphan nodes, duplicate labels, cycles).
 */
export const SEMANTIC_ERROR_CODES = {
  DuplicateNodeId: "SEM_DUPLICATE_NODE_ID",
  DuplicateEdgeId: "SEM_DUPLICATE_EDGE_ID",
  DuplicateGroupId: "SEM_DUPLICATE_GROUP_ID",
  EdgeDanglingSource: "SEM_EDGE_DANGLING_SOURCE",
  EdgeDanglingTarget: "SEM_EDGE_DANGLING_TARGET",
  GroupChildMissing: "SEM_GROUP_CHILD_MISSING",
  NodeLabelEmpty: "SEM_NODE_LABEL_EMPTY",
  GroupLabelEmpty: "SEM_GROUP_LABEL_EMPTY",
} as const;

export type SemanticErrorCode = (typeof SEMANTIC_ERROR_CODES)[keyof typeof SEMANTIC_ERROR_CODES];

export const CONSTRAINT_ERROR_CODES = {
  NodeKindNotAllowed: "CONSTRAINT_NODE_KIND_NOT_ALLOWED",
  EdgeKindNotAllowed: "CONSTRAINT_EDGE_KIND_NOT_ALLOWED",
  C4BoundaryChildKind: "CONSTRAINT_C4_BOUNDARY_CHILD_KIND",
  C4BoundaryTierMismatch: "CONSTRAINT_C4_BOUNDARY_TIER_MISMATCH",
  C4ContextKindMismatch: "CONSTRAINT_C4_CONTEXT_KIND_MISMATCH",
  C4ContainerKindMismatch: "CONSTRAINT_C4_CONTAINER_KIND_MISMATCH",
  SequenceEdgeNonLifeline: "CONSTRAINT_SEQUENCE_EDGE_NON_LIFELINE",
  ErEdgeNonEntity: "CONSTRAINT_ER_EDGE_NON_ENTITY",
  ErCardinalityMissing: "CONSTRAINT_ER_CARDINALITY_MISSING",
  ErCardinalityInvalid: "CONSTRAINT_ER_CARDINALITY_INVALID",
} as const;

export type ConstraintErrorCode =
  (typeof CONSTRAINT_ERROR_CODES)[keyof typeof CONSTRAINT_ERROR_CODES];

export const LINT_ERROR_CODES = {
  OrphanNode: "LINT_ORPHAN_NODE",
  DuplicateLabel: "LINT_DUPLICATE_LABEL",
  InheritanceCycle: "LINT_INHERITANCE_CYCLE",
  C4EmptyRelLabel: "LINT_C4_EMPTY_REL_LABEL",
} as const;

export type LintErrorCode = (typeof LINT_ERROR_CODES)[keyof typeof LINT_ERROR_CODES];

export type ValidatorErrorCode = SemanticErrorCode | ConstraintErrorCode | LintErrorCode;

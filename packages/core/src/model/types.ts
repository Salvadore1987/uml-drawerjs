/**
 * AST type surface for UML Drawer JS.
 *
 * Mirrors `docs/uml-drawer.md` § Data Model. The AST is the single source of
 * truth — every visual or textual mutation converges on these types via CQRS
 * commands. All optional fields follow `exactOptionalPropertyTypes`: a missing
 * property is allowed, but assigning `undefined` explicitly is not.
 */

/** Diagram type, fixed at creation. The renderer dispatches on this value. */
export type DiagramType =
  | "c4-context"
  | "c4-container"
  | "c4-component"
  | "class"
  | "er"
  | "sequence";

/**
 * Discriminated kind of a graphical node. Different diagram types accept
 * different subsets — enforced by the constraints validator (Phase 6), not by
 * the type system, so that the AST shape stays uniform across diagram types.
 */
export type NodeKind =
  // C4 Context / Container / Component
  | "person"
  | "person-external"
  | "system"
  | "system-external"
  | "container"
  | "container-external"
  | "component"
  | "database"
  | "queue"
  // Class
  | "class"
  | "interface"
  | "abstract-class"
  | "enum"
  // Entity Relationship
  | "entity"
  // Sequence
  | "lifeline"
  | "actor";

/** Discriminated kind of a graphical edge between two nodes. */
export type EdgeKind =
  // C4
  | "uses"
  | "depends-on"
  // Class
  | "association"
  | "inheritance"
  | "realization"
  | "composition"
  | "aggregation"
  | "dependency"
  // Entity Relationship
  | "one-to-one"
  | "one-to-many"
  | "many-to-many"
  // Sequence
  | "sync-call"
  | "async-call"
  | "return"
  | "create"
  | "destroy";

/** Container kind for nested groupings (boundary / package / system scope). */
export type GroupKind = "boundary" | "package" | "system";

/** Visibility marker on class members. */
export type Visibility = "public" | "protected" | "private" | "package";

/** Edge arrowhead style; renderer maps these to SVG markers. */
export type ArrowheadKind =
  | "none"
  | "arrow"
  | "open-arrow"
  | "diamond"
  | "open-diamond"
  | "triangle"
  | "open-triangle";

/** Style overrides for a node. Renderer-agnostic — pure data. */
export interface NodeStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  textColor?: string;
  fontFamily?: string;
  fontSize?: number;
  borderRadius?: number;
}

/** Style overrides for an edge. */
export interface EdgeStyle {
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  textColor?: string;
  fontFamily?: string;
  fontSize?: number;
  arrowStart?: ArrowheadKind;
  arrowEnd?: ArrowheadKind;
}

/** Map of element id → style overrides. Used for AST-wide style sheets. */
export type StyleMap = Record<string, NodeStyle | EdgeStyle>;

/** Operation parameter (for Class / Sequence operations). */
export interface OperationParameter {
  name: string;
  type?: string;
  default?: string;
}

/** Operation / method on a Class node. */
export interface Operation {
  id: string;
  name: string;
  parameters?: OperationParameter[];
  returnType?: string;
  visibility?: Visibility;
  static?: boolean;
  abstract?: boolean;
  description?: string;
}

/** Attribute on a Class or column on an ER Entity. */
export interface Attribute {
  id: string;
  name: string;
  type?: string;
  visibility?: Visibility;
  multiplicity?: string;
  default?: string;
  primaryKey?: boolean;
  foreignKey?: boolean;
  nullable?: boolean;
  description?: string;
}

/** Cardinality labels at edge endpoints (used by ER and Class). */
export interface EdgeCardinality {
  source?: string;
  target?: string;
}

/**
 * Layout coordinates for a single node, encoded into PlantUML
 * `' @drawer:meta {...}` comments and survived in `.umljson`.
 *
 * `width` / `height` are optional and only present when a user has
 * explicitly resized the node — auto-layout writes only `x` / `y`. The
 * renderer falls back to `RENDERER_DEFAULTS` when the size fields are
 * absent, so older diagrams without dimensions render unchanged.
 */
export interface LayoutCoordinate {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

/** Per-AST metadata — versioning + persisted layout overrides. */
export interface DiagramMetadata {
  schemaVersion: string;
  layoutOverrides?: Record<string, LayoutCoordinate>;
  /**
   * PlantUML constructs we don't yet model (preprocessor, !include, raw
   * skinparam blocks). Stored verbatim so generator round-trips them.
   */
  opaque?: string[];
}

/** Graphical node — a class, entity, container, lifeline, etc. */
export interface DiagramNode {
  id: string;
  kind: NodeKind;
  label: string;
  stereotype?: string;
  technology?: string;
  description?: string;
  attributes?: Attribute[];
  operations?: Operation[];
  style?: NodeStyle;
}

/** Graphical edge — association, inheritance, sync-call, etc. */
export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label?: string;
  cardinality?: EdgeCardinality;
  style?: EdgeStyle;
}

/** Container grouping — Boundary, Package, System scope. */
export interface DiagramGroup {
  id: string;
  kind: GroupKind;
  label: string;
  /** ids of contained nodes and/or nested groups. */
  children: string[];
  description?: string;
  style?: NodeStyle;
}

/** Top-level AST root. The CQRS layer (Phase 3) returns new instances on every command. */
export interface Diagram {
  id: string;
  type: DiagramType;
  title?: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
  styles?: StyleMap;
  metadata: DiagramMetadata;
}

/** Severity classifier for diagnostics surfaced by the validator stack. */
export type DiagramErrorSeverity = "error" | "warning" | "info";

/** Quick-fix descriptor for a `DiagramError`. `apply` is a closure registered
 *  by the validator that produced the error; it usually dispatches a Command. */
export interface DiagramErrorFix {
  label: string;
  apply: () => void;
}

/**
 * Unified error / warning shape produced by the four validator levels
 * (syntax → semantic → constraints → lint). `range` is in the source text;
 * `nodeId` points into the AST.
 */
export interface DiagramError {
  severity: DiagramErrorSeverity;
  code: string;
  message: string;
  range?: { from: number; to: number };
  nodeId?: string;
  edgeId?: string;
  groupId?: string;
  fix?: DiagramErrorFix;
}

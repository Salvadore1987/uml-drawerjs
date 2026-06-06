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
  | "component-external"
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
  | "actor"
  | "lifeline-boundary"
  | "lifeline-control"
  | "lifeline-entity"
  | "lifeline-collections";

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
  | "destroy"
  | "lost-message"
  | "found-message";

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

/**
 * Attribute on a Class or column on an ER Entity.
 *
 * Class-only modifiers: `readonly`, `static`.
 * ER-only flags: `primaryKey`, `foreignKey`, `nullable` — these are ignored
 * by the class renderer (kind-aware formatting in `renderer/nodes.ts`).
 */
export interface Attribute {
  id: string;
  name: string;
  type?: string;
  visibility?: Visibility;
  multiplicity?: string;
  default?: string;
  /** Class-only: marks an immutable field, rendered with `{readonly}` modifier. */
  readonly?: boolean;
  /** Class-only: marks a class-level field, rendered with underline. */
  static?: boolean;
  /** ER-only. */
  primaryKey?: boolean;
  /** ER-only. */
  foreignKey?: boolean;
  /** ER-only. */
  nullable?: boolean;
  description?: string;
}

/** A single literal in an enum body (Class diagram). */
export interface EnumLiteral {
  id: string;
  name: string;
}

/**
 * Sequence-only: an interval during which a lifeline is "active" (running an
 * execution specification).
 *
 * Two anchoring modes:
 *   1. Edge-anchored — `fromEdgeId` is the message that begins the
 *      activation; `toEdgeId` is the message that closes it (open-ended if
 *      absent — closes at the bottom of the diagram). Authored by the
 *      parser via `++` / `activate X` shortcuts.
 *   2. Standalone — both `fromEdgeId` and `toEdgeId` are absent; the
 *      activation positions itself with raw layout-pixel coordinates
 *      `topPx` (from the top of the timeline, below the lifeline head)
 *      and `heightPx`. Used by the "Activation Bar" palette item so
 *      authors can place an activation independent of any message.
 *
 * `topExtraPx` / `bottomExtraPx` are pixel offsets applied on top of the
 * resolved geometry (positive grows; negative shrinks). The N / S resize
 * handles mutate these in increments of the grid step so the bar edge
 * always lands on a visible grid cell — same convention as fragments.
 */
export interface ActivationInterval {
  id: string;
  fromEdgeId?: string;
  toEdgeId?: string;
  /** Standalone activations only: top position in layout pixels, measured
   *  from the start of the timeline (below the lifeline head). */
  topPx?: number;
  /** Standalone activations only: height in layout pixels. */
  heightPx?: number;
  /** Grow / shrink at the top (raw layout pixels). */
  topExtraPx?: number;
  /** Grow / shrink at the bottom (raw layout pixels). */
  bottomExtraPx?: number;
}

/**
 * Sequence-only: one operand of a combined fragment. `alt` and `par` accept
 * many; `opt`, `loop`, `break`, `critical`, `ref` accept one. `edges` lists
 * the message edges that fall inside this operand in chronological order.
 */
export interface FragmentOperand {
  id: string;
  guard?: string;
  edges: string[];
}

/** Sequence-only: combined-fragment kinds (UML SD interaction operators). */
export type FragmentKind = "alt" | "opt" | "loop" | "par" | "break" | "critical" | "ref";

/**
 * Sequence-only: combined fragment. Stored as a flat array on the diagram;
 * nesting is captured via `parentId` + `parentOperandId`.
 *
 * `coveredParticipants` is an optional override for the horizontal span.
 * When absent, the renderer derives the frame's left/right edges from the
 * participant lifelines of the contained edges. When present, it pins
 * the frame to a contiguous slice of `diagram.nodes` (by id) — used by
 * the E / W resize handles in the editor so the user can cover empty
 * lifelines that have no messages of their own inside the fragment.
 * The list MUST be a contiguous slice of `diagram.nodes` ordered by
 * their column position (= their order in the array).
 */
export interface CombinedFragment {
  id: string;
  kind: FragmentKind;
  label?: string;
  parentId?: string;
  parentOperandId?: string;
  operands: FragmentOperand[];
  coveredParticipants?: string[];
  /**
   * Per-cell vertical overrides for the visible frame, measured in
   * layout pixels. Default 0/absent → auto-fit to contained edges.
   * Positive `topExtraPx` extends the frame above its first contained
   * edge; positive `bottomExtraPx` extends below the last contained
   * edge. Negative values shrink the frame. The N / S resize handles
   * mutate these offsets in increments of `--uml-canvas-grid-density`
   * (default 12 px) so the frame edge always lands on a visible grid
   * cell — same convention as node move / resize. Operand `edges`
   * lists are left untouched — these fields are purely visual.
   */
  topExtraPx?: number;
  bottomExtraPx?: number;
}

/**
 * Sequence-only: textual annotation attached to one or more lifelines.
 * `placement` selects the visual anchor; `participants` references node IDs.
 * `anchorEdgeId` pins the note to a chronological position; absent means top.
 */
export interface SequenceNote {
  id: string;
  placement: "left" | "right" | "over";
  participants: string[];
  text: string;
  anchorEdgeId?: string;
}

/**
 * Sequence-only: divider band (`==Phase X==`) that segments the diagram
 * vertically. `afterEdgeId` anchors the divider after a specific message;
 * absent means at the very top.
 */
export interface SequenceDivider {
  id: string;
  label: string;
  afterEdgeId?: string;
}

/**
 * Per-end fields on a class-diagram edge, mirroring the UML `AssociationEnd`
 * metaclass. `multiplicity` is a UML expression (`1`, `0..1`, `1..*`); `role`
 * is the named role at this end; `navigability` toggles the open arrow at the
 * end. Generator emits these for class diagrams; ER diagrams keep the legacy
 * `cardinality` shape on `DiagramEdge`.
 */
export interface EdgeEndpoint {
  role?: string;
  multiplicity?: string;
  navigability?: "navigable" | "non-navigable" | "unspecified";
}

/** Per-edge endpoint pair (class diagrams). */
export interface EdgeEnds {
  source?: EdgeEndpoint;
  target?: EdgeEndpoint;
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
  /**
   * Sequence-only: auto-numbering settings. When set, the renderer prefixes
   * every message label with the formatted counter and the generator emits
   * an `autonumber` line at the top of the diagram.
   */
  sequenceAutoNumber?: {
    start: number;
    increment: number;
    format?: string;
  };
}

/** Graphical node — a class, entity, container, lifeline, etc. */
export interface DiagramNode {
  id: string;
  kind: NodeKind;
  label: string;
  /**
   * Optional PlantUML alias — the symbolic name authors use as the first
   * argument of macros like `Person(customer, "Customer")` or in sequence
   * `as` clauses (`participant "Web App" as web`). When set, the generator
   * round-trips this name so authored aliases survive parse → generate
   * cycles; when absent, the generator derives one from the label or id.
   */
  alias?: string;
  stereotype?: string;
  technology?: string;
  description?: string;
  attributes?: Attribute[];
  operations?: Operation[];
  /**
   * Class-only: generic type parameters in declaration order. Each entry is
   * the raw token (e.g. `"T"`, `"K extends Comparable<K>"`) — the renderer
   * joins them with commas inside `<…>`. Empty array is treated as absent.
   */
  generics?: string[];
  /**
   * Class-only (kind === "enum"): the literal values in declaration order.
   * Modelled as a separate field rather than reusing `attributes` so the
   * validator can hard-error on `enum.attributes` (see ADR-0007).
   */
  enumLiterals?: EnumLiteral[];
  /**
   * Sequence-only: activation intervals on this lifeline, in chronological
   * order. Each interval refers to existing edges by ID. See ADR-0010.
   */
  activations?: ActivationInterval[];
  style?: NodeStyle;
}

/** Graphical edge — association, inheritance, sync-call, etc. */
export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label?: string;
  /**
   * C4 relationships: the technology / protocol carried by the relationship —
   * the 4th `Rel(from, to, "label", "technology")` argument, e.g. "HTTPS/JSON".
   * The `label` field carries the action name (verb phrase) alongside it.
   */
  technology?: string;
  /**
   * ER + legacy class diagrams: flat per-end multiplicity strings. Class
   * diagrams now prefer `ends` (richer per-end shape with role + navigability).
   */
  cardinality?: EdgeCardinality;
  /**
   * Class diagrams: per-end role / multiplicity / navigability. When present,
   * the renderer/generator use this; `cardinality` is the fallback for ER.
   * See ADR-0008.
   */
  ends?: EdgeEnds;
  /** Sequence-only: shortcut — mark this message as activating its target. */
  activatesTarget?: boolean;
  /** Sequence-only: shortcut — mark this message as deactivating its source. */
  deactivatesSource?: boolean;
  style?: EdgeStyle;
}

/** Container grouping — Boundary, Package, System scope. */
export interface DiagramGroup {
  id: string;
  kind: GroupKind;
  label: string;
  /**
   * Optional PlantUML alias — the symbolic name that appears as the first
   * argument of `System_Boundary(alias, "label")`. When omitted, the
   * generator derives one from `id` so the output stays valid PlantUML.
   * Editable through the props panel so authors can keep readable names.
   */
  alias?: string;
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
  /** Sequence-only: combined fragments (alt/opt/loop/par/break/critical/ref). */
  fragments?: CombinedFragment[];
  /** Sequence-only: textual notes anchored to one or more lifelines. */
  notes?: SequenceNote[];
  /** Sequence-only: divider bands (`==Phase X==`). */
  dividers?: SequenceDivider[];
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

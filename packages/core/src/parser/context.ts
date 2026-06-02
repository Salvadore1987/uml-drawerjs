import { uuidv7 } from "../model/ids.js";
import type {
  CombinedFragment,
  Diagram,
  DiagramEdge,
  DiagramError,
  DiagramGroup,
  DiagramNode,
  DiagramType,
  LayoutCoordinate,
  NodeKind,
  SequenceDivider,
  SequenceNote,
  StyleMap,
} from "../model/types.js";

/** A frame on `ParseContext.openClassStack` — open class / interface / etc. body. */
export interface OpenClassFrame {
  nodeId: string;
  kind: NodeKind;
}

/** A frame on `ParseContext.openEntityStack` — open entity body (ER diagrams). */
export interface OpenEntityFrame {
  nodeId: string;
}

/**
 * A frame on `ParseContext.openFragmentStack` — open combined-fragment body
 * (sequence diagrams). `currentOperandId` rotates as `else` lines are seen.
 */
export interface OpenFragmentFrame {
  fragmentId: string;
  currentOperandId: string;
}

/**
 * A frame on `ParseContext.openNoteStack` — open multi-line note body
 * (sequence diagrams). The note's text accumulates until `end note`.
 */
export interface OpenNoteFrame {
  noteId: string;
  lines: string[];
}

/**
 * Per-lifeline activation tracking — open intervals are pushed when an
 * `activate X` line (or `++` shortcut) is seen and popped when a matching
 * `deactivate X` (or `--`) closes them. Each entry holds the activation id
 * so the parser can fill in `toEdgeId` on close.
 */
export interface OpenActivation {
  activationId: string;
  lifelineNodeId: string;
}

export interface ParseOptions {
  /** Diagram type — fixed at creation, not inferred from source. */
  diagramType: DiagramType;
  /** Optional explicit id; otherwise uuidv7 is used. */
  diagramId?: string;
  /**
   * ID factory used for every newly-created element (nodes, edges, groups,
   * attributes, operations). Defaults to `uuidv7`. Tests pass a counter so
   * snapshot fixtures stay deterministic.
   */
  idFactory?: () => string;
}

/**
 * Mutable parser state — accumulated as the line dispatcher walks the
 * source. Finalised into a `Diagram` by `finalize()` at end-of-input.
 */
export interface ParseContext {
  readonly options: Readonly<Required<Pick<ParseOptions, "diagramType">> & ParseOptions>;
  readonly diagramId: string;
  readonly idFactory: () => string;
  /** Maps a PlantUML alias (e.g. `customer`) to the AST node id. */
  readonly aliases: Map<string, string>;
  title: string | null;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
  styles: StyleMap | null;
  layoutOverrides: Record<string, LayoutCoordinate> | null;
  opaque: string[];
  errors: DiagramError[];
  /** Whether we have seen `@startuml` / `@enduml` markers. */
  sawStart: boolean;
  sawEnd: boolean;
  /**
   * Stack of currently-open boundary group ids. Pushed on `System_Boundary
   * (alias, "label") {`, popped on the matching `}`. Nodes / nested
   * boundaries created while the stack is non-empty are auto-attached to
   * the top group's `children` so the AST reflects PlantUML nesting.
   */
  openGroupStack: string[];
  /**
   * Stack of currently-open class-body frames. Pushed when a class /
   * interface / abstract class / enum declaration ends with `{`; popped on
   * the matching `}`. While non-empty, the class member parser routes
   * attribute / operation / enum-literal lines to the top frame's node.
   */
  openClassStack: OpenClassFrame[];
  /**
   * Stack of currently-open entity-body frames (ER diagrams). Pushed when an
   * `entity Foo {` declaration is seen; popped on the matching `}`. While
   * non-empty, the entity member parser routes column lines (`* id : UUID`)
   * to the top frame's node.
   */
  openEntityStack: OpenEntityFrame[];
  /**
   * Sequence diagrams: stack of currently-open combined fragments. Edges
   * parsed while the stack is non-empty append to the top frame's current
   * operand `edges[]`. Nesting captured by `parentId` + `parentOperandId`
   * on the popped fragment.
   */
  openFragmentStack: OpenFragmentFrame[];
  /**
   * Sequence diagrams: stack of currently-open multi-line note bodies.
   * While non-empty, raw lines accumulate into the top frame's `lines[]`
   * until `end note` closes it.
   */
  openNoteStack: OpenNoteFrame[];
  /**
   * Sequence diagrams: per-lifeline stack of open activation intervals.
   * Keyed by node id; each entry records the activation id so a matching
   * `deactivate X` (or `--` shortcut) can close it.
   */
  openActivations: Map<string, OpenActivation[]>;
  /**
   * Sequence diagrams: combined fragments, in declaration order.
   * Populated by the parser as `alt`/`opt`/etc. blocks close.
   */
  fragments: CombinedFragment[];
  /** Sequence diagrams: notes, in declaration order. */
  notes: SequenceNote[];
  /** Sequence diagrams: dividers, in declaration order. */
  dividers: SequenceDivider[];
  /**
   * Sequence diagrams: most recently parsed edge id. Used to anchor notes,
   * dividers, and activation intervals to a specific time-axis position.
   */
  lastEdgeId: string | null;
  /** Sequence diagrams: auto-number settings declared via `autonumber …`. */
  sequenceAutoNumber: { start: number; increment: number; format?: string } | null;
}

export function createParseContext(options: ParseOptions): ParseContext {
  const idFactory = options.idFactory ?? uuidv7;
  return {
    options,
    diagramId: options.diagramId ?? idFactory(),
    idFactory,
    aliases: new Map(),
    title: null,
    nodes: [],
    edges: [],
    groups: [],
    styles: null,
    layoutOverrides: null,
    opaque: [],
    errors: [],
    sawStart: false,
    sawEnd: false,
    openGroupStack: [],
    openClassStack: [],
    openEntityStack: [],
    openFragmentStack: [],
    openNoteStack: [],
    openActivations: new Map(),
    fragments: [],
    notes: [],
    dividers: [],
    lastEdgeId: null,
    sequenceAutoNumber: null,
  };
}

/**
 * Resolve a PlantUML alias to its AST id, allocating one on first sight.
 * Returns `null` if `mode === "lookup"` and the alias is unknown.
 */
export function resolveAlias(
  ctx: ParseContext,
  alias: string,
  mode: "lookup" | "create" = "create",
): string | null {
  const known = ctx.aliases.get(alias);
  if (known !== undefined) return known;
  if (mode === "lookup") return null;
  const id = ctx.idFactory();
  ctx.aliases.set(alias, id);
  return id;
}

/** Allocate a fresh id (no alias linkage). */
export function freshId(ctx: ParseContext): string {
  return ctx.idFactory();
}

/** Compose the final `Diagram` from parser state. */
export function finalize(ctx: ParseContext): Diagram {
  const metadata: Diagram["metadata"] = { schemaVersion: "0.1.0" };
  if (ctx.layoutOverrides) {
    metadata.layoutOverrides = remapAliasKeysToIds(ctx.layoutOverrides, ctx.aliases);
  }
  if (ctx.opaque.length > 0) metadata.opaque = ctx.opaque;
  if (ctx.sequenceAutoNumber) metadata.sequenceAutoNumber = ctx.sequenceAutoNumber;

  const diagram: Diagram = {
    id: ctx.diagramId,
    type: ctx.options.diagramType,
    nodes: ctx.nodes,
    edges: ctx.edges,
    groups: ctx.groups,
    metadata,
  };
  if (ctx.title) diagram.title = ctx.title;
  if (ctx.styles) diagram.styles = remapAliasKeysToIds(ctx.styles, ctx.aliases);
  if (ctx.fragments.length > 0) diagram.fragments = ctx.fragments;
  if (ctx.notes.length > 0) diagram.notes = ctx.notes;
  if (ctx.dividers.length > 0) diagram.dividers = ctx.dividers;
  return diagram;
}

/**
 * Rewrite a record's keys from PlantUML alias → AST id via `ctx.aliases`.
 * Keys that are not in the alias map pass through verbatim — this keeps
 * legacy UUID-keyed payloads (written before the generator started
 * emitting alias keys) intact even though the renderer will not match
 * them. The next `exportText()` rewrites them to aliases automatically.
 */
function remapAliasKeysToIds<T>(
  record: Record<string, T>,
  aliases: ReadonlyMap<string, string>,
): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    const id = aliases.get(key);
    result[id ?? key] = value;
  }
  return result;
}

import { uuidv7 } from "../model/ids.js";
import type {
  Diagram,
  DiagramEdge,
  DiagramError,
  DiagramGroup,
  DiagramNode,
  DiagramType,
  LayoutCoordinate,
  StyleMap,
} from "../model/types.js";

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
  if (ctx.layoutOverrides) metadata.layoutOverrides = ctx.layoutOverrides;
  if (ctx.opaque.length > 0) metadata.opaque = ctx.opaque;

  const diagram: Diagram = {
    id: ctx.diagramId,
    type: ctx.options.diagramType,
    nodes: ctx.nodes,
    edges: ctx.edges,
    groups: ctx.groups,
    metadata,
  };
  if (ctx.title) diagram.title = ctx.title;
  if (ctx.styles) diagram.styles = ctx.styles;
  return diagram;
}

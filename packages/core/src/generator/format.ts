import type {
  Diagram,
  DiagramGroup,
  DiagramNode,
  LayoutCoordinate,
  StyleMap,
} from "../model/types.js";
import { formatMetaComment, type DrawerNodeExtras } from "../parser/meta.js";

/**
 * Shared formatting helpers used by every per-type renderer. Keeps escape
 * rules, alias derivation and meta-encoding in a single place so the
 * dispatchers stay focused on diagram-specific syntax.
 */

const NON_WORD = /[^A-Za-z0-9_]/gu;

/**
 * Derive a PlantUML-safe alias (`\w+`) from an AST id. Aliases must round-trip
 * losslessly through the parser, so we pick a deterministic transformation
 * that depends only on `id` — not on labels (which can repeat or contain
 * unicode).
 *
 * Why the `n_` prefix: PlantUML aliases that begin with a digit are still
 * legal but sometimes confuse downstream tools; prefixing keeps the output
 * conservative.
 */
export function aliasFromId(id: string): string {
  const sanitized = id.replace(NON_WORD, "_");
  return sanitized.length === 0 ? "n_" : sanitized.startsWith("n_") ? sanitized : `n_${sanitized}`;
}

/** Escape `"` and `\` for safe inclusion inside a PlantUML `"..."` literal. */
export function escapeStringLiteral(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"');
}

/**
 * Build the alias index for a diagram: every node and every group id maps
 * to a stable PlantUML alias. Groups share the namespace because Boundary
 * macros use the alias position too.
 *
 * Class- and ER-style declarations (`class Foo`, `entity Foo`) tie the
 * PlantUML alias to the node's *label* — there's no `as` form for them.
 * To round-trip cleanly we prefer the label as alias when it is a unique
 * `\w+` identifier; otherwise we fall back to a sanitized derivative of
 * the AST id (which always produces a valid alias, at the cost of losing
 * the original visual label for diagram types that can't carry a separate
 * label, like ER and class).
 */
const WORD_ONLY = /^[A-Za-z0-9_]+$/u;

export function buildAliasIndex(diagram: Diagram): Map<string, string> {
  const result = new Map<string, string>();
  const taken = new Set<string>();
  const assign = (id: string, label: string, explicit?: string): void => {
    // Explicit alias takes priority — that's the user-edited PlantUML
    // identifier from the props panel. Fall back to label-as-alias when
    // it's a clean `\w+` and unique, then to the sanitized id.
    let alias: string;
    if (explicit && WORD_ONLY.test(explicit) && !taken.has(explicit)) {
      alias = explicit;
    } else if (WORD_ONLY.test(label) && !taken.has(label)) {
      alias = label;
    } else {
      alias = aliasFromId(id);
    }
    result.set(id, alias);
    taken.add(alias);
  };
  for (const node of diagram.nodes) assign(node.id, node.label, node.alias);
  for (const group of diagram.groups) assign(group.id, group.label, group.alias);
  return result;
}

/** Resolve an id to its alias or fall back to the sanitized id (for unknown refs). */
export function lookupAlias(index: Map<string, string>, id: string): string {
  return index.get(id) ?? aliasFromId(id);
}

/**
 * If the diagram carries layout overrides or per-element style overrides,
 * emit a single `' @drawer:meta {...}` line that the parser will decode
 * back into `metadata.layoutOverrides` / `styles`. Returns `null` when
 * there is nothing to encode.
 *
 * Keys in the on-the-wire payload are *aliases* (the PlantUML symbol the
 * user writes — `customer`, `orderSystem`), not AST UUIDs. Aliases are
 * stable across parses; UUIDs are not (the parser allocates a fresh one
 * per `loadFromText`). The parser's `finalize` step reverses this
 * translation by looking each key up in `ctx.aliases`. Anything that
 * cannot be resolved to a node/group on either side is preserved verbatim
 * so legacy UUID-keyed payloads continue to round-trip without loss.
 */
export function formatDiagramMeta(diagram: Diagram): string | null {
  const layoutOverrides = diagram.metadata.layoutOverrides;
  const styles = diagram.styles;
  const aliasIndex = buildAliasIndex(diagram);
  const nodeExtras = collectC4NodeExtras(diagram, aliasIndex);
  const hasLayout = layoutOverrides && Object.keys(layoutOverrides).length > 0;
  const hasStyles = styles && Object.keys(styles).length > 0;
  const hasExtras = nodeExtras !== null;
  if (!hasLayout && !hasStyles && !hasExtras) return null;

  const payload: {
    layoutOverrides?: Record<string, LayoutCoordinate>;
    styles?: StyleMap;
    nodeExtras?: Record<string, DrawerNodeExtras>;
  } = {};
  if (hasLayout) payload.layoutOverrides = sortRecord(remapToAliases(layoutOverrides, aliasIndex));
  if (hasStyles) payload.styles = sortRecord(remapToAliases(styles, aliasIndex));
  if (hasExtras) payload.nodeExtras = nodeExtras;
  return formatMetaComment(payload);
}

/** C4 node kinds whose macros (`Person`, `System`, and their `_Ext` forms)
 * carry neither a stereotype nor a technology slot, so both fields would be
 * lost on round-trip without the sidecar. */
const PERSON_SYSTEM_KINDS = new Set<DiagramNode["kind"]>([
  "person",
  "person-external",
  "system",
  "system-external",
]);

/**
 * Collect C4 node fields the standard macros cannot express, so they can
 * ride the `nodeExtras` sidecar instead of being silently dropped:
 *
 * - `stereotype` — no C4 macro has a slot for it, so it always travels here.
 * - `technology` — only for the Person/System family; Container/Component
 *   macros already carry technology as a positional argument, so emitting it
 *   here too would duplicate it.
 *
 * Keys are aliases (matching `layoutOverrides`/`styles`) so the round-trip
 * survives id reallocation. Returns `null` for non-C4 diagrams and when
 * nothing needs sidecar storage.
 */
function collectC4NodeExtras(
  diagram: Diagram,
  aliasIndex: Map<string, string>,
): Record<string, DrawerNodeExtras> | null {
  if (
    diagram.type !== "c4-context" &&
    diagram.type !== "c4-container" &&
    diagram.type !== "c4-component"
  ) {
    return null;
  }
  const result: Record<string, DrawerNodeExtras> = {};
  for (const node of diagram.nodes) {
    const extras: DrawerNodeExtras = {};
    if (node.stereotype) extras.stereotype = node.stereotype;
    if (PERSON_SYSTEM_KINDS.has(node.kind) && node.technology) {
      extras.technology = node.technology;
    }
    if (Object.keys(extras).length > 0) {
      result[lookupAlias(aliasIndex, node.id)] = extras;
    }
  }
  return Object.keys(result).length > 0 ? sortRecord(result) : null;
}

/**
 * Rewrite a record's keys from AST id → PlantUML alias via the supplied
 * index. Keys that are not in the index (already-aliased payloads,
 * legacy data, or references to elements that vanished) pass through
 * unchanged so the round-trip is conservative.
 */
function remapToAliases<T>(
  record: Record<string, T>,
  aliasIndex: Map<string, string>,
): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [id, value] of Object.entries(record)) {
    const alias = aliasIndex.get(id);
    result[alias ?? id] = value;
  }
  return result;
}

/** Sort a record by keys to keep generator output deterministic. */
function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = record[key] as T;
  }
  return sorted;
}

/** Convenience: a node's alias, falling back to the sanitized id. */
export function nodeAlias(index: Map<string, string>, node: DiagramNode): string {
  return lookupAlias(index, node.id);
}

/** Convenience: a group's alias, falling back to the sanitized id. */
export function groupAlias(index: Map<string, string>, group: DiagramGroup): string {
  return lookupAlias(index, group.id);
}

import type {
  Diagram,
  DiagramGroup,
  DiagramNode,
  LayoutCoordinate,
  StyleMap,
} from "../model/types.js";
import { formatMetaComment } from "../parser/meta.js";

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
 */
export function formatDiagramMeta(diagram: Diagram): string | null {
  const layoutOverrides = diagram.metadata.layoutOverrides;
  const styles = diagram.styles;
  const hasLayout = layoutOverrides && Object.keys(layoutOverrides).length > 0;
  const hasStyles = styles && Object.keys(styles).length > 0;
  if (!hasLayout && !hasStyles) return null;

  const payload: { layoutOverrides?: Record<string, LayoutCoordinate>; styles?: StyleMap } = {};
  if (hasLayout) payload.layoutOverrides = sortRecord(layoutOverrides);
  if (hasStyles) payload.styles = sortRecord(styles);
  return formatMetaComment(payload);
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

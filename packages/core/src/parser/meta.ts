import type { LayoutCoordinate, StyleMap } from "../model/types.js";

/**
 * Decoder + encoder for `' @drawer:meta {...}` annotations. These comments
 * live alongside PlantUML source and are ignored by other PlantUML
 * renderers, but the editor uses them to round-trip layout coordinates
 * and per-element style overrides.
 */

export interface DrawerMetaPayload {
  layoutOverrides?: Record<string, LayoutCoordinate>;
  styles?: StyleMap;
}

const PREFIX = "' @drawer:meta ";

/** Returns true iff the line starts with the meta-comment prefix. */
export function isMetaComment(line: string): boolean {
  return line.trimStart().startsWith(PREFIX);
}

/**
 * Parse a meta-comment line. Returns `null` when the input is not a
 * meta-comment, or a `{ ok: false, message }` shape when the JSON is
 * malformed. On success, returns `{ ok: true, payload }`.
 */
export type DrawerMetaParseResult =
  | { ok: true; payload: DrawerMetaPayload }
  | { ok: false; message: string };

export function parseMetaComment(line: string): DrawerMetaParseResult | null {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith(PREFIX)) return null;
  const json = trimmed.slice(PREFIX.length).trim();
  if (json === "") {
    return { ok: false, message: "Empty meta-comment payload" };
  }
  try {
    const value: unknown = JSON.parse(json);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return { ok: false, message: "Meta-comment payload must be a JSON object" };
    }
    return { ok: true, payload: value as DrawerMetaPayload };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Meta-comment JSON: ${message}` };
  }
}

/**
 * Render a `DrawerMetaPayload` to a single comment line. The generator
 * (Phase 5) uses this to encode layout + style overrides back into the
 * source, so the parser decodes them losslessly on the next round.
 */
export function formatMetaComment(payload: DrawerMetaPayload): string {
  return `${PREFIX}${JSON.stringify(payload)}`;
}

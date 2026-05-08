import { parseDiagram } from "../model/validation.js";
import { SCHEMA_VERSION } from "../model/schema.js";
import type { Diagram } from "../model/types.js";

/**
 * `.umljson` is the native, lossless on-disk format. It is the AST
 * serialised verbatim — no text-level normalisation, no PlantUML round
 * trip — so importing and re-exporting is byte-equal.
 *
 * The schema version is stamped here too: when a future migration
 * arrives, this exporter is the natural place to bump it (and the
 * importer will be the place to upgrade legacy documents).
 */
export interface ExportJsonOptions {
  /** Indent for `JSON.stringify`. Defaults to 2 (human-readable). */
  readonly indent?: number;
}

export function exportJson(diagram: Diagram, options: ExportJsonOptions = {}): string {
  const indent = options.indent ?? 2;
  const stamped: Diagram = {
    ...diagram,
    metadata: { ...diagram.metadata, schemaVersion: SCHEMA_VERSION },
  };
  return JSON.stringify(stamped, null, indent);
}

export interface ImportJsonSuccess {
  readonly ok: true;
  readonly ast: Diagram;
}

export interface ImportJsonFailure {
  readonly ok: false;
  /** Same shape as zod's `ZodIssue`, propagated unchanged. */
  readonly issues: { readonly path: (string | number)[]; readonly message: string }[];
}

export type ImportJsonResult = ImportJsonSuccess | ImportJsonFailure;

/**
 * Parse a JSON string and validate it against `diagramSchema`. Failures
 * surface with a structured `issues` list (path + message) so callers
 * (the editor, the CLI) can reasonably display them.
 */
export function importJson(text: string): ImportJsonResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      issues: [{ path: [], message: error instanceof Error ? error.message : String(error) }],
    };
  }
  const result = parseDiagram(raw);
  if (!result.ok) {
    return {
      ok: false,
      issues: result.issues.map((issue) => ({
        path: [...issue.path],
        message: issue.message,
      })),
    };
  }
  return { ok: true, ast: result.diagram };
}

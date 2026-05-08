/**
 * Multi-level validator stack: syntax → semantic → constraints → lint.
 *
 * Syntax errors are produced upstream by the parser; the rest of the levels
 * run on a validated `Diagram` AST. Each level is a pure function returning
 * `DiagramError[]`, and `runAllValidators` is the standard entrypoint —
 * deduplicates issues by `(code, nodeId, edgeId, groupId)` so the same
 * dangling edge doesn't get reported twice when downstream layers trip
 * over the same root cause.
 */
import type { Diagram, DiagramError } from "../model/types.js";
import { validateConstraints } from "./constraints.js";
import { validateLint } from "./lint.js";
import { validateSemantics } from "./semantic.js";

export { validateSemantics } from "./semantic.js";
export { validateConstraints } from "./constraints.js";
export { validateLint } from "./lint.js";
export { adoptParserErrors } from "./syntax.js";
export {
  SEMANTIC_ERROR_CODES,
  CONSTRAINT_ERROR_CODES,
  LINT_ERROR_CODES,
  type SemanticErrorCode,
  type ConstraintErrorCode,
  type LintErrorCode,
  type ValidatorErrorCode,
} from "./codes.js";
export {
  attachQuickFixes,
  buildQuickFixCommand,
  getQuickFix,
  type QuickFixSuggestion,
} from "./quickfix.js";

export interface ValidationResult {
  /** All errors merged across levels in the order they were produced. */
  readonly errors: DiagramError[];
  /** Per-level breakdown for callers that want to render section headings. */
  readonly bySeverity: {
    readonly errors: DiagramError[];
    readonly warnings: DiagramError[];
    readonly infos: DiagramError[];
  };
}

/**
 * Run every validator level against `diagram` and return the combined
 * `ValidationResult`. Parser errors (syntax level) live upstream; pass them
 * via `parserErrors` so the result is a single unified collection — that's
 * what the props panel and CodeMirror lint extension consume.
 */
export function runAllValidators(
  diagram: Diagram,
  parserErrors: readonly DiagramError[] = [],
): ValidationResult {
  const errors: DiagramError[] = [];

  for (const error of parserErrors) errors.push({ ...error });
  for (const error of validateSemantics(diagram)) errors.push(error);
  for (const error of validateConstraints(diagram)) errors.push(error);
  for (const error of validateLint(diagram)) errors.push(error);

  const deduped = dedupeByLocation(errors);
  return {
    errors: deduped,
    bySeverity: {
      errors: deduped.filter((e) => e.severity === "error"),
      warnings: deduped.filter((e) => e.severity === "warning"),
      infos: deduped.filter((e) => e.severity === "info"),
    },
  };
}

function dedupeByLocation(errors: DiagramError[]): DiagramError[] {
  const seen = new Set<string>();
  const out: DiagramError[] = [];
  for (const error of errors) {
    const key = [
      error.code,
      error.nodeId ?? "",
      error.edgeId ?? "",
      error.groupId ?? "",
      error.range ? `${error.range.from}-${error.range.to}` : "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(error);
  }
  return out;
}

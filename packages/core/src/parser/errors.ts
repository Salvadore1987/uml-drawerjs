import type { DiagramError } from "../model/types.js";
import type { SourceLine } from "./tokenizer.js";

/** Stable error codes emitted by the parser. */
export const SYNTAX_ERROR_CODES = {
  /** A C4 macro / Class declaration / ER entity / etc. could not be parsed. */
  Malformed: "SYNTAX_MALFORMED",
  /** `Rel(...)` or arrow expression references an unknown alias. */
  UnknownReference: "SYNTAX_UNKNOWN_REFERENCE",
  /** `' @drawer:meta {...}` payload is not valid JSON or has the wrong shape. */
  Meta: "SYNTAX_META",
  /** Document is missing `@startuml` / `@enduml`. Non-fatal — emitted as warning. */
  MissingMarker: "SYNTAX_MISSING_MARKER",
  /** Unbalanced quote in a string literal. */
  UnbalancedQuote: "SYNTAX_UNBALANCED_QUOTE",
} as const;

export type SyntaxErrorCode = (typeof SYNTAX_ERROR_CODES)[keyof typeof SYNTAX_ERROR_CODES];

/** Construct a `DiagramError` whose `range` covers the given source line. */
export function errorAtLine(
  code: SyntaxErrorCode,
  message: string,
  line: SourceLine,
  severity: DiagramError["severity"] = "error",
): DiagramError {
  return {
    severity,
    code,
    message,
    range: { from: line.offset, to: line.offset + line.length },
  };
}

/**
 * Construct a `DiagramError` whose `range` covers a specific span inside
 * `line` (offsets are line-relative). Used when only part of a line is at
 * fault — e.g. the second argument of a malformed `Rel(...)` macro.
 */
export function errorAtSpan(
  code: SyntaxErrorCode,
  message: string,
  line: SourceLine,
  spanStart: number,
  spanEnd: number,
  severity: DiagramError["severity"] = "error",
): DiagramError {
  return {
    severity,
    code,
    message,
    range: {
      from: line.offset + spanStart,
      to: line.offset + spanEnd,
    },
  };
}

import type { DiagramError } from "../model/types.js";
import { SYNTAX_ERROR_CODES } from "../parser/errors.js";
import type { SyntaxErrorCode } from "../parser/errors.js";

/**
 * Pass-through wrapper for parser-emitted `DiagramError`s. Lives in the
 * validator stack so consumers can grab a single barrel — `runAllValidators`
 * — and obtain the entire `syntax → semantic → constraints → lint` chain in
 * one shot, even though the syntax level is produced upstream by the parser.
 */
export function adoptParserErrors(parserErrors: readonly DiagramError[]): DiagramError[] {
  return parserErrors.map((error) => ({ ...error }));
}

export { SYNTAX_ERROR_CODES };
export type { SyntaxErrorCode };

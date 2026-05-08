/**
 * @uml-drawer/core/parser — text → AST.
 *
 * Phase 4 ships a hand-rolled line-based parser. The Lezer-grammar variant
 * (per the original spec) is tracked in ADR-0003; the public API is the
 * same once Lezer lands, so callers do not need to change.
 */

export { parsePlantUml } from "./parse.js";
export type { ParseResult, ParseOptions } from "./parse.js";
export { SYNTAX_ERROR_CODES } from "./errors.js";
export type { SyntaxErrorCode } from "./errors.js";
export { formatMetaComment, isMetaComment, parseMetaComment } from "./meta.js";
export type { DrawerMetaPayload, DrawerMetaParseResult } from "./meta.js";
export { tokenizeLines } from "./tokenizer.js";
export type { SourceLine } from "./tokenizer.js";

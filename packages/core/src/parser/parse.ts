import type { Diagram, DiagramError } from "../model/types.js";
import { createParseContext, finalize } from "./context.js";
import type { ParseContext, ParseOptions } from "./context.js";
import { errorAtLine, SYNTAX_ERROR_CODES } from "./errors.js";
import { handleC4Line } from "./lines/c4.js";
import { handleClassLine } from "./lines/class.js";
import { handleErLine } from "./lines/er.js";
import { handleSequenceLine } from "./lines/sequence.js";
import { handleUniversalLine } from "./lines/shared.js";
import { tokenizeLines } from "./tokenizer.js";
import type { SourceLine } from "./tokenizer.js";

/**
 * Parse a PlantUML source string into a `Diagram` AST plus a list of
 * `DiagramError`s. The parser is forgiving — anything it doesn't recognise
 * is captured into `metadata.opaque` so the generator (Phase 5) can
 * round-trip the original text. Syntax errors never destroy the AST: the
 * caller always receives a structurally-valid `Diagram` populated with
 * whatever was successfully recognised.
 */
export interface ParseResult {
  ast: Diagram;
  errors: DiagramError[];
}

export function parsePlantUml(text: string, options: ParseOptions): ParseResult {
  const ctx = createParseContext(options);
  const lines = tokenizeLines(text);

  for (const line of lines) {
    dispatch(ctx, line);
  }

  if (!ctx.sawStart) {
    ctx.errors.push(makeMissingMarkerError("startuml", lines));
  }
  if (!ctx.sawEnd) {
    ctx.errors.push(makeMissingMarkerError("enduml", lines));
  }

  return { ast: finalize(ctx), errors: ctx.errors };
}

function dispatch(ctx: ParseContext, line: SourceLine): void {
  if (handleUniversalLine(ctx, line)) return;

  switch (ctx.options.diagramType) {
    case "c4-context":
    case "c4-container":
    case "c4-component":
      if (handleC4Line(ctx, line)) return;
      break;
    case "class":
      if (handleClassLine(ctx, line)) return;
      break;
    case "er":
      if (handleErLine(ctx, line)) return;
      break;
    case "sequence":
      if (handleSequenceLine(ctx, line)) return;
      break;
  }

  // Unrecognised — store verbatim so the generator can round-trip it
  // without modification.
  ctx.opaque.push(line.text);
}

function makeMissingMarkerError(marker: "startuml" | "enduml", lines: SourceLine[]): DiagramError {
  // Anchor the warning to either the first or the last line so consumers
  // (CodeMirror / props panel) have a position to surface.
  const anchor: SourceLine =
    marker === "startuml"
      ? (lines[0] ?? { line: 1, offset: 0, length: 0, text: "" })
      : (lines[lines.length - 1] ?? { line: 1, offset: 0, length: 0, text: "" });
  return errorAtLine(SYNTAX_ERROR_CODES.MissingMarker, `Missing @${marker}`, anchor, "warning");
}

export type { ParseOptions } from "./context.js";

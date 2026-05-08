import { errorAtLine, SYNTAX_ERROR_CODES } from "../errors.js";
import { isMetaComment, parseMetaComment } from "../meta.js";
import type { ParseContext } from "../context.js";
import type { SourceLine } from "../tokenizer.js";

const START_MARKER = /^@startuml(?:\s+(.+))?$/u;
const END_MARKER = /^@enduml\b/u;
const TITLE = /^title\s+(.+)$/u;

/**
 * Handle a "universal" line — present in every diagram type. Returns
 * `true` when the line was consumed; `false` to fall through to the
 * diagram-type-specific dispatcher.
 */
export function handleUniversalLine(ctx: ParseContext, line: SourceLine): boolean {
  const text = line.text.trim();
  if (text === "") return true; // empty line — ignore

  // Meta-comment must be checked BEFORE generic comment.
  if (isMetaComment(text)) {
    handleMetaComment(ctx, line);
    return true;
  }

  if (text.startsWith("'")) {
    return true; // ordinary single-line comment — ignore
  }

  const startMatch = START_MARKER.exec(text);
  if (startMatch) {
    ctx.sawStart = true;
    if (startMatch[1] && !ctx.title) {
      ctx.title = startMatch[1].trim();
    }
    return true;
  }

  if (END_MARKER.test(text)) {
    ctx.sawEnd = true;
    return true;
  }

  const titleMatch = TITLE.exec(text);
  if (titleMatch?.[1]) {
    ctx.title = titleMatch[1].trim();
    return true;
  }

  return false;
}

function handleMetaComment(ctx: ParseContext, line: SourceLine): void {
  const result = parseMetaComment(line.text);
  if (!result) return;
  if (!result.ok) {
    ctx.errors.push(errorAtLine(SYNTAX_ERROR_CODES.Meta, result.message, line));
    return;
  }
  if (result.payload.layoutOverrides) {
    ctx.layoutOverrides = {
      ...(ctx.layoutOverrides ?? {}),
      ...result.payload.layoutOverrides,
    };
  }
  if (result.payload.styles) {
    ctx.styles = { ...(ctx.styles ?? {}), ...result.payload.styles };
  }
}

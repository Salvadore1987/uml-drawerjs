/**
 * Line-based tokenizer for PlantUML source. Produces a sequence of
 * `SourceLine` records each carrying the line text, its position in the
 * original document, and a 1-based line number. Downstream pattern matchers
 * use `offset` / `length` to construct `DiagramError.range` values.
 */

export interface SourceLine {
  /** 1-based line number, useful for human-readable error messages. */
  readonly line: number;
  /** Byte offset of the first character of the line in the original text. */
  readonly offset: number;
  /** Length of the line, excluding the trailing newline. */
  readonly length: number;
  /** Raw line content, no trailing newline. */
  readonly text: string;
}

/**
 * Split text into `SourceLine[]`. Empty lines are preserved (their text is
 * the empty string) so callers can compute correct ranges across blanks.
 */
export function tokenizeLines(text: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let offset = 0;
  let lineNumber = 1;
  let cursor = 0;

  while (cursor <= text.length) {
    if (cursor === text.length || text[cursor] === "\n") {
      const slice = text.slice(offset, cursor);
      lines.push({
        line: lineNumber,
        offset,
        length: slice.length,
        text: slice,
      });
      lineNumber++;
      cursor++;
      offset = cursor;
    } else if (text[cursor] === "\r" && text[cursor + 1] === "\n") {
      // Treat CRLF as one separator.
      const slice = text.slice(offset, cursor);
      lines.push({
        line: lineNumber,
        offset,
        length: slice.length,
        text: slice,
      });
      lineNumber++;
      cursor += 2;
      offset = cursor;
    } else {
      cursor++;
    }
  }

  return lines;
}

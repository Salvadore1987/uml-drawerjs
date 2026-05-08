import { describe, expect, it } from "vitest";

import { tokenizeLines } from "./tokenizer.js";

describe("tokenizeLines", () => {
  it("splits LF-terminated text into lines with correct offsets", () => {
    // Arrange
    const text = "alpha\nbeta\n\ngamma";

    // Act
    const lines = tokenizeLines(text);

    // Assert
    expect(lines).toHaveLength(4);
    expect(lines[0]).toEqual({ line: 1, offset: 0, length: 5, text: "alpha" });
    expect(lines[1]).toEqual({ line: 2, offset: 6, length: 4, text: "beta" });
    expect(lines[2]).toEqual({ line: 3, offset: 11, length: 0, text: "" });
    expect(lines[3]).toEqual({ line: 4, offset: 12, length: 5, text: "gamma" });
  });

  it("handles CRLF line endings", () => {
    // Arrange
    const text = "alpha\r\nbeta\r\n";

    // Act
    const lines = tokenizeLines(text);

    // Assert — the trailing CRLF produces a trailing empty line, mirroring LF behaviour
    expect(lines.map((l) => l.text)).toEqual(["alpha", "beta", ""]);
    expect(lines[1]?.offset).toBe(7); // 'alpha\r\n' is 7 bytes
  });

  it("returns a single empty line for empty input", () => {
    expect(tokenizeLines("")).toEqual([{ line: 1, offset: 0, length: 0, text: "" }]);
  });
});

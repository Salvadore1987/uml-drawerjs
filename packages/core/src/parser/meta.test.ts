import { describe, expect, it } from "vitest";

import { formatMetaComment, isMetaComment, parseMetaComment } from "./meta.js";

describe("isMetaComment", () => {
  it("identifies meta-comment lines (with leading whitespace)", () => {
    expect(isMetaComment(`' @drawer:meta {}`)).toBe(true);
    expect(isMetaComment(`  ' @drawer:meta {"a":1}`)).toBe(true);
  });

  it("rejects ordinary comments", () => {
    expect(isMetaComment(`' just a comment`)).toBe(false);
    expect(isMetaComment(`'@drawer:meta {}`)).toBe(false); // missing space
  });
});

describe("parseMetaComment", () => {
  it("returns null for non-meta lines", () => {
    expect(parseMetaComment(`class Foo`)).toBeNull();
    expect(parseMetaComment(`' regular comment`)).toBeNull();
  });

  it("decodes a JSON object payload", () => {
    // Arrange
    const line = `' @drawer:meta {"layoutOverrides":{"a":{"x":1,"y":2}}}`;

    // Act
    const result = parseMetaComment(line);

    // Assert
    expect(result?.ok).toBe(true);
    if (result?.ok) {
      expect(result.payload.layoutOverrides).toEqual({ a: { x: 1, y: 2 } });
    }
  });

  it("rejects non-object JSON payloads (arrays, scalars, null)", () => {
    expect(parseMetaComment(`' @drawer:meta [1,2,3]`)?.ok).toBe(false);
    expect(parseMetaComment(`' @drawer:meta "hello"`)?.ok).toBe(false);
    expect(parseMetaComment(`' @drawer:meta null`)?.ok).toBe(false);
  });

  it("rejects malformed JSON", () => {
    const result = parseMetaComment(`' @drawer:meta {oops}`);
    expect(result?.ok).toBe(false);
  });

  it("rejects empty payloads", () => {
    expect(parseMetaComment(`' @drawer:meta `)?.ok).toBe(false);
  });
});

describe("formatMetaComment", () => {
  it("round-trips through parseMetaComment", () => {
    // Arrange
    const payload = {
      layoutOverrides: { a: { x: 10, y: 20 } },
      styles: { a: { fill: "#fff" } },
    };

    // Act
    const text = formatMetaComment(payload);
    const parsed = parseMetaComment(text);

    // Assert
    expect(parsed?.ok).toBe(true);
    if (parsed?.ok) {
      expect(parsed.payload).toEqual(payload);
    }
  });
});

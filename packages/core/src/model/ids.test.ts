import { describe, expect, it } from "vitest";

import { isUuidv7, uuidv7 } from "./ids.js";

describe("uuidv7", () => {
  it("returns a syntactically-valid v7 UUID", () => {
    // Arrange & Act
    const id = uuidv7();

    // Assert
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(isUuidv7(id)).toBe(true);
  });

  it("encodes the current epoch into the leading 48 bits", () => {
    // Arrange
    const before = Date.now();

    // Act
    const id = uuidv7();

    // Assert — first 48 bits == ms timestamp; reconstruct and bracket-check.
    const after = Date.now();
    const hex = id.replaceAll("-", "").slice(0, 12);
    const ts = parseInt(hex, 16);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("produces unique ids across rapid successive calls", () => {
    // Arrange & Act
    const ids = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      ids.add(uuidv7());
    }

    // Assert
    expect(ids.size).toBe(10_000);
  });

  it("orders ids monotonically when generated across millisecond boundaries", async () => {
    // Arrange
    const a = uuidv7();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const b = uuidv7();

    // Assert — lexicographic ordering aligns with timestamp ordering for v7.
    expect(a < b).toBe(true);
  });
});

describe("isUuidv7", () => {
  it("rejects malformed strings", () => {
    expect(isUuidv7("not-a-uuid")).toBe(false);
    expect(isUuidv7("")).toBe(false);
    expect(isUuidv7("00000000-0000-0000-0000-000000000000")).toBe(false); // version != 7
    expect(isUuidv7("01931d2c-1234-4abc-8def-0123456789ab")).toBe(false); // version 4
  });
});

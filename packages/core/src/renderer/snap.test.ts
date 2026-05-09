import { describe, expect, it } from "vitest";

import { DEFAULT_SNAP, snapPoint, snapRect, snapValue } from "./snap.js";

describe("renderer/snap — snapValue", () => {
  it("rounds to the nearest multiple of step when enabled", () => {
    // Act + Assert
    expect(snapValue(0, { enabled: true, step: 24 })).toBe(0);
    expect(snapValue(11, { enabled: true, step: 24 })).toBe(0);
    expect(snapValue(12, { enabled: true, step: 24 })).toBe(24);
    expect(snapValue(23, { enabled: true, step: 24 })).toBe(24);
    expect(snapValue(24, { enabled: true, step: 24 })).toBe(24);
    expect(snapValue(-13, { enabled: true, step: 24 })).toBe(-24);
  });

  it("returns the value untouched when snap is disabled", () => {
    expect(snapValue(11, { enabled: false, step: 24 })).toBe(11);
    expect(snapValue(123.45, { enabled: false, step: 8 })).toBe(123.45);
  });

  it("returns the value untouched when step is non-positive", () => {
    expect(snapValue(11, { enabled: true, step: 0 })).toBe(11);
    expect(snapValue(11, { enabled: true, step: -10 })).toBe(11);
  });

  it("uses DEFAULT_SNAP when no options are passed", () => {
    expect(snapValue(11)).toBe(0);
    expect(snapValue(13)).toBe(24);
  });
});

describe("renderer/snap — snapPoint / snapRect", () => {
  it("snapPoint rounds both coordinates independently", () => {
    expect(snapPoint({ x: 11, y: 13 })).toEqual({ x: 0, y: 24 });
  });

  it("snapRect rounds origin and size independently", () => {
    expect(snapRect({ x: 11, y: 13, width: 100, height: 200 })).toEqual({
      x: 0,
      y: 24,
      width: 96,
      height: 192,
    });
  });
});

describe("renderer/snap — DEFAULT_SNAP", () => {
  it("is enabled with step 24", () => {
    expect(DEFAULT_SNAP).toEqual({ enabled: true, step: 24 });
  });
});

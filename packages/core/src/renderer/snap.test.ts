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
    // step = 12 → 11 rounds down to 12*round(11/12)=12*1=12 (≥0.5 → up)
    // Actually 11/12 = 0.916… rounds to 1 → 12. So 11 → 12.
    // 5 rounds to 0 (5/12 = 0.416 → 0).
    expect(snapValue(5)).toBe(0);
    expect(snapValue(7)).toBe(12);
  });
});

describe("renderer/snap — snapPoint / snapRect", () => {
  it("snapPoint rounds both coordinates independently", () => {
    expect(snapPoint({ x: 5, y: 7 })).toEqual({ x: 0, y: 12 });
  });

  it("snapRect rounds origin and size independently", () => {
    expect(snapRect({ x: 5, y: 7, width: 100, height: 200 })).toEqual({
      x: 0,
      y: 12,
      width: 96,
      height: 204,
    });
  });
});

describe("renderer/snap — DEFAULT_SNAP", () => {
  it("is enabled with step 12 (drawio-style fine grid)", () => {
    expect(DEFAULT_SNAP).toEqual({ enabled: true, step: 12 });
  });
});

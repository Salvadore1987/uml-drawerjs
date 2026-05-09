import { describe, expect, it } from "vitest";

import { computeResizeRect } from "./resizeGeometry.js";
import type { Rect, ResizeSide } from "./resizeGeometry.js";

const ORIGIN: Rect = { x: 100, y: 50, width: 200, height: 100 };

describe("renderer/resizeGeometry — east / west axis", () => {
  it("east handle grows width without moving x", () => {
    expect(computeResizeRect(ORIGIN, "e", 40, 0)).toEqual({
      x: 100,
      y: 50,
      width: 240,
      height: 100,
    });
  });

  it("west handle shifts x and shrinks width by the same delta", () => {
    expect(computeResizeRect(ORIGIN, "w", 40, 0)).toEqual({
      x: 140,
      y: 50,
      width: 160,
      height: 100,
    });
  });

  it("east handle clamps to minWidth when dragged past origin", () => {
    const tiny = computeResizeRect(ORIGIN, "e", -300, 0);
    expect(tiny.width).toBeGreaterThanOrEqual(80);
  });
});

describe("renderer/resizeGeometry — north / south axis", () => {
  it("south handle grows height without moving y", () => {
    expect(computeResizeRect(ORIGIN, "s", 0, 30)).toEqual({
      x: 100,
      y: 50,
      width: 200,
      height: 130,
    });
  });

  it("north handle shifts y and shrinks height", () => {
    expect(computeResizeRect(ORIGIN, "n", 0, 30)).toEqual({
      x: 100,
      y: 80,
      width: 200,
      height: 70,
    });
  });
});

describe("renderer/resizeGeometry — corner handles", () => {
  it("se grows both width and height", () => {
    expect(computeResizeRect(ORIGIN, "se", 40, 30)).toEqual({
      x: 100,
      y: 50,
      width: 240,
      height: 130,
    });
  });

  it("nw moves x and y while shrinking", () => {
    expect(computeResizeRect(ORIGIN, "nw", 20, 10)).toEqual({
      x: 120,
      y: 60,
      width: 180,
      height: 90,
    });
  });

  it("ne moves only y, grows width and shrinks height", () => {
    expect(computeResizeRect(ORIGIN, "ne", 40, 10)).toEqual({
      x: 100,
      y: 60,
      width: 240,
      height: 90,
    });
  });

  it("sw moves only x, shrinks width, grows height", () => {
    expect(computeResizeRect(ORIGIN, "sw", 20, 30)).toEqual({
      x: 120,
      y: 50,
      width: 180,
      height: 130,
    });
  });
});

describe("renderer/resizeGeometry — clamping prevents inversion", () => {
  it("nw past opposite edge anchors at min size on the east edge", () => {
    // Drag NW handle 500px right + 500px down; without clamping the rect
    // would invert. With clamping, the result anchors to the south-east
    // corner of the original rect (origin.x + width − minWidth, …).
    const result = computeResizeRect(ORIGIN, "nw", 500, 500);
    expect(result.width).toBe(80);
    expect(result.height).toBe(40);
    expect(result.x).toBe(220); // 100 + 200 − 80
    expect(result.y).toBe(110); // 50 + 100 − 40
  });

  it("custom min options override the defaults", () => {
    const result = computeResizeRect(ORIGIN, "se", -1000, -1000, {
      minWidth: 50,
      minHeight: 25,
    });
    expect(result.width).toBe(50);
    expect(result.height).toBe(25);
  });
});

describe("renderer/resizeGeometry — every side returns a finite rect", () => {
  const sides: ResizeSide[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  for (const side of sides) {
    it(`side ${side} produces a finite rect for sample delta`, () => {
      const r = computeResizeRect(ORIGIN, side, 12, 8);
      expect(Number.isFinite(r.x)).toBe(true);
      expect(Number.isFinite(r.y)).toBe(true);
      expect(r.width).toBeGreaterThan(0);
      expect(r.height).toBeGreaterThan(0);
    });
  }
});

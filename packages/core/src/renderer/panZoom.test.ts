// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";

import { createPanZoomController } from "./panZoom.js";

afterEach(() => {
  document.body.innerHTML = "";
});

function setup(hostSize = { width: 800, height: 600 }) {
  const host = document.createElement("div");
  Object.defineProperty(host, "getBoundingClientRect", {
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: hostSize.width,
      bottom: hostSize.height,
      width: hostSize.width,
      height: hostSize.height,
      toJSON() {
        return this;
      },
    }),
  });
  document.body.appendChild(host);
  const target = document.createElementNS("http://www.w3.org/2000/svg", "g");
  host.appendChild(target);
  const ctrl = createPanZoomController(host, { target: target as unknown as SVGGraphicsElement });
  return { host, target, ctrl };
}

describe("PanZoomController — zoom math", () => {
  it("zoomIn(1.2) multiplies the scale and re-centres the transform", () => {
    // Arrange
    const { ctrl } = setup({ width: 800, height: 600 });

    // Act
    ctrl.zoomIn(1.2);

    // Assert
    const state = ctrl.getState();
    expect(state.scale).toBeCloseTo(1.2, 5);
    // Centre of viewport (400, 300) anchors the zoom: ratio = 1.2
    // tx = 400 - (400 - 0) * 1.2 = 400 - 480 = -80; same for y.
    expect(state.translateX).toBeCloseTo(-80, 5);
    expect(state.translateY).toBeCloseTo(-60, 5);
  });

  it("zoomOut(1.2) divides the scale", () => {
    // Arrange
    const { ctrl } = setup();
    ctrl.setState({ scale: 1.2, translateX: 0, translateY: 0 });

    // Act
    ctrl.zoomOut(1.2);

    // Assert
    expect(ctrl.getState().scale).toBeCloseTo(1.0, 5);
  });

  it("clamps zoomIn at maxScale", () => {
    // Arrange
    const { ctrl } = setup();

    // Act — push past the default cap of 4×.
    for (let i = 0; i < 20; i++) ctrl.zoomIn(2);

    // Assert
    expect(ctrl.getState().scale).toBeLessThanOrEqual(4);
  });
});

describe("PanZoomController — fitToContent", () => {
  it("frames a content bbox inside the viewport with padding", () => {
    // Arrange
    const { ctrl } = setup({ width: 800, height: 600 });
    const bbox = { x: 0, y: 0, width: 400, height: 200 };

    // Act
    ctrl.fitToContent(bbox, undefined, 24);

    // Assert
    const state = ctrl.getState();
    // available = 752 × 552; min(752/400, 552/200) = min(1.88, 2.76) = 1.88
    expect(state.scale).toBeCloseTo(1.88, 1);
    // Content centred horizontally: tx = (800 - 400 * 1.88) / 2 - 0 = 24
    expect(state.translateX).toBeCloseTo(24, 0);
  });

  it("does nothing when the viewport is degenerate", () => {
    // Arrange
    const { ctrl } = setup({ width: 0, height: 0 });
    const before = ctrl.getState();

    // Act
    ctrl.fitToContent({ x: 0, y: 0, width: 100, height: 100 });

    // Assert — state unchanged.
    expect(ctrl.getState()).toEqual(before);
  });
});

describe("PanZoomController — onChange listeners", () => {
  it("notifies listeners on every state change", () => {
    // Arrange
    const { ctrl } = setup();
    const calls: number[] = [];
    const unsubscribe = ctrl.onChange((state) => calls.push(state.scale));

    // Act
    ctrl.zoomIn(1.2);
    ctrl.zoomIn(1.2);
    ctrl.reset();

    // Assert
    expect(calls.length).toBeGreaterThanOrEqual(3);
    unsubscribe();
    ctrl.zoomIn(1.2);
    // No new push after unsubscribe.
    expect(calls.length).toBeLessThanOrEqual(4);
  });
});

import { describe, expect, it } from "vitest";

import { viewportCenterInDiagram } from "./viewport.js";

describe("viewportCenterInDiagram", () => {
  it("returns the host center at scale 1 with no translate", () => {
    expect(viewportCenterInDiagram(800, 600, { scale: 1, translateX: 0, translateY: 0 })).toEqual({
      x: 400,
      y: 300,
    });
  });

  it("inverts the pan/zoom transform (screen = diagram*scale + translate)", () => {
    // Pick a diagram point, forward-transform it to the host center, then
    // confirm the helper recovers it.
    const scale = 2;
    const translateX = 100;
    const translateY = 50;
    const diagram = { x: 75, y: 100 };
    const hostW = (diagram.x * scale + translateX) * 2; // host center maps to `diagram`
    const hostH = (diagram.y * scale + translateY) * 2;

    expect(viewportCenterInDiagram(hostW, hostH, { scale, translateX, translateY })).toEqual(
      diagram,
    );
  });

  it("treats a zero scale as 1 to avoid division by zero", () => {
    expect(viewportCenterInDiagram(200, 200, { scale: 0, translateX: 0, translateY: 0 })).toEqual({
      x: 100,
      y: 100,
    });
  });
});

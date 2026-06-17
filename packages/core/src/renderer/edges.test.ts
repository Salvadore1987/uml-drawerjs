import { describe, expect, it } from "vitest";
import { renderEdge } from "./edges.js";
import type { DiagramEdge } from "../model/types.js";
import type { NodeGeometry, VNode } from "./types.js";

const SRC: NodeGeometry = { id: "a", x: 0, y: 0, width: 100, height: 60 };
const TGT: NodeGeometry = { id: "b", x: 300, y: 0, width: 100, height: 60 };

/** The visible path line carries the markers (the other line is the hit area). */
function markerLine(g: VNode): { start?: unknown; end?: unknown } {
  const line = (g.children ?? []).find(
    (c) => c.tag === "line" && c.attrs?.["stroke"] === "var(--uml-edge-stroke)",
  );
  return { start: line?.attrs?.["marker-start"], end: line?.attrs?.["marker-end"] };
}

function edge(partial: Partial<DiagramEdge>): DiagramEdge {
  return { id: "e", source: "a", target: "b", kind: "association", ...partial } as DiagramEdge;
}

describe("renderEdge — directional markers", () => {
  it("puts the composition diamond at the owner (source), not the target", () => {
    // Arrange / Act
    const g = renderEdge({ edge: edge({ kind: "composition" }), source: SRC, target: TGT });

    // Assert
    const m = markerLine(g);
    expect(m.start).toBe("url(#uml-arrow-diamond-filled)");
    expect(m.end).toBeUndefined();
  });

  it("puts the aggregation open diamond at the owner (source)", () => {
    // Arrange / Act
    const g = renderEdge({ edge: edge({ kind: "aggregation" }), source: SRC, target: TGT });

    // Assert
    const m = markerLine(g);
    expect(m.start).toBe("url(#uml-arrow-diamond-open)");
    expect(m.end).toBeUndefined();
  });

  it("draws crow's-foot per cardinality end for one-to-many", () => {
    // Arrange — source "1", target "0..*".
    const g = renderEdge({
      edge: edge({ kind: "one-to-many", cardinality: { source: "1", target: "0..*" } }),
      source: SRC,
      target: TGT,
    });

    // Assert — bar at the "1" end, crow's foot (zero-many) at the "many" end.
    const m = markerLine(g);
    expect(m.start).toBe("url(#uml-er-one)");
    expect(m.end).toBe("url(#uml-er-zero-many)");
  });

  it("keeps the arrowhead at the target for plain associations", () => {
    // Arrange / Act
    const g = renderEdge({ edge: edge({ kind: "association" }), source: SRC, target: TGT });

    // Assert
    const m = markerLine(g);
    expect(m.start).toBeUndefined();
    expect(m.end).toBe("url(#uml-arrow-arrow)");
  });
});

import { describe, expect, it } from "vitest";

import { compartmentContentWidth, compartmentHeaderHeight, computeNodeGeometry } from "./nodes.js";
import type { DiagramNode, NodeKind } from "../model/types.js";

function node(kind: NodeKind, label: string, overrides: Partial<DiagramNode> = {}): DiagramNode {
  return { id: "n1", kind, label, ...overrides };
}

function geomFor(n: DiagramNode) {
  return computeNodeGeometry({ node: n, x: 0, y: 0, width: 200, height: 80 });
}

describe("renderer/nodes — compartment header height", () => {
  it("grows the header by one row for stereotyped kinds; plain class and entity stay at 36", () => {
    // Arrange / Act / Assert — interface / abstract-class / enum always show a
    // synthetic stereotype, so their header must be tall enough to hold the
    // stereotype line AND the name above the first compartment divider.
    expect(compartmentHeaderHeight(node("interface", "Renderable"))).toBe(52);
    expect(compartmentHeaderHeight(node("abstract-class", "Shape"))).toBe(52);
    expect(compartmentHeaderHeight(node("enum", "LineStyle"))).toBe(52);
    expect(compartmentHeaderHeight(node("class", "Order"))).toBe(36);
    expect(compartmentHeaderHeight(node("entity", "Customer"))).toBe(36);
  });

  it("a class with an explicit stereotype also gets the taller header", () => {
    expect(compartmentHeaderHeight(node("class", "Order", { stereotype: "entity" }))).toBe(52);
  });

  it("keeps the stereotyped name above the first divider (baseline 38 < header 52)", () => {
    // The label baseline for a stereotyped kind is topOffset(14) + stereotype
    // row(16) + 8 = 38; the header (and its divider) must sit below that.
    expect(compartmentHeaderHeight(node("interface", "Renderable"))).toBeGreaterThan(38);
  });
});

describe("renderer/nodes — compartment content width", () => {
  it("grows the box to fit a long class name, but leaves short names at the default", () => {
    expect(geomFor(node("class", "OrderProcessingServiceFactory")).width).toBeGreaterThan(200);
    expect(geomFor(node("class", "Order")).width).toBe(200);
  });

  it("accounts for member rows and generics, not just the name", () => {
    const wide = node("class", "Repo", {
      generics: ["TAggregateRoot", "TIdentifier"],
      operations: [{ id: "o1", name: "findAllByCriteriaAndSortOrder", visibility: "public" }],
    });
    expect(compartmentContentWidth(wide)).toBeGreaterThan(200);
  });

  it("returns 0 for non-compartment kinds so callers can Math.max safely", () => {
    expect(compartmentContentWidth(node("container", "AnExtremelyLongContainerName"))).toBe(0);
    expect(compartmentContentWidth(node("person", "Customer"))).toBe(0);
  });
});

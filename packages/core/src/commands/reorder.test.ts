import { describe, expect, it } from "vitest";

import { createEmptyDiagram } from "../model/factory.js";
import type { Diagram } from "../model/types.js";
import { generatePlantUml } from "../generator/index.js";
import { parsePlantUml } from "../parser/parse.js";
import { reorderGroupCommand, reorderNodeCommand } from "./reorder.js";

function classDiagram(overrides: Partial<Diagram>): Diagram {
  return { ...createEmptyDiagram("class"), ...overrides };
}

describe("reorderNodeCommand", () => {
  it("brings a loose node to the front (end of nodes) and inverts cleanly", () => {
    // Arrange
    const diagram = classDiagram({
      nodes: [
        { id: "a", kind: "class", label: "A" },
        { id: "b", kind: "class", label: "B" },
        { id: "c", kind: "class", label: "C" },
      ],
    });

    // Act
    const cmd = reorderNodeCommand("a", "front", diagram)!;
    const next = cmd.apply(diagram);

    // Assert
    expect(next.nodes.map((n) => n.id)).toEqual(["b", "c", "a"]);
    expect(cmd.invert(next).nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("sends a loose node to the back (start of nodes)", () => {
    const diagram = classDiagram({
      nodes: [
        { id: "a", kind: "class", label: "A" },
        { id: "b", kind: "class", label: "B" },
      ],
    });
    const next = reorderNodeCommand("b", "back", diagram)!.apply(diagram);
    expect(next.nodes.map((n) => n.id)).toEqual(["b", "a"]);
  });

  it("also reorders the parent package children for a packaged node", () => {
    const diagram = classDiagram({
      nodes: [
        { id: "a", kind: "class", label: "A" },
        { id: "b", kind: "class", label: "B" },
      ],
      groups: [{ id: "g", kind: "package", label: "pkg", children: ["a", "b"] }],
    });
    const next = reorderNodeCommand("a", "front", diagram)!.apply(diagram);
    expect(next.groups[0]!.children).toEqual(["b", "a"]);
    expect(next.nodes.map((n) => n.id)).toEqual(["b", "a"]);
  });

  it("returns null for an unknown node", () => {
    expect(reorderNodeCommand("zzz", "front", classDiagram({ nodes: [] }))).toBeNull();
  });
});

describe("reorderGroupCommand", () => {
  it("brings a top-level group to the front (end of groups)", () => {
    const diagram = classDiagram({
      groups: [
        { id: "g1", kind: "package", label: "P1", children: [] },
        { id: "g2", kind: "package", label: "P2", children: [] },
      ],
    });
    const next = reorderGroupCommand("g1", "front", diagram)!.apply(diagram);
    expect(next.groups.map((g) => g.id)).toEqual(["g2", "g1"]);
  });

  it("reorders the parent children for a nested group", () => {
    const diagram = classDiagram({
      groups: [
        { id: "root", kind: "package", label: "Root", children: ["a", "b"] },
        { id: "a", kind: "package", label: "A", children: [] },
        { id: "b", kind: "package", label: "B", children: [] },
      ],
    });
    const next = reorderGroupCommand("a", "front", diagram)!.apply(diagram);
    expect(next.groups.find((g) => g.id === "root")!.children).toEqual(["b", "a"]);
  });
});

describe("reorder round-trip through PlantUML", () => {
  it("preserves the new loose-node order after generate → parse", () => {
    // Arrange — two top-level classes; bring the first to front.
    const text = `@startuml\nclass Alpha\nclass Beta\n@enduml\n`;
    const parsed = parsePlantUml(text, { diagramType: "class", diagramId: "d" });
    const reordered = reorderNodeCommand(parsed.ast.nodes[0]!.id, "front", parsed.ast)!.apply(
      parsed.ast,
    );

    // Act — regenerate and re-parse.
    const generated = generatePlantUml(reordered);
    const reparsed = parsePlantUml(generated, { diagramType: "class", diagramId: "d" });

    // Assert — Alpha now declared last, so it stays last after the round-trip.
    expect(reordered.nodes.map((n) => n.label)).toEqual(["Beta", "Alpha"]);
    expect(reparsed.ast.nodes.map((n) => n.label)).toEqual(["Beta", "Alpha"]);
  });
});

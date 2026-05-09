import { describe, expect, it } from "vitest";

import type { Command } from "../commands/base.js";
import { addEdgeCommand } from "../commands/addEdge.js";
import { CommandBus } from "../commands/bus.js";
import { createEmptyDiagram } from "../model/factory.js";
import type { Diagram } from "../model/types.js";
import {
  CONSTRAINT_ERROR_CODES,
  LINT_ERROR_CODES,
  SEMANTIC_ERROR_CODES,
  attachQuickFixes,
  buildQuickFixCommand,
  runAllValidators,
  validateConstraints,
  validateLint,
  validateSemantics,
} from "./index.js";

function classDiagramWith(overrides: Partial<Diagram>): Diagram {
  return { ...createEmptyDiagram("class"), ...overrides };
}

function erDiagramWith(overrides: Partial<Diagram>): Diagram {
  return { ...createEmptyDiagram("er"), ...overrides };
}

function sequenceDiagramWith(overrides: Partial<Diagram>): Diagram {
  return { ...createEmptyDiagram("sequence"), ...overrides };
}

function c4DiagramWith(overrides: Partial<Diagram>): Diagram {
  return { ...createEmptyDiagram("c4-context"), ...overrides };
}

describe("validateSemantics — positive cases", () => {
  it("accepts a well-formed class diagram with no errors", () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [
        { id: "n1", kind: "class", label: "Foo" },
        { id: "n2", kind: "class", label: "Bar" },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2", kind: "association" }],
    });

    // Act
    const errors = validateSemantics(diagram);

    // Assert
    expect(errors).toEqual([]);
  });
});

describe("validateSemantics — negative cases", () => {
  it("flags duplicate node ids", () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [
        { id: "n1", kind: "class", label: "Foo" },
        { id: "n1", kind: "class", label: "Bar" },
      ],
    });

    // Act
    const codes = validateSemantics(diagram).map((e) => e.code);

    // Assert
    expect(codes).toContain(SEMANTIC_ERROR_CODES.DuplicateNodeId);
  });

  it("flags duplicate edge ids", () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [
        { id: "a", kind: "class", label: "A" },
        { id: "b", kind: "class", label: "B" },
      ],
      edges: [
        { id: "e", source: "a", target: "b", kind: "association" },
        { id: "e", source: "b", target: "a", kind: "association" },
      ],
    });

    // Act
    const codes = validateSemantics(diagram).map((e) => e.code);

    // Assert
    expect(codes).toContain(SEMANTIC_ERROR_CODES.DuplicateEdgeId);
  });

  it("flags edges with dangling source / target", () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [{ id: "a", kind: "class", label: "A" }],
      edges: [{ id: "e", source: "a", target: "ghost", kind: "association" }],
    });

    // Act
    const errors = validateSemantics(diagram);

    // Assert
    expect(errors.find((e) => e.code === SEMANTIC_ERROR_CODES.EdgeDanglingTarget)).toMatchObject({
      edgeId: "e",
      severity: "error",
    });
  });

  it("flags empty node and group labels", () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [{ id: "n", kind: "class", label: "  " }],
      groups: [{ id: "g", kind: "package", label: "", children: [] }],
    });

    // Act
    const codes = validateSemantics(diagram)
      .map((e) => e.code)
      .sort();

    // Assert
    expect(codes).toEqual(
      [SEMANTIC_ERROR_CODES.GroupLabelEmpty, SEMANTIC_ERROR_CODES.NodeLabelEmpty].sort(),
    );
  });

  it("flags groups whose children reference unknown ids", () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [{ id: "n", kind: "class", label: "Foo" }],
      groups: [{ id: "g", kind: "package", label: "Pkg", children: ["n", "ghost"] }],
    });

    // Act
    const errors = validateSemantics(diagram);

    // Assert
    expect(errors.find((e) => e.code === SEMANTIC_ERROR_CODES.GroupChildMissing)).toMatchObject({
      groupId: "g",
    });
  });
});

describe("validateConstraints — diagram-type rules", () => {
  it("rejects a class node inside an ER diagram", () => {
    // Arrange
    const diagram = erDiagramWith({
      nodes: [{ id: "n", kind: "class", label: "Wrong" }],
    });

    // Act
    const codes = validateConstraints(diagram).map((e) => e.code);

    // Assert
    expect(codes).toContain(CONSTRAINT_ERROR_CODES.NodeKindNotAllowed);
  });

  it("rejects sequence edges that don't connect lifelines / actors", () => {
    // Arrange
    const diagram = sequenceDiagramWith({
      nodes: [
        { id: "a", kind: "actor", label: "User" },
        { id: "b", kind: "actor", label: "Admin" },
      ],
      edges: [{ id: "e", source: "a", target: "ghost", kind: "sync-call" }],
    });

    // Act
    const codes = validateConstraints(diagram).map((e) => e.code);

    // Assert
    expect(codes).toContain(CONSTRAINT_ERROR_CODES.SequenceEdgeNonLifeline);
  });

  it("rejects ER edges between non-entity nodes (constraints don't catch entities only — semantics does)", () => {
    // Arrange — endpoint pretends to be an entity but its kind is wrong
    const diagram = erDiagramWith({
      nodes: [
        { id: "a", kind: "entity", label: "Order" },
        { id: "b", kind: "class", label: "Item" },
      ],
      edges: [
        {
          id: "e",
          source: "a",
          target: "b",
          kind: "one-to-many",
          cardinality: { source: "1", target: "0..*" },
        },
      ],
    });

    // Act
    const codes = validateConstraints(diagram).map((e) => e.code);

    // Assert
    expect(codes).toContain(CONSTRAINT_ERROR_CODES.ErEdgeNonEntity);
  });

  it("requires cardinality on every ER edge", () => {
    // Arrange
    const diagram = erDiagramWith({
      nodes: [
        { id: "a", kind: "entity", label: "Order" },
        { id: "b", kind: "entity", label: "Item" },
      ],
      edges: [{ id: "e", source: "a", target: "b", kind: "one-to-many" }],
    });

    // Act
    const codes = validateConstraints(diagram).map((e) => e.code);

    // Assert
    expect(codes).toContain(CONSTRAINT_ERROR_CODES.ErCardinalityMissing);
  });

  it("rejects ER cardinality tokens that don't match the supported grammar", () => {
    // Arrange
    const diagram = erDiagramWith({
      nodes: [
        { id: "a", kind: "entity", label: "Order" },
        { id: "b", kind: "entity", label: "Item" },
      ],
      edges: [
        {
          id: "e",
          source: "a",
          target: "b",
          kind: "one-to-many",
          cardinality: { source: "many", target: "0..*" },
        },
      ],
    });

    // Act
    const codes = validateConstraints(diagram).map((e) => e.code);

    // Assert
    expect(codes).toContain(CONSTRAINT_ERROR_CODES.ErCardinalityInvalid);
  });

  it("flags non-C4 nodes inside a C4 boundary", () => {
    // Arrange
    const diagram = c4DiagramWith({
      nodes: [
        { id: "p", kind: "person", label: "User" },
        { id: "x", kind: "class", label: "WrongKind" },
      ],
      groups: [{ id: "b", kind: "boundary", label: "Boundary", children: ["p", "x"] }],
    });

    // Act
    const codes = validateConstraints(diagram).map((e) => e.code);

    // Assert
    expect(codes).toContain(CONSTRAINT_ERROR_CODES.C4BoundaryChildKind);
  });

  it("accepts a fully valid C4 context diagram with boundary nesting", () => {
    // Arrange
    const diagram = c4DiagramWith({
      nodes: [
        { id: "p", kind: "person", label: "User" },
        { id: "s", kind: "system", label: "Sys" },
      ],
      edges: [{ id: "e", source: "p", target: "s", kind: "uses", label: "uses" }],
      groups: [{ id: "b", kind: "boundary", label: "Org", children: ["s"] }],
    });

    // Act
    const errors = validateConstraints(diagram);

    // Assert
    expect(errors).toEqual([]);
  });

  it("warns when a c4-context diagram contains a Container (c4model tier rule)", () => {
    // Arrange — palette won't surface Container on c4-context, but a hand-typed
    // PlantUML can still slip one through; the rule guards that path.
    const diagram = c4DiagramWith({
      nodes: [
        { id: "p", kind: "person", label: "User" },
        { id: "c", kind: "container", label: "API" },
      ],
    });

    // Act
    const result = validateConstraints(diagram);
    const mismatch = result.find((e) => e.code === CONSTRAINT_ERROR_CODES.C4ContextKindMismatch);

    // Assert
    expect(mismatch).toBeDefined();
    expect(mismatch?.severity).toBe("warning");
    expect(mismatch?.nodeId).toBe("c");
  });

  it("warns when a c4-container diagram contains a Component (c4model tier rule)", () => {
    // Arrange
    const diagram: Diagram = {
      ...createEmptyDiagram("c4-container"),
      nodes: [
        { id: "c1", kind: "container", label: "API" },
        { id: "comp", kind: "component", label: "Controller" },
      ],
    };

    // Act
    const result = validateConstraints(diagram);
    const mismatch = result.find((e) => e.code === CONSTRAINT_ERROR_CODES.C4ContainerKindMismatch);

    // Assert
    expect(mismatch).toBeDefined();
    expect(mismatch?.severity).toBe("warning");
    expect(mismatch?.nodeId).toBe("comp");
  });

  it("does not warn when a c4-container diagram contains only container-tier kinds", () => {
    // Arrange — every kind allowed at the Container tier
    const diagram: Diagram = {
      ...createEmptyDiagram("c4-container"),
      nodes: [
        { id: "p", kind: "person", label: "Customer" },
        { id: "s", kind: "system-external", label: "Mail" },
        { id: "c1", kind: "container", label: "API" },
        { id: "c2", kind: "container-external", label: "Payments" },
        { id: "d", kind: "database", label: "Postgres" },
        { id: "q", kind: "queue", label: "Events" },
      ],
    };

    // Act
    const codes = validateConstraints(diagram).map((e) => e.code);

    // Assert
    expect(codes).not.toContain(CONSTRAINT_ERROR_CODES.C4ContainerKindMismatch);
  });

  it("does not warn when a c4-context diagram contains only context-tier kinds", () => {
    // Arrange — every kind allowed at the System Context tier
    const diagram = c4DiagramWith({
      nodes: [
        { id: "p1", kind: "person", label: "Customer" },
        { id: "p2", kind: "person-external", label: "Auditor" },
        { id: "s1", kind: "system", label: "Bank" },
        { id: "s2", kind: "system-external", label: "Mail" },
        { id: "d", kind: "database", label: "Audit Log" },
        { id: "q", kind: "queue", label: "Events" },
      ],
    });

    // Act
    const codes = validateConstraints(diagram).map((e) => e.code);

    // Assert
    expect(codes).not.toContain(CONSTRAINT_ERROR_CODES.C4ContextKindMismatch);
  });
});

describe("validateLint — soft warnings", () => {
  it("warns about orphan nodes in non-sequence diagrams", () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [
        { id: "a", kind: "class", label: "A" },
        { id: "b", kind: "class", label: "B" },
        { id: "lonely", kind: "class", label: "Lonely" },
      ],
      edges: [{ id: "e", source: "a", target: "b", kind: "association" }],
    });

    // Act
    const orphans = validateLint(diagram).filter((e) => e.code === LINT_ERROR_CODES.OrphanNode);

    // Assert
    expect(orphans).toHaveLength(1);
    expect(orphans[0]).toMatchObject({ nodeId: "lonely", severity: "warning" });
  });

  it("does not warn about orphan participants in sequence diagrams", () => {
    // Arrange
    const diagram = sequenceDiagramWith({
      nodes: [{ id: "u", kind: "actor", label: "User" }],
    });

    // Act
    const errors = validateLint(diagram);

    // Assert
    expect(errors.filter((e) => e.code === LINT_ERROR_CODES.OrphanNode)).toEqual([]);
  });

  it("warns about duplicate node labels", () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [
        { id: "a", kind: "class", label: "Foo" },
        { id: "b", kind: "class", label: "Foo" },
        { id: "c", kind: "class", label: "Bar" },
      ],
      edges: [
        { id: "e1", source: "a", target: "c", kind: "association" },
        { id: "e2", source: "b", target: "c", kind: "association" },
      ],
    });

    // Act
    const dupes = validateLint(diagram).filter((e) => e.code === LINT_ERROR_CODES.DuplicateLabel);

    // Assert
    expect(dupes.map((e) => e.nodeId).sort()).toEqual(["a", "b"]);
  });

  it("detects an inheritance cycle and reports each node on the cycle", () => {
    // Arrange — A → B → C → A
    const diagram = classDiagramWith({
      nodes: [
        { id: "A", kind: "class", label: "A" },
        { id: "B", kind: "class", label: "B" },
        { id: "C", kind: "class", label: "C" },
      ],
      edges: [
        { id: "e1", source: "A", target: "B", kind: "inheritance" },
        { id: "e2", source: "B", target: "C", kind: "inheritance" },
        { id: "e3", source: "C", target: "A", kind: "inheritance" },
      ],
    });

    // Act
    const cycles = validateLint(diagram).filter(
      (e) => e.code === LINT_ERROR_CODES.InheritanceCycle,
    );

    // Assert — every node on the cycle gets reported once
    expect(cycles.map((e) => e.nodeId).sort()).toEqual(["A", "B", "C"]);
    expect(cycles.every((e) => e.severity === "error")).toBe(true);
  });
});

describe("runAllValidators — composition + dedupe", () => {
  it("merges syntax / semantic / constraint / lint errors into one collection", () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [
        { id: "a", kind: "class", label: "" },
        { id: "b", kind: "class", label: "B" },
      ],
      edges: [{ id: "e", source: "a", target: "b", kind: "association" }],
    });
    const parserErrors = [
      {
        severity: "warning" as const,
        code: "SYNTAX_MISSING_MARKER",
        message: "Missing @startuml",
      },
    ];

    // Act
    const result = runAllValidators(diagram, parserErrors);

    // Assert
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain("SYNTAX_MISSING_MARKER");
    expect(codes).toContain(SEMANTIC_ERROR_CODES.NodeLabelEmpty);
    expect(result.bySeverity.warnings.some((e) => e.code === "SYNTAX_MISSING_MARKER")).toBe(true);
  });

  it("does not duplicate identical (code, location) entries", () => {
    // Arrange — boundary child kind error AND a generic node-kind error
    // both reference the same node, but with different codes — they
    // should both survive dedup because the codes differ.
    const diagram = c4DiagramWith({
      nodes: [
        { id: "p", kind: "person", label: "User" },
        { id: "x", kind: "class", label: "WrongKind" },
      ],
      groups: [{ id: "b", kind: "boundary", label: "Boundary", children: ["x"] }],
    });

    // Act
    const result = runAllValidators(diagram);

    // Assert — boundary-child-kind AND node-kind-not-allowed both surface
    const codes = new Set(result.errors.map((e) => e.code));
    expect(codes.has(CONSTRAINT_ERROR_CODES.NodeKindNotAllowed)).toBe(true);
    expect(codes.has(CONSTRAINT_ERROR_CODES.C4BoundaryChildKind)).toBe(true);
  });
});

describe("quick-fix registry", () => {
  it("builds an updateNode command that fills in an empty label", () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [{ id: "n", kind: "class", label: "" }],
    });
    const errors = validateSemantics(diagram);
    const labelError = errors.find((e) => e.code === SEMANTIC_ERROR_CODES.NodeLabelEmpty);
    expect(labelError).toBeDefined();

    // Act
    const command = buildQuickFixCommand(diagram, labelError!);

    // Assert
    expect(command?.kind).toBe("UpdateNode");
    const next = command!.apply(diagram);
    expect(next.nodes[0]?.label).toBe("Untitled");
  });

  it("builds a removeEdge command for a dangling edge", () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [{ id: "a", kind: "class", label: "A" }],
      edges: [{ id: "e", source: "a", target: "ghost", kind: "association" }],
    });
    const errors = validateSemantics(diagram);
    const danglingError = errors.find((e) => e.code === SEMANTIC_ERROR_CODES.EdgeDanglingTarget);
    expect(danglingError).toBeDefined();

    // Act
    const command = buildQuickFixCommand(diagram, danglingError!);

    // Assert
    expect(command?.kind).toBe("RemoveEdge");
    const next = command!.apply(diagram);
    expect(next.edges).toEqual([]);
  });

  it("attachQuickFixes wires fixes through a CommandBus dispatcher", () => {
    // Arrange
    const initial = classDiagramWith({
      nodes: [{ id: "n", kind: "class", label: "" }],
    });
    const bus = new CommandBus(initial);
    const errors = validateSemantics(bus.getState());

    // Act
    const enriched = attachQuickFixes(errors, bus.getState(), (cmd) => {
      bus.dispatch(cmd);
    });
    const labelError = enriched.find((e) => e.code === SEMANTIC_ERROR_CODES.NodeLabelEmpty);
    labelError?.fix?.apply();

    // Assert
    expect(bus.getState().nodes[0]?.label).toBe("Untitled");
  });

  it("returns null when the error context is stale", () => {
    // Arrange — diagram no longer contains the offending edge
    const diagram = classDiagramWith({
      nodes: [{ id: "a", kind: "class", label: "A" }],
    });
    const staleError = {
      severity: "error" as const,
      code: SEMANTIC_ERROR_CODES.EdgeDanglingTarget,
      message: "Edge 'e' has unknown target 'ghost'",
      edgeId: "e",
    };

    // Act
    const command: Command | null = buildQuickFixCommand(diagram, staleError);

    // Assert
    expect(command).toBeNull();
  });
});

describe("regression — validators don't mutate the input diagram", () => {
  it("leaves the diagram byte-equal after running every level", () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [{ id: "n", kind: "class", label: "" }],
    });
    const snapshot = JSON.stringify(diagram);

    // Act
    runAllValidators(diagram);

    // Assert
    expect(JSON.stringify(diagram)).toBe(snapshot);
  });
});

describe("CommandBus integration (sanity check via addEdgeCommand)", () => {
  it("addEdgeCommand exists and dispatches via bus — covered for typecheck only", () => {
    // Arrange
    const bus = new CommandBus(
      classDiagramWith({
        nodes: [
          { id: "a", kind: "class", label: "A" },
          { id: "b", kind: "class", label: "B" },
        ],
      }),
    );

    // Act
    const command = addEdgeCommand({
      id: "e1",
      source: "a",
      target: "b",
      kind: "association",
    });
    const next = bus.dispatch(command);

    // Assert
    expect(next.edges).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";

import { renderDiagram } from "./index.js";
import type { Diagram } from "../model/types.js";

function diagramWith(overrides: Partial<Diagram>): Diagram {
  return {
    id: "doc",
    type: "c4-context",
    nodes: [],
    edges: [],
    groups: [],
    metadata: { schemaVersion: "1.0.0", layoutOverrides: {} },
    ...overrides,
  };
}

function findNodeVNode(root: ReturnType<typeof renderDiagram>["root"], id: string) {
  // The renderer wraps content in `<svg> > <defs> + <g data-uml-content>`.
  // Walk children depth-first looking for a `<g data-node-id="…">`.
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.shift()!;
    const isMatch =
      node.tag === "g" &&
      node.attrs &&
      (node.attrs as Record<string, unknown>)["data-node-id"] === id;
    if (isMatch) return node;
    if (node.children) stack.push(...node.children);
  }
  throw new Error(`renderer test helper: node ${id} not found in tree`);
}

describe("renderer/nodes — C4 per-kind visual language", () => {
  it("person renders a stick-figure glyph (circle head + body lines) inside a frame", () => {
    // Arrange
    const diagram = diagramWith({
      type: "c4-context",
      nodes: [
        {
          id: "p1",
          kind: "person",
          label: "Customer",
          description: "End-user of the bank",
        },
      ],
      metadata: { schemaVersion: "1.0.0", layoutOverrides: { p1: { x: 0, y: 0 } } },
    });

    // Act
    const rendered = renderDiagram(diagram, { coordinates: { p1: { x: 0, y: 0 } } });
    const node = findNodeVNode(rendered.root, "p1");

    // Assert — frame group contains rect + circle (head) + path (body lines).
    const frameGroup = node.children?.find(
      (c) =>
        c.tag === "g" &&
        (c.attrs as Record<string, unknown> | undefined)?.["data-uml-frame"] === "person",
    );
    expect(frameGroup, "person frame group should be emitted").toBeTruthy();
    const tags = (frameGroup?.children ?? []).map((c) => c.tag);
    expect(tags).toContain("rect");
    expect(tags).toContain("circle");
    expect(tags).toContain("path");
  });

  it("system-external renders with a dashed border", () => {
    // Arrange
    const diagram = diagramWith({
      type: "c4-context",
      nodes: [{ id: "ext", kind: "system-external", label: "Payments" }],
      metadata: { schemaVersion: "1.0.0", layoutOverrides: { ext: { x: 0, y: 0 } } },
    });

    // Act
    const rendered = renderDiagram(diagram, { coordinates: { ext: { x: 0, y: 0 } } });
    const node = findNodeVNode(rendered.root, "ext");
    const rect = node.children?.find((c) => c.tag === "rect");

    // Assert
    expect(rect).toBeTruthy();
    expect((rect?.attrs as Record<string, unknown> | undefined)?.["stroke-dasharray"]).toBe("6 4");
  });

  it("database renders as a cylinder (path + ellipse cap)", () => {
    // Arrange
    const diagram = diagramWith({
      type: "c4-container",
      nodes: [{ id: "db", kind: "database", label: "Postgres" }],
      metadata: { schemaVersion: "1.0.0", layoutOverrides: { db: { x: 0, y: 0 } } },
    });

    // Act
    const rendered = renderDiagram(diagram, { coordinates: { db: { x: 0, y: 0 } } });
    const node = findNodeVNode(rendered.root, "db");
    const frame = node.children?.find(
      (c) =>
        c.tag === "g" &&
        (c.attrs as Record<string, unknown> | undefined)?.["data-uml-frame"] === "database",
    );

    // Assert
    expect(frame, "database frame group should be emitted").toBeTruthy();
    const childTags = (frame?.children ?? []).map((c) => c.tag).sort();
    expect(childTags).toEqual(["ellipse", "path"]);
  });

  it("container with technology renders a [Container: Tech] type-tag row", () => {
    // Arrange
    const diagram = diagramWith({
      type: "c4-container",
      nodes: [
        {
          id: "api",
          kind: "container",
          label: "API",
          technology: "Spring Boot",
        },
      ],
      metadata: { schemaVersion: "1.0.0", layoutOverrides: { api: { x: 0, y: 0 } } },
    });

    // Act
    const rendered = renderDiagram(diagram, { coordinates: { api: { x: 0, y: 0 } } });
    const node = findNodeVNode(rendered.root, "api");
    const tagRow = node.children?.find(
      (c) => c.tag === "text" && (c.classes ?? []).includes("uml-node-type-tag"),
    );

    // Assert
    expect(tagRow?.text).toBe("[Container: Spring Boot]");
  });

  it("system without technology still renders a [Software System] type-tag (c4model rule)", () => {
    // Arrange
    const diagram = diagramWith({
      type: "c4-context",
      nodes: [{ id: "s", kind: "system", label: "Bank" }],
      metadata: { schemaVersion: "1.0.0", layoutOverrides: { s: { x: 0, y: 0 } } },
    });

    // Act
    const rendered = renderDiagram(diagram, { coordinates: { s: { x: 0, y: 0 } } });
    const node = findNodeVNode(rendered.root, "s");
    const tagRow = node.children?.find(
      (c) => c.tag === "text" && (c.classes ?? []).includes("uml-node-type-tag"),
    );

    // Assert
    expect(tagRow?.text).toBe("[Software System]");
  });

  it("person-external reuses the external palette tokens (grey fill)", () => {
    // Arrange
    const diagram = diagramWith({
      type: "c4-context",
      nodes: [{ id: "p", kind: "person-external", label: "Auditor" }],
      metadata: { schemaVersion: "1.0.0", layoutOverrides: { p: { x: 0, y: 0 } } },
    });

    // Act
    const rendered = renderDiagram(diagram, { coordinates: { p: { x: 0, y: 0 } } });
    const node = findNodeVNode(rendered.root, "p");
    const frameGroup = node.children?.find(
      (c) =>
        c.tag === "g" &&
        (c.attrs as Record<string, unknown> | undefined)?.["data-uml-frame"] === "person-external",
    );
    const innerRect = frameGroup?.children?.find((c) => c.tag === "rect");
    const tagRow = node.children?.find(
      (c) => c.tag === "text" && (c.classes ?? []).includes("uml-node-type-tag"),
    );

    // Assert — frame stamps `external` palette, type-tag still says [Person]
    expect((innerRect?.attrs as Record<string, unknown> | undefined)?.fill).toContain(
      "--uml-c4-external-bg",
    );
    expect(tagRow?.text).toBe("[Person]");
  });

  it("container-external renders dashed border and a [Container] type-tag", () => {
    // Arrange
    const diagram = diagramWith({
      type: "c4-container",
      nodes: [
        {
          id: "ext",
          kind: "container-external",
          label: "Payments",
          technology: "REST",
        },
      ],
      metadata: { schemaVersion: "1.0.0", layoutOverrides: { ext: { x: 0, y: 0 } } },
    });

    // Act
    const rendered = renderDiagram(diagram, { coordinates: { ext: { x: 0, y: 0 } } });
    const node = findNodeVNode(rendered.root, "ext");
    const rect = node.children?.find((c) => c.tag === "rect");
    const tagRow = node.children?.find(
      (c) => c.tag === "text" && (c.classes ?? []).includes("uml-node-type-tag"),
    );

    // Assert
    expect((rect?.attrs as Record<string, unknown> | undefined)?.["stroke-dasharray"]).toBe("6 4");
    expect((rect?.attrs as Record<string, unknown> | undefined)?.fill).toContain(
      "--uml-c4-external-bg",
    );
    expect(tagRow?.text).toBe("[Container: REST]");
  });

  it("queue renders rounded rect with two end-cap lines and a [Queue] type-tag", () => {
    // Arrange
    const diagram = diagramWith({
      type: "c4-context",
      nodes: [{ id: "q", kind: "queue", label: "Events" }],
      metadata: { schemaVersion: "1.0.0", layoutOverrides: { q: { x: 0, y: 0 } } },
    });

    // Act
    const rendered = renderDiagram(diagram, { coordinates: { q: { x: 0, y: 0 } } });
    const node = findNodeVNode(rendered.root, "q");
    const frameGroup = node.children?.find(
      (c) =>
        c.tag === "g" &&
        (c.attrs as Record<string, unknown> | undefined)?.["data-uml-frame"] === "queue",
    );
    const tags = (frameGroup?.children ?? []).map((c) => c.tag);
    const tagRow = node.children?.find(
      (c) => c.tag === "text" && (c.classes ?? []).includes("uml-node-type-tag"),
    );

    // Assert — frame: outer rect + two end-cap paths
    expect(frameGroup, "queue frame group should be emitted").toBeTruthy();
    expect(tags).toEqual(["rect", "path", "path"]);
    expect(tagRow?.text).toBe("[Queue]");
  });

  it("description is rendered as italic muted text", () => {
    // Arrange
    const diagram = diagramWith({
      type: "c4-component",
      nodes: [
        {
          id: "c",
          kind: "component",
          label: "AuthService",
          description: "Issues JWTs.",
        },
      ],
      metadata: { schemaVersion: "1.0.0", layoutOverrides: { c: { x: 0, y: 0 } } },
    });

    // Act
    const rendered = renderDiagram(diagram, { coordinates: { c: { x: 0, y: 0 } } });
    const node = findNodeVNode(rendered.root, "c");
    const descRow = node.children?.find(
      (c) => c.tag === "text" && (c.classes ?? []).includes("uml-node-description"),
    );

    // Assert
    expect(descRow?.text).toBe("Issues JWTs.");
    expect((descRow?.attrs as Record<string, unknown> | undefined)?.["font-style"]).toBe("italic");
  });

  it("long description wraps onto multiple rows and grows the node height", () => {
    // Arrange — one node with a long description, one identical node without,
    // so we can compare the resulting heights.
    const longText =
      "A customer of the bank with personal and business accounts who manages everything online";
    const withDesc = diagramWith({
      type: "c4-component",
      nodes: [{ id: "c", kind: "component", label: "AuthService", description: longText }],
      metadata: { schemaVersion: "1.0.0", layoutOverrides: { c: { x: 0, y: 0 } } },
    });
    const withoutDesc = diagramWith({
      type: "c4-component",
      nodes: [{ id: "c", kind: "component", label: "AuthService" }],
      metadata: { schemaVersion: "1.0.0", layoutOverrides: { c: { x: 0, y: 0 } } },
    });

    // Act
    const rendered = renderDiagram(withDesc, { coordinates: { c: { x: 0, y: 0 } } });
    const renderedBare = renderDiagram(withoutDesc, { coordinates: { c: { x: 0, y: 0 } } });
    const node = findNodeVNode(rendered.root, "c");
    const descRows = (node.children ?? []).filter(
      (c) => c.tag === "text" && (c.classes ?? []).includes("uml-node-description"),
    );

    // Assert — the description spans more than one row, none of the rows is
    // empty, and the node grew taller than the description-less twin.
    expect(descRows.length).toBeGreaterThan(1);
    for (const row of descRows) {
      expect((row.text ?? "").length).toBeGreaterThan(0);
    }
    const tall = rendered.nodeGeometry.get("c")!;
    const short = renderedBare.nodeGeometry.get("c")!;
    expect(tall.height).toBeGreaterThan(short.height);
  });

  it("C4 fills resolve through `--uml-c4-*` tokens with neutral fallbacks", () => {
    // Arrange
    const diagram = diagramWith({
      type: "c4-context",
      nodes: [
        { id: "p", kind: "person", label: "User" },
        { id: "s", kind: "system", label: "Bank" },
      ],
      metadata: {
        schemaVersion: "1.0.0",
        layoutOverrides: { p: { x: 0, y: 0 }, s: { x: 240, y: 0 } },
      },
    });

    // Act
    const rendered = renderDiagram(diagram, {
      coordinates: { p: { x: 0, y: 0 }, s: { x: 240, y: 0 } },
    });

    // Assert — system rect uses var(--uml-c4-system-bg, …); person frame
    // (group) contains a rect with var(--uml-c4-person-bg, …). Both must
    // include the fallback so themes lacking C4 tokens still render.
    const sNode = findNodeVNode(rendered.root, "s");
    const sRect = sNode.children?.find((c) => c.tag === "rect");
    expect((sRect?.attrs as Record<string, unknown> | undefined)?.fill).toContain(
      "--uml-c4-system-bg",
    );
    expect((sRect?.attrs as Record<string, unknown> | undefined)?.fill).toContain(
      "var(--uml-node-bg)",
    );
  });
});

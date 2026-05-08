import { describe, expect, it } from "vitest";

import { createEmptyDiagram } from "../model/factory.js";
import type { Diagram } from "../model/types.js";
import { parsePlantUml } from "../parser/index.js";
import {
  buildThemeStyleBlock,
  exportJson,
  exportPng,
  exportPuml,
  exportSvg,
  importJson,
  importPuml,
  serializeVNode,
} from "./index.js";
import type { PngCanvas, PngCanvasContext, PngImage } from "./png.js";

function counter(): () => string {
  let i = 0;
  return () => `id-${++i}`;
}

function classDiagramWith(overrides: Partial<Diagram>): Diagram {
  return { ...createEmptyDiagram("class"), ...overrides };
}

describe("exportPuml / importPuml", () => {
  it("exportPuml is a thin wrapper over the generator", () => {
    // Arrange
    const diagram = classDiagramWith({
      title: "Hello",
      nodes: [
        { id: "a", kind: "class", label: "A" },
        { id: "b", kind: "class", label: "B" },
      ],
      edges: [{ id: "e", source: "a", target: "b", kind: "association" }],
    });

    // Act
    const text = exportPuml(diagram);

    // Assert
    expect(text).toMatch(/^@startuml/u);
    expect(text).toMatch(/@enduml\n$/u);
    expect(text).toContain("title Hello");
  });

  it("importPuml runs auto-layout when no meta-comment is present", async () => {
    // Arrange
    const text = `@startuml\nclass Foo\nclass Bar\nFoo --> Bar\n@enduml\n`;

    // Act
    const result = await importPuml(text, {
      diagramType: "class",
      diagramId: "d",
      idFactory: counter(),
    });

    // Assert
    expect(result.errors).toEqual([]);
    expect(result.layoutEngine === "elk" || result.layoutEngine === "grid").toBe(true);
    expect(result.ast.metadata.layoutOverrides).toBeDefined();
    const overrideKeys = Object.keys(result.ast.metadata.layoutOverrides ?? {}).sort();
    expect(overrideKeys).toEqual(["id-1", "id-2"]);
  });

  it("importPuml preserves meta layout when present (`layoutMode: 'missing'` is the default)", async () => {
    // Arrange
    const text =
      `@startuml\n` +
      `' @drawer:meta {"layoutOverrides":{"id-1":{"x":10,"y":20}}}\n` +
      `class Foo\n` +
      `@enduml\n`;

    // Act
    const result = await importPuml(text, {
      diagramType: "class",
      diagramId: "d",
      idFactory: counter(),
    });

    // Assert
    expect(result.layoutEngine).toBe("preserved");
    expect(result.ast.metadata.layoutOverrides).toEqual({ "id-1": { x: 10, y: 20 } });
  });

  it("importPuml respects `layoutMode: 'never'`", async () => {
    // Arrange
    const text = `@startuml\nclass Foo\nclass Bar\n@enduml\n`;

    // Act
    const result = await importPuml(text, {
      diagramType: "class",
      diagramId: "d",
      idFactory: counter(),
      layoutMode: "never",
    });

    // Assert
    expect(result.layoutEngine).toBe("skipped");
    expect(result.ast.metadata.layoutOverrides).toBeUndefined();
  });

  it("round-trips parsed AST through exportPuml + parser without drift", async () => {
    // Arrange
    const text = `@startuml\nclass Foo\nclass Bar\nFoo --> Bar : uses\n@enduml\n`;
    const first = parsePlantUml(text, {
      diagramType: "class",
      diagramId: "d",
      idFactory: counter(),
    });

    // Act
    const generated = exportPuml(first.ast);
    const second = parsePlantUml(generated, {
      diagramType: "class",
      diagramId: "d",
      idFactory: counter(),
    });

    // Assert
    expect(second.ast).toEqual(first.ast);
  });
});

describe("exportJson / importJson", () => {
  it("round-trips a Diagram byte-equal", () => {
    // Arrange
    const diagram: Diagram = classDiagramWith({
      title: "T",
      nodes: [
        { id: "a", kind: "class", label: "A" },
        { id: "b", kind: "class", label: "B" },
      ],
      edges: [{ id: "e", source: "a", target: "b", kind: "association", label: "uses" }],
      styles: { a: { fill: "var(--uml-accent)" } },
      metadata: {
        schemaVersion: "0.1.0",
        layoutOverrides: { a: { x: 1, y: 2 }, b: { x: 100, y: 2 } },
      },
    });

    // Act
    const text = exportJson(diagram);
    const result = importJson(text);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ast).toEqual(diagram);
  });

  it("rejects malformed JSON with a path-issue list", () => {
    // Arrange / Act
    const result = importJson("{ not valid json");

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]?.path).toEqual([]);
    }
  });

  it("rejects valid JSON that doesn't match the diagram schema", () => {
    // Arrange — wrong `type` enum
    const result = importJson(
      JSON.stringify({
        id: "d",
        type: "ladder", // not a valid DiagramType
        nodes: [],
        edges: [],
        groups: [],
        metadata: { schemaVersion: "0.1.0" },
      }),
    );

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.path.includes("type"))).toBe(true);
    }
  });

  it("stamps the current schemaVersion on export", () => {
    // Arrange — fake a stale version
    const diagram: Diagram = {
      ...classDiagramWith({}),
      metadata: { schemaVersion: "0.0.0-legacy" },
    };

    // Act
    const stamped = JSON.parse(exportJson(diagram)) as { metadata: { schemaVersion: string } };

    // Assert
    expect(stamped.metadata.schemaVersion).toBe("0.1.0");
  });
});

describe("exportSvg + serializeVNode", () => {
  it("emits well-formed SVG with xmlns attribute and the canvas root class", () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [
        { id: "a", kind: "class", label: "A" },
        { id: "b", kind: "class", label: "B" },
      ],
      edges: [{ id: "e", source: "a", target: "b", kind: "association" }],
    });

    // Act
    const svg = exportSvg(diagram);

    // Assert
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.includes('xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.includes('class="uml-canvas"')).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("escapes special characters in node labels and attributes", () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [{ id: "a", kind: "class", label: 'A "quoted" <token>' }],
    });

    // Act
    const svg = exportSvg(diagram);

    // Assert
    // The label appears in <text>; both `<`, `>`, `"`, and `&` must be escaped
    expect(svg.includes('A "quoted" <token>')).toBe(false);
    expect(svg).toContain("A &quot;quoted&quot; &lt;token&gt;");
  });

  it("inlines a theme style block when supplied", () => {
    // Arrange
    const block = buildThemeStyleBlock({ "--uml-bg": "#fff", "--uml-text": "#000" });
    const diagram = classDiagramWith({
      nodes: [{ id: "a", kind: "class", label: "A" }],
    });

    // Act
    const svg = exportSvg(diagram, { themeStyleBlock: block });

    // Assert
    expect(svg).toContain("<style>");
    expect(svg).toContain("--uml-bg: #fff");
  });

  it("includeXmlDeclaration prepends the XML prologue", () => {
    // Arrange / Act
    const svg = exportSvg(classDiagramWith({}), { includeXmlDeclaration: true });

    // Assert
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
  });

  it("serializeVNode handles void elements with no children", () => {
    // Arrange / Act
    const text = serializeVNode({
      tag: "rect",
      attrs: { x: 0, y: 0, width: 10, height: 10 },
    });

    // Assert
    expect(text).toBe('<rect x="0" y="0" width="10" height="10" />');
  });
});

describe("exportPng — DOM-free path via injected factories", () => {
  it("renders the SVG to a PNG Blob using stub factories", async () => {
    // Arrange
    const diagram = classDiagramWith({
      nodes: [{ id: "a", kind: "class", label: "A" }],
    });

    let capturedSrc = "";
    const image: PngImage = {
      src: "",
      onload: null,
      onerror: null,
    };
    Object.defineProperty(image, "src", {
      set(value: string): void {
        capturedSrc = value;
        // Simulate async load completion
        Promise.resolve().then(() => image.onload?.());
      },
      get(): string {
        return capturedSrc;
      },
    });

    const ctx: PngCanvasContext = {
      scale: () => undefined,
      drawImage: () => undefined,
    };
    let madeCanvas: PngCanvas | null = null;
    const factory = (width: number, height: number): PngCanvas => {
      const canvas: PngCanvas = {
        width,
        height,
        getContext: () => ctx,
        toBlob(callback): void {
          const blob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" });
          callback(blob);
        },
      };
      madeCanvas = canvas;
      return canvas;
    };

    // Act
    const blob = await exportPng(diagram, {
      width: 400,
      height: 200,
      devicePixelRatio: 2,
      imageFactory: () => image,
      canvasFactory: factory,
    });

    // Assert
    expect(blob.type).toBe("image/png");
    const made = madeCanvas as PngCanvas | null;
    expect(made?.width).toBe(800); // 400 × dpr 2
    expect(made?.height).toBe(400);
    expect(capturedSrc.startsWith("data:image/svg+xml")).toBe(true);
  });

  it("rejects when the canvas yields no Blob", async () => {
    // Arrange
    const image: PngImage = { src: "", onload: null, onerror: null };
    Object.defineProperty(image, "src", {
      set(): void {
        Promise.resolve().then(() => image.onload?.());
      },
    });
    const canvas: PngCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({ scale: () => undefined, drawImage: () => undefined }),
      toBlob(callback): void {
        callback(null);
      },
    };

    // Act / Assert
    await expect(
      exportPng(classDiagramWith({}), {
        width: 100,
        height: 100,
        imageFactory: () => image,
        canvasFactory: () => canvas,
      }),
    ).rejects.toThrow(/canvas\.toBlob returned null/u);
  });
});

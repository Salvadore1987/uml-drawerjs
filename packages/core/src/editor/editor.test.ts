// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { addNodeCommand } from "../commands/addNode.js";
import { createEmptyDiagram } from "../model/factory.js";
import { exportJson } from "../exporters/json.js";
import { generatePlantUml } from "../generator/index.js";
import type { Diagram } from "../model/types.js";
import { createEditor } from "./createEditor.js";
import type { EditorChangeEvent, EditorInstance } from "./options.js";

function host(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

function mountedEditor(overrides: Partial<Parameters<typeof createEditor>[1]> = {}): {
  host: HTMLElement;
  editor: EditorInstance;
  events: EditorChangeEvent[];
} {
  const target = host();
  const events: EditorChangeEvent[] = [];
  const editor = createEditor(target, {
    diagramType: "class",
    onChange: (event) => events.push(event),
    ...overrides,
  });
  return { host: target, editor, events };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createEditor — host bootstrap", () => {
  it("mounts an SVG into the host and stamps the contract attributes", () => {
    // Arrange
    const target = host();

    // Act
    const editor = createEditor(target, { diagramType: "class" });

    // Assert
    expect(target.hasAttribute("data-uml-host")).toBe(true);
    expect(["light", "dark"]).toContain(target.getAttribute("data-theme"));
    expect(target.querySelector("svg")).not.toBeNull();

    editor.destroy();
  });

  it("publishes an initial change event with a clean text/ast/errors snapshot", () => {
    // Arrange & Act
    const { editor, events } = mountedEditor();

    // Assert
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event).toBeDefined();
    expect(event!.command).toBeNull();
    expect(event!.text).toContain("@startuml");
    expect(event!.errors).toEqual([]);
    expect(event!.ast.type).toBe("class");

    editor.destroy();
  });
});

describe("createEditor — command dispatch", () => {
  it("re-renders the SVG and emits onChange after dispatch", () => {
    // Arrange
    const { host: target, editor, events } = mountedEditor();
    const beforeNodes = target.querySelectorAll("[data-node-id]").length;

    // Act
    editor.dispatch(addNodeCommand({ id: "a", kind: "class", label: "A" }));

    // Assert
    expect(target.querySelectorAll("[data-node-id]").length).toBeGreaterThan(beforeNodes);
    expect(events.length).toBeGreaterThanOrEqual(2);
    const last = events.at(-1);
    expect(last).toBeDefined();
    expect(last!.command?.kind).toBe("AddNode");
    expect(last!.text).toContain("class A");

    editor.destroy();
  });

  it("undo / redo round-trips through history and notifies listeners", () => {
    // Arrange
    const { editor, events } = mountedEditor();
    const initialJson = exportJson(editor.getState());
    editor.dispatch(addNodeCommand({ id: "a", kind: "class", label: "A" }));
    const afterAddJson = exportJson(editor.getState());

    // Act
    const undid = editor.undo();
    const undoJson = exportJson(editor.getState());
    const redid = editor.redo();
    const redoJson = exportJson(editor.getState());

    // Assert
    expect(undid).toBe(true);
    expect(redid).toBe(true);
    expect(undoJson).toBe(initialJson);
    expect(redoJson).toBe(afterAddJson);
    expect(events.length).toBeGreaterThanOrEqual(4);

    editor.destroy();
  });
});

describe("createEditor — text + json import", () => {
  it("loadFromText parses, dispatches ImportText, and surfaces errors", async () => {
    // Arrange
    const { editor } = mountedEditor();
    const source = `@startuml\nclass Alpha\nclass Beta\nAlpha --> Beta\n@enduml\n`;

    // Act
    const change = await editor.loadFromText(source);

    // Assert
    expect(change.ast.nodes.map((n) => n.label).sort()).toEqual(["Alpha", "Beta"]);
    expect(change.ast.edges).toHaveLength(1);
    // Round-trip the resulting AST through the generator.
    const regen = editor.exportText();
    expect(regen).toContain("Alpha");
    expect(regen).toContain("Beta");

    editor.destroy();
  });

  it("loadFromJson rejects mismatched diagram types without mutating state", () => {
    // Arrange
    const { editor } = mountedEditor();
    const wrongType: Diagram = createEmptyDiagram("er");
    wrongType.nodes.push({ id: "ent", kind: "entity", label: "User" });
    const before = exportJson(editor.getState());

    // Act
    const result = editor.loadFromJson(exportJson(wrongType));

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.path).toEqual(["type"]);
    }
    expect(exportJson(editor.getState())).toBe(before);

    editor.destroy();
  });

  it("loadFromJson accepts a matching diagram and replaces the AST", () => {
    // Arrange
    const { editor } = mountedEditor();
    const replacement: Diagram = createEmptyDiagram("class");
    replacement.nodes.push({ id: "x", kind: "class", label: "X" });

    // Act
    const result = editor.loadFromJson(exportJson(replacement));

    // Assert
    expect(result.ok).toBe(true);
    expect(editor.getState().nodes.map((n) => n.id)).toContain("x");

    editor.destroy();
  });
});

describe("createEditor — exporters", () => {
  it("exportText matches `generatePlantUml(state)`", () => {
    // Arrange
    const { editor } = mountedEditor();
    editor.dispatch(addNodeCommand({ id: "a", kind: "class", label: "A" }));

    // Act
    const text = editor.exportText();

    // Assert
    expect(text).toBe(generatePlantUml(editor.getState()));

    editor.destroy();
  });

  it("exportSvg returns a serialised <svg> string", () => {
    // Arrange
    const { editor } = mountedEditor();

    // Act
    const svg = editor.exportSvg();

    // Assert
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.includes(`xmlns="http://www.w3.org/2000/svg"`)).toBe(true);

    editor.destroy();
  });
});

describe("createEditor — theme", () => {
  it("respects an explicit theme option", () => {
    // Arrange
    const target = host();

    // Act
    const editor = createEditor(target, { diagramType: "class", theme: "dark" });

    // Assert
    expect(target.getAttribute("data-theme")).toBe("dark");

    editor.applyTheme("light");
    expect(target.getAttribute("data-theme")).toBe("light");

    editor.destroy();
  });

  it("falls back to prefers-color-scheme when theme is auto", () => {
    // Arrange
    const target = host();
    const originalMatchMedia = (globalThis as { matchMedia?: typeof window.matchMedia }).matchMedia;
    const matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as MediaQueryList);
    (globalThis as unknown as { matchMedia: typeof window.matchMedia }).matchMedia =
      matchMedia as unknown as typeof window.matchMedia;

    try {
      // Act
      const editor = createEditor(target, { diagramType: "class", theme: "auto" });

      // Assert — `matches: true` corresponds to dark
      expect(target.getAttribute("data-theme")).toBe("dark");
      editor.destroy();
    } finally {
      if (originalMatchMedia) {
        (globalThis as unknown as { matchMedia: typeof window.matchMedia }).matchMedia =
          originalMatchMedia;
      } else {
        delete (globalThis as { matchMedia?: typeof window.matchMedia }).matchMedia;
      }
    }
  });
});

describe("createEditor — destroy", () => {
  it("removes the SVG and clears contract attributes", () => {
    // Arrange
    const target = host();
    const editor = createEditor(target, { diagramType: "class" });
    expect(target.querySelector("svg")).not.toBeNull();

    // Act
    editor.destroy();

    // Assert
    expect(target.querySelector("svg")).toBeNull();
    expect(target.hasAttribute("data-uml-host")).toBe(false);
    expect(target.hasAttribute("data-theme")).toBe(false);
  });

  it("stops emitting onChange after destroy()", () => {
    // Arrange
    const { editor, events } = mountedEditor();
    editor.destroy();
    const before = events.length;

    // Act — bus is exposed but a destroyed editor shouldn't keep relaying
    // (subscriber was unwired). We dispatch through the bus directly to
    // bypass the dispatch method, which the test treats as "still alive".
    editor.bus.dispatch(addNodeCommand({ id: "z", kind: "class", label: "Z" }));

    // Assert
    expect(events.length).toBe(before);
  });
});

describe("createEditor — runAutoLayout", () => {
  it("dispatches an ApplyLayout command and persists coordinates in metadata", async () => {
    // Arrange
    const target = host();
    const editor = createEditor(target, { diagramType: "class" });
    editor.dispatch(addNodeCommand({ id: "a", kind: "class", label: "A" }));
    editor.dispatch(addNodeCommand({ id: "b", kind: "class", label: "B" }));

    // Act
    await editor.runAutoLayout();

    // Assert
    const overrides = editor.getState().metadata.layoutOverrides ?? {};
    expect(Object.keys(overrides).sort()).toEqual(["a", "b"]);

    editor.destroy();
  });
});

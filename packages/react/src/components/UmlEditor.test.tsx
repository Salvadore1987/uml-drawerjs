import { addNodeCommand } from "@uml-drawer/core/commands";
import type { EditorChangeEvent } from "@uml-drawer/core/editor";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Canvas, Outline, Palette, PropsPanel, TextEditor, UmlEditor } from "../index.js";
import { useEditor } from "../hooks/useEditor.js";

// happy-dom doesn't lay anything out, but rendering exercises the
// effect-based editor lifecycle which is what we care about here.

afterEach(() => {
  document.body.innerHTML = "";
});

type Probe = NonNullable<ReturnType<typeof useEditor>>;

function ProbeEditor({ onReady }: { onReady: (editor: Probe) => void }): null {
  const editor = useEditor();
  if (editor) onReady(editor);
  return null;
}

describe("<UmlEditor />", () => {
  it("mounts the SVG into the <Canvas /> host once both are present", async () => {
    // Arrange & Act
    render(
      <UmlEditor diagramType="class">
        <Canvas data-testid="canvas" />
      </UmlEditor>,
    );

    // Assert
    const canvas = await screen.findByTestId("canvas");
    expect(canvas.querySelector("svg")).not.toBeNull();
    expect(canvas.getAttribute("data-uml-host")).toBe("");
    expect(["light", "dark"]).toContain(canvas.getAttribute("data-theme"));
  });

  it("publishes onChange after dispatch and unmount cleans up", async () => {
    // Arrange
    const events: EditorChangeEvent[] = [];
    let captured: Probe | null = null;
    const { unmount } = render(
      <UmlEditor diagramType="class" onChange={(event) => events.push(event)}>
        <Canvas />
        <ProbeEditor onReady={(ed) => (captured = ed)} />
      </UmlEditor>,
    );

    // Act — wait a tick for the effect to mount the editor.
    await act(async () => {
      await Promise.resolve();
    });

    expect(captured).not.toBeNull();
    act(() => {
      captured!.dispatch(addNodeCommand({ id: "n1", kind: "class", label: "Alpha" }));
    });

    // Assert
    expect(events.length).toBeGreaterThanOrEqual(1);
    const last = events.at(-1);
    expect(last?.command?.kind).toBe("AddNode");
    expect(last?.text).toContain("class Alpha");

    unmount();
    expect(document.body.querySelector("svg")).toBeNull();
  });

  it("loads `defaultValue` through the parser on mount", async () => {
    // Arrange
    const initial = `@startuml\nclass Alpha\n@enduml\n`;
    let captured: Probe | null = null;

    // Act
    render(
      <UmlEditor diagramType="class" defaultValue={initial}>
        <Canvas />
        <ProbeEditor onReady={(ed) => (captured = ed)} />
      </UmlEditor>,
    );

    // Assert — `loadFromText` is async (it awaits auto-layout); waitFor
    // polls until the bus has applied the ImportText command.
    await waitFor(() => {
      expect(captured).not.toBeNull();
      const labels = captured!.getState().nodes.map((n) => n.label);
      expect(labels).toContain("Alpha");
    });
  });

  it("controlled `value` prop syncs through loadFromText", async () => {
    // Arrange
    let captured: Probe | null = null;
    const { rerender } = render(
      <UmlEditor diagramType="class" value={`@startuml\n@enduml\n`}>
        <Canvas />
        <ProbeEditor onReady={(ed) => (captured = ed)} />
      </UmlEditor>,
    );
    await waitFor(() => {
      expect(captured).not.toBeNull();
    });

    // Act
    rerender(
      <UmlEditor diagramType="class" value={`@startuml\nclass Beta\n@enduml\n`}>
        <Canvas />
        <ProbeEditor onReady={(ed) => (captured = ed)} />
      </UmlEditor>,
    );

    // Assert
    await waitFor(() => {
      expect(captured!.getState().nodes.map((n) => n.label)).toContain("Beta");
    });
  });

  it("StrictMode double-mount keeps a single SVG on the canvas after settle", async () => {
    // Arrange & Act
    render(
      <StrictMode>
        <UmlEditor diagramType="class">
          <Canvas data-testid="canvas" />
        </UmlEditor>
      </StrictMode>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    // Assert — exactly one SVG inside the canvas, no orphans on body.
    const canvas = screen.getByTestId("canvas");
    expect(canvas.querySelectorAll("svg")).toHaveLength(1);
  });
});

describe("Component composition", () => {
  it("renders Palette / Outline / PropsPanel / TextEditor without throwing", async () => {
    // Arrange & Act
    render(
      <UmlEditor diagramType="class">
        <Canvas />
        <Palette />
        <Outline />
        <PropsPanel />
        <TextEditor />
      </UmlEditor>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    // Assert
    expect(screen.getByText("Palette")).toBeTruthy();
    expect(screen.getByText("Outline")).toBeTruthy();
    expect(screen.getByText("Properties")).toBeTruthy();
    expect(screen.getByText("PlantUML")).toBeTruthy();
  });

  it("paletteFilter narrows the palette items", async () => {
    // Arrange & Act
    render(
      <UmlEditor diagramType="class" paletteFilter={(item) => item.kind === "class"}>
        <Canvas />
        <Palette />
      </UmlEditor>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    // Assert — only Class button is rendered, not Interface / Abstract / Enum.
    const buttons = document.querySelectorAll(".uml-palette__button");
    expect(buttons.length).toBe(1);
    expect(buttons[0]?.getAttribute("data-kind")).toBe("class");
  });

  it("clicking a palette button dispatches AddNodeCommand", async () => {
    // Arrange
    let captured: Probe | null = null;
    render(
      <UmlEditor diagramType="class">
        <Canvas />
        <Palette />
        <ProbeEditor onReady={(ed) => (captured = ed)} />
      </UmlEditor>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const before = captured!.getState().nodes.length;

    // Act
    const classButton = document.querySelector(
      '.uml-palette__button[data-kind="class"]',
    ) as HTMLButtonElement;
    expect(classButton).not.toBeNull();
    act(() => {
      classButton.click();
    });

    // Assert
    expect(captured!.getState().nodes.length).toBe(before + 1);
  });

  it("PropsPanel Interaction select toggles the async tag on a C4 edge", async () => {
    // Arrange — a C4 diagram with one (sync) Rel; select its edge.
    const initial =
      `@startuml\n` +
      `Person(p, "Person")\n` +
      `System(s, "System")\n` +
      `Rel(p, s, "Uses", "HTTPS")\n` +
      `@enduml\n`;
    let captured: Probe | null = null;
    render(
      <UmlEditor diagramType="c4-context" defaultValue={initial}>
        <Canvas />
        <PropsPanel />
        <ProbeEditor onReady={(ed) => (captured = ed)} />
      </UmlEditor>,
    );
    await waitFor(() => {
      expect(captured).not.toBeNull();
      expect(captured!.getState().edges).toHaveLength(1);
    });
    const edgeId = captured!.getState().edges[0]!.id;
    act(() => {
      captured!.selection.set([edgeId]);
    });

    // The C4 edge form shows exactly one select — the Interaction control.
    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    expect(select.value).toBe("sync");

    // Act — switch to async.
    act(() => {
      fireEvent.change(select, { target: { value: "async" } });
    });

    // Assert — text gains the $tags argument plus the AddRelTag header.
    expect(captured!.exportText()).toContain('$tags="async"');
    expect(captured!.exportText()).toContain('AddRelTag("async", $lineStyle = DashedLine())');

    // Act — switch back to sync.
    act(() => {
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "sync" } });
    });

    // Assert — both the tag and the header are gone again.
    expect(captured!.exportText()).not.toContain("$tags");
    expect(captured!.exportText()).not.toContain("AddRelTag");
  });

  it("PropsPanel Kind select changes a class relationship's type", async () => {
    // Arrange — a class diagram with one association edge; select it.
    const initial =
      `@startuml\n` + `class Alpha\n` + `class Beta\n` + `Alpha --> Beta\n` + `@enduml\n`;
    let captured: Probe | null = null;
    render(
      <UmlEditor diagramType="class" defaultValue={initial}>
        <Canvas />
        <PropsPanel />
        <ProbeEditor onReady={(ed) => (captured = ed)} />
      </UmlEditor>,
    );
    await waitFor(() => {
      expect(captured).not.toBeNull();
      expect(captured!.getState().edges).toHaveLength(1);
    });
    expect(captured!.getState().edges[0]!.kind).toBe("association");
    const edgeId = captured!.getState().edges[0]!.id;
    act(() => {
      captured!.selection.set([edgeId]);
    });

    // The class edge form exposes the Kind dropdown as its only combobox.
    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    expect(select.value).toBe("association");
    // All six class relationship types are offered.
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual([
      "association",
      "inheritance",
      "realization",
      "dependency",
      "aggregation",
      "composition",
    ]);

    // Act — switch to inheritance.
    act(() => {
      fireEvent.change(select, { target: { value: "inheritance" } });
    });

    // Assert — the AST kind changed and the source emits the inheritance arrow.
    expect(captured!.getState().edges[0]!.kind).toBe("inheritance");
    expect(captured!.exportText()).toContain("Alpha --|> Beta");
  });

  it("PropsPanel Reverse direction swaps a relationship's endpoints", async () => {
    // Arrange — a class diagram with one directed association; select it.
    const initial =
      `@startuml\n` + `class Alpha\n` + `class Beta\n` + `Alpha --> Beta\n` + `@enduml\n`;
    let captured: Probe | null = null;
    render(
      <UmlEditor diagramType="class" defaultValue={initial}>
        <Canvas />
        <PropsPanel />
        <ProbeEditor onReady={(ed) => (captured = ed)} />
      </UmlEditor>,
    );
    await waitFor(() => {
      expect(captured).not.toBeNull();
      expect(captured!.getState().edges).toHaveLength(1);
    });
    const before = captured!.getState().edges[0]!;
    const { source: origSource, target: origTarget } = before;
    act(() => {
      captured!.selection.set([before.id]);
    });

    // Act — click the Reverse direction button.
    const button = await screen.findByRole("button", { name: /reverse direction/i });
    act(() => {
      fireEvent.click(button);
    });

    // Assert — endpoints swapped in the AST and the emitted arrow flips.
    const after = captured!.getState().edges[0]!;
    expect(after.source).toBe(origTarget);
    expect(after.target).toBe(origSource);
    expect(captured!.exportText()).toContain("Beta --> Alpha");

    // Act — clicking again restores the original direction.
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /reverse direction/i }));
    });
    const restored = captured!.getState().edges[0]!;
    expect(restored.source).toBe(origSource);
    expect(restored.target).toBe(origTarget);
  });

  it("PropsPanel Type select changes a class node's kind in place", async () => {
    // Arrange — a class diagram with one class node; select it.
    const initial = `@startuml\nclass Alpha\n@enduml\n`;
    let captured: Probe | null = null;
    render(
      <UmlEditor diagramType="class" defaultValue={initial}>
        <Canvas />
        <PropsPanel />
        <ProbeEditor onReady={(ed) => (captured = ed)} />
      </UmlEditor>,
    );
    await waitFor(() => {
      expect(captured).not.toBeNull();
      expect(captured!.getState().nodes).toHaveLength(1);
    });
    const node = captured!.getState().nodes[0]!;
    expect(node.kind).toBe("class");
    act(() => {
      captured!.selection.set([node.id]);
    });

    // The Type dropdown is labelled "Type" and offers the four class kinds.
    const select = (await screen.findByRole("combobox", { name: "Type" })) as HTMLSelectElement;
    expect(select.value).toBe("class");
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(["class", "interface", "abstract-class", "enum"]);

    // Act — switch to interface.
    act(() => {
      fireEvent.change(select, { target: { value: "interface" } });
    });

    // Assert — same node id, kind changed, source emits the interface keyword.
    const after = captured!.getState().nodes[0]!;
    expect(after.id).toBe(node.id);
    expect(after.kind).toBe("interface");
    expect(captured!.exportText()).toContain("interface Alpha");
  });

  it("PropsPanel hides the Type select for a non-class node", async () => {
    // Arrange — a C4 context diagram; its System node is not class-like.
    const initial = `@startuml\nSystem(s, "System")\n@enduml\n`;
    let captured: Probe | null = null;
    render(
      <UmlEditor diagramType="c4-context" defaultValue={initial}>
        <Canvas />
        <PropsPanel />
        <ProbeEditor onReady={(ed) => (captured = ed)} />
      </UmlEditor>,
    );
    await waitFor(() => {
      expect(captured).not.toBeNull();
      expect(captured!.getState().nodes).toHaveLength(1);
    });
    act(() => {
      captured!.selection.set([captured!.getState().nodes[0]!.id]);
    });

    // Assert — no Type dropdown for a non-class-like kind.
    await screen.findByRole("form");
    expect(screen.queryByRole("combobox", { name: "Type" })).toBeNull();
  });

  it("parameterizes a generic member type via per-argument fields", async () => {
    // Arrange — a class with one attribute typed `String`.
    const initial = `@startuml\nclass Box {\n  -items: String\n}\n@enduml\n`;
    let captured: Probe | null = null;
    render(
      <UmlEditor diagramType="class" defaultValue={initial}>
        <Canvas />
        <PropsPanel />
        <ProbeEditor onReady={(ed) => (captured = ed)} />
      </UmlEditor>,
    );
    await waitFor(() => {
      expect(captured).not.toBeNull();
      expect(captured!.getState().nodes[0]?.attributes ?? []).toHaveLength(1);
    });
    act(() => {
      captured!.selection.set([captured!.getState().nodes[0]!.id]);
    });

    // Act — switch the attribute type to the Map generic, then fill key/value.
    const baseSelect = (await screen.findByRole("combobox", {
      name: "Attribute type",
    })) as HTMLSelectElement;
    act(() => {
      fireEvent.change(baseSelect, { target: { value: "Map" } });
    });
    const keySelect = (await screen.findByRole("combobox", {
      name: "Attribute type key",
    })) as HTMLSelectElement;
    act(() => {
      fireEvent.change(keySelect, { target: { value: "String" } });
    });
    const valueSelect = (await screen.findByRole("combobox", {
      name: "Attribute type value",
    })) as HTMLSelectElement;
    act(() => {
      fireEvent.change(valueSelect, { target: { value: "Integer" } });
    });

    // Assert — the composed generic type is stored on the attribute.
    expect(captured!.getState().nodes[0]!.attributes?.[0]?.type).toBe("Map<String, Integer>");
    expect(captured!.exportText()).toContain("items: Map<String, Integer>");
  });

  it("decomposes an existing generic member type into base + argument fields", async () => {
    // Arrange — an attribute already typed `List<String>`.
    const initial = `@startuml\nclass Box {\n  -items: List<String>\n}\n@enduml\n`;
    let captured: Probe | null = null;
    render(
      <UmlEditor diagramType="class" defaultValue={initial}>
        <Canvas />
        <PropsPanel />
        <ProbeEditor onReady={(ed) => (captured = ed)} />
      </UmlEditor>,
    );
    await waitFor(() => {
      expect(captured).not.toBeNull();
      expect(captured!.getState().nodes[0]?.attributes?.[0]?.type).toBe("List<String>");
    });
    act(() => {
      captured!.selection.set([captured!.getState().nodes[0]!.id]);
    });

    // Assert — base select shows List, element select shows String.
    const baseSelect = (await screen.findByRole("combobox", {
      name: "Attribute type",
    })) as HTMLSelectElement;
    expect(baseSelect.value).toBe("List");
    const elementSelect = (await screen.findByRole("combobox", {
      name: "Attribute type element",
    })) as HTMLSelectElement;
    expect(elementSelect.value).toBe("String");
  });

  it("no longer renders the class-level Generics input", async () => {
    const initial = `@startuml\nclass Box {\n  -items: String\n}\n@enduml\n`;
    let captured: Probe | null = null;
    render(
      <UmlEditor diagramType="class" defaultValue={initial}>
        <Canvas />
        <PropsPanel />
        <ProbeEditor onReady={(ed) => (captured = ed)} />
      </UmlEditor>,
    );
    await waitFor(() => {
      expect(captured).not.toBeNull();
      expect(captured!.getState().nodes).toHaveLength(1);
    });
    act(() => {
      captured!.selection.set([captured!.getState().nodes[0]!.id]);
    });
    await screen.findByRole("form");
    expect(screen.queryByText(/Generics/i)).toBeNull();
  });
});

describe("Hook misuse", () => {
  it("useEditor() outside a provider throws a clear error", () => {
    // Arrange — silence the React console.error noise on intentional throws.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    function Misuse(): null {
      useEditor();
      return null;
    }

    // Act & Assert
    expect(() => render(<Misuse />)).toThrow(/UmlEditor/u);
    spy.mockRestore();
  });
});

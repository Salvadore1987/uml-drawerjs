import { addNodeCommand } from "@uml-drawer/core/commands";
import type { EditorChangeEvent } from "@uml-drawer/core/editor";
import { act, render, screen, waitFor } from "@testing-library/react";
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

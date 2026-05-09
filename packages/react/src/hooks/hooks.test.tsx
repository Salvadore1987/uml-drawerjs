import { addNodeCommand } from "@uml-drawer/core/commands";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Canvas, UmlEditor } from "../index.js";
import { useDiagramErrors } from "./useDiagramErrors.js";
import { useEditor } from "./useEditor.js";
import { useEditorState } from "./useEditorState.js";
import { useSelection } from "./useSelection.js";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useEditorState", () => {
  it("re-renders consumers after every command", async () => {
    // Arrange
    let snapshot: ReturnType<typeof useEditorState> | null = null;
    let editor: ReturnType<typeof useEditor> = null;
    function Probe(): null {
      snapshot = useEditorState();
      editor = useEditor();
      return null;
    }
    render(
      <UmlEditor diagramType="class">
        <Canvas />
        <Probe />
      </UmlEditor>,
    );
    await waitFor(() => expect(editor).not.toBeNull());

    // Act
    act(() => {
      editor!.dispatch(addNodeCommand({ id: "n", kind: "class", label: "Foo" }));
    });

    // Assert
    expect(snapshot!.command?.kind).toBe("AddNode");
    expect(snapshot!.ast.nodes).toHaveLength(1);
  });
});

describe("useDiagramErrors", () => {
  it("surfaces validator output (orphan-node lint)", async () => {
    // Arrange
    let errors: ReturnType<typeof useDiagramErrors> = [];
    let editor: ReturnType<typeof useEditor> = null;
    function Probe(): null {
      errors = useDiagramErrors();
      editor = useEditor();
      return null;
    }

    // Act
    render(
      <UmlEditor diagramType="class">
        <Canvas />
        <Probe />
      </UmlEditor>,
    );
    await waitFor(() => expect(editor).not.toBeNull());
    act(() => {
      editor!.dispatch(addNodeCommand({ id: "lonely", kind: "class", label: "Lonely" }));
    });

    // Assert
    await waitFor(() => {
      expect(errors.some((e) => e.code === "LINT_ORPHAN_NODE")).toBe(true);
    });
  });
});

describe("useSelection", () => {
  it("propagates updates between independent consumers", async () => {
    // Arrange
    let viewA: ReadonlySet<string> = new Set();
    let viewB: ReadonlySet<string> = new Set();
    let controllerA: ReturnType<typeof useSelection>[1] | null = null;
    function ProbeA(): null {
      const [snapshot, controller] = useSelection();
      viewA = snapshot;
      controllerA = controller;
      return null;
    }
    function ProbeB(): null {
      const [snapshot] = useSelection();
      viewB = snapshot;
      return null;
    }
    render(
      <UmlEditor diagramType="class">
        <Canvas />
        <ProbeA />
        <ProbeB />
      </UmlEditor>,
    );

    // Act
    await waitFor(() => expect(controllerA).not.toBeNull());
    act(() => {
      controllerA!.set(["x", "y"]);
    });

    // Assert
    await waitFor(() => {
      expect(viewA.size).toBe(2);
      expect(viewB.size).toBe(2);
      expect(viewA.has("x")).toBe(true);
      expect(viewB.has("y")).toBe(true);
    });
  });
});

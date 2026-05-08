import { describe, expect, it } from "vitest";

import { addNodeCommand } from "../commands/addNode.js";
import { CommandBus } from "../commands/bus.js";
import { moveNodeCommand } from "../commands/moveNode.js";
import { updateNodeCommand } from "../commands/updateNode.js";
import { createEmptyDiagram } from "../model/factory.js";
import { uuidv7 } from "../model/ids.js";
import type { Diagram, DiagramNode } from "../model/types.js";
import { sameKindAndTarget } from "./coalesce.js";
import { History } from "./stack.js";

function setup(initial?: Diagram): { bus: CommandBus; history: History; ast: Diagram } {
  const ast = initial ?? createEmptyDiagram("class");
  const bus = new CommandBus(ast);
  const history = new History(bus);
  return { bus, history, ast };
}

describe("History — undo / redo", () => {
  it("undo restores the prior state; redo deterministically reapplies", () => {
    // Arrange
    const { history, ast } = setup();
    const before = JSON.stringify(ast);
    const node: DiagramNode = { id: uuidv7(), kind: "class", label: "Foo" };

    // Act
    history.dispatch(addNodeCommand(node));
    const undone = history.undo();
    const redone = history.redo();

    // Assert
    expect(undone).toBeDefined();
    expect(JSON.stringify(undone)).toBe(before);
    expect(redone?.nodes).toEqual([node]);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it("returns undefined when there is nothing to undo / redo", () => {
    // Arrange
    const { history } = setup();

    // Act + Assert
    expect(history.undo()).toBeUndefined();
    expect(history.redo()).toBeUndefined();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it("dispatching a fresh command after an undo clears the redo stack", () => {
    // Arrange
    const { history } = setup();
    const a = { id: uuidv7(), kind: "class" as const, label: "A" };
    const b = { id: uuidv7(), kind: "class" as const, label: "B" };

    // Act
    history.dispatch(addNodeCommand(a));
    history.undo();
    expect(history.canRedo()).toBe(true);
    history.dispatch(addNodeCommand(b));

    // Assert
    expect(history.canRedo()).toBe(false);
  });

  it("byte-equal round-trip across many dispatches", () => {
    // Arrange
    const { history, ast } = setup();
    const before = JSON.stringify(ast);
    const ids = Array.from({ length: 5 }, () => uuidv7());

    // Act
    for (const id of ids) {
      history.dispatch(addNodeCommand({ id, kind: "class", label: id }));
    }
    while (history.canUndo()) history.undo();

    // Assert
    expect(JSON.stringify(history.getState())).toBe(before);
  });
});

describe("History — coalesce policy", () => {
  it("merges consecutive same-target updates into one undo frame within the window", () => {
    // Arrange
    const node: DiagramNode = { id: uuidv7(), kind: "class", label: "v0" };
    const initial: Diagram = { ...createEmptyDiagram("class"), nodes: [node] };
    const { bus } = setup(initial);
    const history = new History(bus, {
      coalesceWindowMs: 1000,
      coalescePredicate: sameKindAndTarget,
    });

    // Act — three rapid-fire renames
    history.dispatch(updateNodeCommand(node.id, { label: "v1" }, history.getState()));
    history.dispatch(updateNodeCommand(node.id, { label: "v2" }, history.getState()));
    history.dispatch(updateNodeCommand(node.id, { label: "v3" }, history.getState()));

    // Assert — one undo collapses every keystroke
    expect(history.getState().nodes[0]?.label).toBe("v3");
    history.undo();
    expect(history.getState().nodes[0]?.label).toBe("v0");
    expect(history.canUndo()).toBe(false);
  });

  it("opens a fresh frame when the predicate returns false", () => {
    // Arrange
    const node: DiagramNode = { id: uuidv7(), kind: "class", label: "v0" };
    const initial: Diagram = {
      ...createEmptyDiagram("class"),
      nodes: [node],
    };
    const { bus } = setup(initial);
    const history = new History(bus, {
      coalesceWindowMs: 1000,
      coalescePredicate: sameKindAndTarget,
    });

    // Act — rename, then move, then rename again
    history.dispatch(updateNodeCommand(node.id, { label: "v1" }, history.getState()));
    history.dispatch(moveNodeCommand(node.id, { x: 5, y: 5 }, history.getState()));
    history.dispatch(updateNodeCommand(node.id, { label: "v2" }, history.getState()));

    // Assert — three distinct frames
    expect(history.getState().nodes[0]?.label).toBe("v2");

    history.undo();
    expect(history.getState().nodes[0]?.label).toBe("v1");
    history.undo();
    expect(history.getState().metadata.layoutOverrides).toBeUndefined();
    history.undo();
    expect(history.getState().nodes[0]?.label).toBe("v0");
  });

  it("does not coalesce after an undo (lastDispatchTs reset)", () => {
    // Arrange
    const node: DiagramNode = { id: uuidv7(), kind: "class", label: "v0" };
    const initial: Diagram = { ...createEmptyDiagram("class"), nodes: [node] };
    const { bus } = setup(initial);
    const history = new History(bus, {
      coalesceWindowMs: 1000,
      coalescePredicate: sameKindAndTarget,
    });

    // Act
    history.dispatch(updateNodeCommand(node.id, { label: "v1" }, history.getState()));
    history.undo(); // back to v0
    history.dispatch(updateNodeCommand(node.id, { label: "v2" }, history.getState()));

    // Assert — undoing once should land on v0 (frames did not coalesce after the undo)
    history.undo();
    expect(history.getState().nodes[0]?.label).toBe("v0");
  });
});

describe("History — clear", () => {
  it("forgets all frames without touching the bus state", () => {
    // Arrange
    const { bus, history } = setup();
    const node = { id: uuidv7(), kind: "class" as const, label: "Foo" };
    history.dispatch(addNodeCommand(node));
    expect(history.canUndo()).toBe(true);

    // Act
    history.clear();

    // Assert
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(bus.getState().nodes).toEqual([node]);
  });
});

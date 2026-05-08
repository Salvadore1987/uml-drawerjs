import { describe, expect, it, vi } from "vitest";

import { createEmptyDiagram } from "../model/factory.js";
import { uuidv7 } from "../model/ids.js";
import { addNodeCommand } from "./addNode.js";
import { CommandBus } from "./bus.js";

describe("CommandBus", () => {
  it("dispatches commands and updates internal state", () => {
    // Arrange
    const initial = createEmptyDiagram("class");
    const bus = new CommandBus(initial);
    const node = { id: uuidv7(), kind: "class" as const, label: "Foo" };

    // Act
    const next = bus.dispatch(addNodeCommand(node));

    // Assert
    expect(next.nodes).toEqual([node]);
    expect(bus.getState()).toBe(next);
  });

  it("emits before / after events around dispatch in the right order", () => {
    // Arrange
    const initial = createEmptyDiagram("class");
    const bus = new CommandBus(initial);
    const order: string[] = [];

    bus.on("before", ({ state }) => {
      order.push("before");
      expect(state).toBe(initial);
    });
    bus.on("after", ({ previousState, nextState }) => {
      order.push("after");
      expect(previousState).toBe(initial);
      expect(nextState).not.toBe(initial);
    });

    // Act
    bus.dispatch(addNodeCommand({ id: uuidv7(), kind: "class", label: "F" }));

    // Assert
    expect(order).toEqual(["before", "after"]);
  });

  it("supports unsubscribing listeners via the returned dispose function", () => {
    // Arrange
    const bus = new CommandBus(createEmptyDiagram("class"));
    const listener = vi.fn();
    const dispose = bus.on("after", listener);

    // Act
    bus.dispatch(addNodeCommand({ id: uuidv7(), kind: "class", label: "A" }));
    dispose();
    bus.dispatch(addNodeCommand({ id: uuidv7(), kind: "class", label: "B" }));

    // Assert
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("setState replaces state without emitting events", () => {
    // Arrange
    const bus = new CommandBus(createEmptyDiagram("class"));
    const before = vi.fn();
    const after = vi.fn();
    bus.on("before", before);
    bus.on("after", after);

    // Act
    bus.setState(createEmptyDiagram("er"));

    // Assert
    expect(before).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
    expect(bus.getState().type).toBe("er");
  });

  it("tolerates listeners that unsubscribe themselves during emit", () => {
    // Arrange
    const bus = new CommandBus(createEmptyDiagram("class"));
    const second = vi.fn();
    const dispose = bus.on("after", () => dispose());
    bus.on("after", second);

    // Act
    bus.dispatch(addNodeCommand({ id: uuidv7(), kind: "class", label: "A" }));

    // Assert — both listeners ran on this dispatch; on the next one only
    // `second` should still be subscribed.
    expect(second).toHaveBeenCalledTimes(1);
    bus.dispatch(addNodeCommand({ id: uuidv7(), kind: "class", label: "B" }));
    expect(second).toHaveBeenCalledTimes(2);
  });
});

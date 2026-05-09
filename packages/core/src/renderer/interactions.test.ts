// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";

import { CommandBus } from "../commands/index.js";
import { History } from "../history/index.js";
import { createEmptyDiagram } from "../model/factory.js";
import type { Diagram } from "../model/types.js";
import { renderDiagram } from "./index.js";
import { createSelectionModel } from "./selection.js";
import { mountSvg } from "./mount.js";
import { attachInteractions } from "./interactions.js";

function diagramWithTwoNodes(): Diagram {
  const empty = createEmptyDiagram("class");
  return {
    ...empty,
    nodes: [
      { id: "a", kind: "class", label: "A" },
      { id: "b", kind: "class", label: "B" },
    ],
    edges: [],
    groups: [],
    metadata: {
      ...empty.metadata,
      layoutOverrides: {
        a: { x: 0, y: 0 },
        b: { x: 240, y: 0 },
      },
    },
  };
}

function pointerEvent(
  type: string,
  init: Partial<PointerEvent> & { target?: Element },
): PointerEvent {
  // happy-dom doesn't ship a fully-fledged PointerEvent constructor in
  // every release; fall back to MouseEvent and graft pointer-specific
  // fields by hand.
  const eventInit: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
    shiftKey: init.shiftKey ?? false,
  };
  const event = new MouseEvent(type, eventInit) as unknown as PointerEvent & {
    pointerId: number;
    pointerType: string;
  };
  Object.defineProperty(event, "pointerId", { value: init.pointerId ?? 1 });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  return event;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("renderer/interactions — pointer flow", () => {
  function setup(diagram: Diagram = diagramWithTwoNodes()) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const bus = new CommandBus(diagram);
    const history = new History(bus);
    const coords = diagram.metadata.layoutOverrides ?? {};
    const rendered = renderDiagram(diagram, { coordinates: coords });
    const mount = mountSvg(host, rendered.root);
    const content = mount.root.querySelector('[data-uml-content="true"]') as SVGGraphicsElement;
    const selection = createSelectionModel();
    const controller = attachInteractions({
      svg: mount.root,
      contentGroup: content,
      history,
      bus,
      selection,
      idFactory: () => "edge-1",
    });
    return { host, bus, history, selection, controller, mount };
  }

  it("pointerdown on a node updates selection", () => {
    // Arrange
    const { selection, mount, controller } = setup();
    const nodeA = mount.root.querySelector('[data-node-id="a"]') as Element;

    // Act
    nodeA.dispatchEvent(pointerEvent("pointerdown", { target: nodeA, clientX: 50, clientY: 30 }));

    // Assert
    expect([...selection.get()]).toEqual(["a"]);
    controller.dispose();
  });

  it("pointerdown on empty canvas clears selection", () => {
    // Arrange
    const { selection, mount, controller } = setup();
    selection.set(["a"]);
    const svg = mount.root;

    // Act
    svg.dispatchEvent(pointerEvent("pointerdown", { target: svg, clientX: 800, clientY: 800 }));

    // Assert
    expect([...selection.get()]).toEqual([]);
    controller.dispose();
  });

  it("Shift+pointerdown toggles selection", () => {
    // Arrange
    const { selection, mount, controller } = setup();
    const nodeA = mount.root.querySelector('[data-node-id="a"]') as Element;
    const nodeB = mount.root.querySelector('[data-node-id="b"]') as Element;

    // Act
    nodeA.dispatchEvent(pointerEvent("pointerdown", { target: nodeA, clientX: 50, clientY: 30 }));
    nodeA.dispatchEvent(pointerEvent("pointerup", { target: nodeA, clientX: 50, clientY: 30 }));
    nodeB.dispatchEvent(
      pointerEvent("pointerdown", { target: nodeB, clientX: 290, clientY: 30, shiftKey: true }),
    );

    // Assert
    const ids = [...selection.get()].sort();
    expect(ids).toEqual(["a", "b"]);
    controller.dispose();
  });

  it("getLocked=true suspends pointerdown selection and drag", () => {
    // Arrange
    const host = document.createElement("div");
    document.body.appendChild(host);
    const diagram = diagramWithTwoNodes();
    const bus = new CommandBus(diagram);
    const history = new History(bus);
    const coords = diagram.metadata.layoutOverrides ?? {};
    const rendered = renderDiagram(diagram, { coordinates: coords });
    const mount = mountSvg(host, rendered.root);
    const content = mount.root.querySelector('[data-uml-content="true"]') as SVGGraphicsElement;
    const selection = createSelectionModel();
    let locked = true;
    const controller = attachInteractions({
      svg: mount.root,
      contentGroup: content,
      history,
      bus,
      selection,
      idFactory: () => "ignored",
      getLocked: () => locked,
    });
    const dispatchedKinds: string[] = [];
    bus.on("after", ({ command }) => {
      dispatchedKinds.push(command.kind);
    });
    const nodeA = mount.root.querySelector('[data-node-id="a"]') as Element;

    // Act — drag while locked
    nodeA.dispatchEvent(pointerEvent("pointerdown", { target: nodeA, clientX: 50, clientY: 30 }));
    mount.root.dispatchEvent(pointerEvent("pointermove", { clientX: 100, clientY: 60 }));
    mount.root.dispatchEvent(pointerEvent("pointerup", { clientX: 100, clientY: 60 }));

    // Assert — no commands; no selection
    expect(dispatchedKinds).toEqual([]);
    expect([...selection.get()]).toEqual([]);

    // Now unlock and confirm interactions resume.
    locked = false;
    nodeA.dispatchEvent(pointerEvent("pointerdown", { target: nodeA, clientX: 50, clientY: 30 }));
    expect([...selection.get()]).toEqual(["a"]);

    controller.dispose();
  });

  it("does not re-enter the diagram model during a drag (one command on pointerup)", () => {
    // Arrange
    const { mount, history, controller, bus } = setup();
    const nodeA = mount.root.querySelector('[data-node-id="a"]') as Element;
    const dispatchedKinds: string[] = [];
    const unsubscribe = bus.on("after", ({ command }) => {
      dispatchedKinds.push(command.kind);
    });

    // Act — full drag cycle (down → 5 moves → up)
    nodeA.dispatchEvent(pointerEvent("pointerdown", { target: nodeA, clientX: 50, clientY: 30 }));
    for (let i = 0; i < 5; i++) {
      mount.root.dispatchEvent(
        pointerEvent("pointermove", { clientX: 60 + i * 5, clientY: 35 + i * 2 }),
      );
    }
    mount.root.dispatchEvent(pointerEvent("pointerup", { clientX: 110, clientY: 50 }));

    // Assert — exactly one MoveNode command landed.
    const moveCount = dispatchedKinds.filter((k) => k === "MoveNode").length;
    expect(moveCount).toBe(1);
    void history;
    unsubscribe();
    controller.dispose();
  });

  it("group drag dispatches one MoveNodeCommand per selected node, undo as one frame", () => {
    // Arrange — select both nodes ahead of the drag.
    const { mount, history, controller, bus, selection } = setup();
    selection.set(["a", "b"]);
    const nodeA = mount.root.querySelector('[data-node-id="a"]') as Element;
    const dispatchedKinds: string[] = [];
    const unsubscribe = bus.on("after", ({ command }) => {
      dispatchedKinds.push(command.kind);
    });

    // Act — drag node A by (+50, +30); node B should follow synchronously.
    nodeA.dispatchEvent(pointerEvent("pointerdown", { target: nodeA, clientX: 50, clientY: 30 }));
    mount.root.dispatchEvent(pointerEvent("pointermove", { clientX: 100, clientY: 60 }));
    mount.root.dispatchEvent(pointerEvent("pointerup", { clientX: 100, clientY: 60 }));

    // Assert — both nodes received MoveNode commands.
    const moves = dispatchedKinds.filter((k) => k === "MoveNode");
    expect(moves.length).toBe(2);

    // One Cmd+Z reverts both: only one frame on the undo stack from this gesture.
    expect(history.canUndo()).toBe(true);
    history.undo();
    // Both should be back to their original layout coords.
    const overrides = bus.getState().metadata.layoutOverrides ?? {};
    expect(overrides["a"]).toEqual({ x: 0, y: 0 });
    expect(overrides["b"]).toEqual({ x: 240, y: 0 });
    expect(history.canUndo()).toBe(false);

    unsubscribe();
    controller.dispose();
  });

  it("Shift+pointerdown on empty canvas starts a marquee and selects intersecting nodes", () => {
    // Arrange
    const { mount, selection, controller } = setup();
    const svg = mount.root;
    expect([...selection.get()]).toEqual([]);

    // Act — shift+pointerdown on empty space (target = svg root) to enter marquee.
    svg.dispatchEvent(
      pointerEvent("pointerdown", { target: svg, clientX: -10, clientY: -10, shiftKey: true }),
    );
    // The marquee rect should be present in the content group during drag.
    const liveRect = mount.root.querySelector(".uml-marquee");
    expect(liveRect).not.toBeNull();
    // Drag to a coordinate that engulfs both node A (0..200) and B (240..440).
    svg.dispatchEvent(pointerEvent("pointermove", { clientX: 600, clientY: 200 }));
    svg.dispatchEvent(pointerEvent("pointerup", { clientX: 600, clientY: 200 }));

    // Assert — both nodes selected, rect cleaned up.
    expect([...selection.get()].sort()).toEqual(["a", "b"]);
    expect(mount.root.querySelector(".uml-marquee")).toBeNull();

    controller.dispose();
  });

  it("plain pointerdown on empty canvas does NOT start a marquee", () => {
    // Arrange
    const { mount, controller } = setup();
    const svg = mount.root;

    // Act — no shift modifier.
    svg.dispatchEvent(pointerEvent("pointerdown", { target: svg, clientX: 800, clientY: 800 }));

    // Assert
    expect(mount.root.querySelector(".uml-marquee")).toBeNull();
    controller.dispose();
  });
});

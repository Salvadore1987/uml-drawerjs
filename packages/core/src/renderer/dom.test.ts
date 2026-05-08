// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyDiagram } from "../model/factory.js";
import type { Diagram } from "../model/types.js";
import { mountSvg, renderDiagram } from "./index.js";
import { attachKeyboardNavigation } from "./keyboard.js";
import { createPanZoomController } from "./panZoom.js";

function classDiagramWith(overrides: Partial<Diagram>): Diagram {
  return { ...createEmptyDiagram("class"), ...overrides };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("mountSvg — DOM walker", () => {
  it("creates an SVG subtree with class names, ARIA, and inline styles preserved", () => {
    // Arrange
    const host = document.createElement("div");
    document.body.appendChild(host);
    const diagram = classDiagramWith({
      nodes: [
        { id: "a", kind: "class", label: "A" },
        { id: "b", kind: "class", label: "B" },
      ],
      edges: [{ id: "e", source: "a", target: "b", kind: "association" }],
    });
    const rendered = renderDiagram(diagram);

    // Act
    const mount = mountSvg(host, rendered.root);

    // Assert
    expect(mount.root.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(mount.root.tagName.toLowerCase()).toBe("svg");
    expect(mount.root.getAttribute("class")?.includes("uml-canvas")).toBe(true);
    const groupA = host.querySelector('[data-node-id="a"]');
    expect(groupA?.getAttribute("aria-label")).toContain("A");
    expect(host.querySelector('[data-edge-id="e"]')).not.toBeNull();
  });

  it("dispose() detaches the rendered root from its host", () => {
    // Arrange
    const host = document.createElement("div");
    document.body.appendChild(host);
    const rendered = renderDiagram(classDiagramWith({}));

    // Act
    const mount = mountSvg(host, rendered.root);
    expect(host.children.length).toBe(1);
    mount.dispose();

    // Assert
    expect(host.children.length).toBe(0);
  });
});

describe("createPanZoomController — wheel + drag", () => {
  it("updates state and applies a transform on wheel zoom", () => {
    // Arrange
    const host = document.createElement("div");
    document.body.appendChild(host);
    Object.defineProperty(host, "getBoundingClientRect", {
      value: () =>
        ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }) as DOMRect,
    });
    const target = document.createElementNS("http://www.w3.org/2000/svg", "g");
    host.appendChild(target);

    const controller = createPanZoomController(host, { target });
    const onChange = vi.fn();
    controller.dispose();
    const live = createPanZoomController(host, { target, onChange });

    // Act — synthesize a wheel event
    const event = new Event("wheel") as WheelEvent;
    Object.assign(event, { deltaY: -200, clientX: 100, clientY: 100 });
    host.dispatchEvent(event);

    // Assert
    const state = live.getState();
    expect(state.scale).toBeGreaterThan(1);
    expect(target.getAttribute("transform")).toMatch(/scale\(/u);
    expect(onChange).toHaveBeenCalled();

    // Cleanup
    live.dispose();
  });

  it("clamps the scale within [minScale, maxScale]", () => {
    // Arrange
    const host = document.createElement("div");
    document.body.appendChild(host);
    const controller = createPanZoomController(host, { minScale: 0.5, maxScale: 2 });

    // Act
    controller.setState({ scale: 100 });

    // Assert
    expect(controller.getState().scale).toBe(2);

    controller.setState({ scale: 0.01 });
    expect(controller.getState().scale).toBe(0.5);

    // Cleanup
    controller.dispose();
  });

  it("dispose() removes wheel + pointer listeners (no further onChange after disposal)", () => {
    // Arrange
    const host = document.createElement("div");
    document.body.appendChild(host);
    const onChange = vi.fn();
    const controller = createPanZoomController(host, { onChange });

    // Act
    controller.dispose();
    onChange.mockClear();
    const event = new Event("wheel") as WheelEvent;
    Object.assign(event, { deltaY: -200, clientX: 0, clientY: 0 });
    host.dispatchEvent(event);

    // Assert — the disposed controller never receives the wheel event
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("attachKeyboardNavigation", () => {
  it("dispatches Tab / arrow / Delete / Enter to the matching callback", () => {
    // Arrange
    const host = document.createElement("div");
    host.tabIndex = 0;
    document.body.appendChild(host);
    const onTab = vi.fn();
    const onArrow = vi.fn();
    const onDelete = vi.fn();
    const onEnter = vi.fn();
    const onUndo = vi.fn();

    const controller = attachKeyboardNavigation(host, {
      onTab,
      onArrow,
      onDelete,
      onEnter,
      onUndo,
      step: 5,
    });

    // Act
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }));
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true }));
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true }));

    // Assert
    expect(onTab).toHaveBeenNthCalledWith(1, "forward");
    expect(onTab).toHaveBeenNthCalledWith(2, "backward");
    expect(onArrow).toHaveBeenNthCalledWith(1, "right", 5);
    expect(onArrow).toHaveBeenNthCalledWith(2, "down", 50);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onUndo).toHaveBeenCalledTimes(1);

    // Cleanup
    controller.dispose();
  });

  it("dispose() detaches the keydown handler", () => {
    // Arrange
    const host = document.createElement("div");
    document.body.appendChild(host);
    const onTab = vi.fn();
    const controller = attachKeyboardNavigation(host, { onTab });

    // Act
    controller.dispose();
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));

    // Assert
    expect(onTab).not.toHaveBeenCalled();
  });
});

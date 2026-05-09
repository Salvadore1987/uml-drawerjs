/**
 * Pointer / mouse interactions on the rendered SVG canvas.
 *
 * Adds four behaviours on top of the static renderer:
 *   1. **Click-to-select** — `pointerdown` on `[data-node-id]` sets the
 *      selection (Shift toggles); `pointerdown` on empty canvas clears it.
 *   2. **Drag-to-move** — pointer-down inside a node enters move mode.
 *      During the drag, the node's `<g transform>` is mutated directly
 *      (no AST writes, no ELK call). On `pointerup`, a single
 *      `MoveNodeCommand` is dispatched so the change is reversible.
 *   3. **Drag-to-connect** — pointer-down within `BORDER_GRAB_PX` of a
 *      node's edge enters connect mode. A ghost `<line>` follows the
 *      pointer; `pointerup` over another node dispatches an
 *      `AddEdgeCommand` with a default `EdgeKind` for the diagram type.
 *      Escape / pointerup over empty canvas cancels.
 *   4. **Inline rename** — `dblclick` on a node mounts an HTML `<input>`
 *      inside a `<foreignObject>` overlay. Enter / blur dispatches an
 *      `UpdateNodeCommand`; Escape cancels.
 *
 * All listeners are attached to the SVG root so they run BEFORE the
 * `PanZoom` controller's listeners on the host element (DOM bubbling
 * order). Node-hits call `event.stopPropagation()` to suppress PanZoom.
 *
 * Performance invariant: per-frame `pointermove` mutates DOM transforms
 * directly. AST writes happen exactly once per gesture, on `pointerup`.
 * `runAutoLayout` is never called from this module.
 */

import {
  addEdgeCommand,
  moveNodeCommand,
  resizeNodeCommand,
  updateNodeCommand,
} from "../commands/index.js";
import type { CommandBus } from "../commands/index.js";
import type { History } from "../history/index.js";
import { uuidv7 } from "../model/index.js";
import type { DiagramType, EdgeKind } from "../model/types.js";
import type { SelectionModel } from "./selection.js";
import { DEFAULT_SNAP, snapValue } from "./snap.js";
import type { SnapOptions } from "./snap.js";
import { computeResizeRect } from "./resizeGeometry.js";
import type { Rect, ResizeSide } from "./resizeGeometry.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const HTML_NS = "http://www.w3.org/1999/xhtml";
const BORDER_GRAB_PX = 8;
const DRAG_THRESHOLD_PX = 3;

export interface InteractionsOptions {
  /** SVG root produced by the renderer. */
  readonly svg: SVGElement;
  /** Inner content group carrying the pan/zoom transform. */
  readonly contentGroup: SVGGraphicsElement;
  /** History stack — pointer-released gestures dispatch through it. */
  readonly history: History;
  /** Bus — used to read current diagram state. */
  readonly bus: CommandBus;
  /** Selection model — pointer-down on a node mutates this. */
  readonly selection: SelectionModel;
  /** Override id allocation for new edges (tests inject deterministic ids). */
  readonly idFactory?: () => string;
  /**
   * Returns `true` when canvas-side editing should be suspended. Pan and
   * zoom (handled by `PanZoomController` on the host element) are NOT
   * gated by this — only selection / drag-to-move / drag-to-connect /
   * inline rename are skipped. The editor's text editor and props panel
   * remain functional.
   */
  readonly getLocked?: () => boolean;
  /**
   * Snap-to-grid options for both move-drag and resize-drag. Defaults to
   * the renderer's `DEFAULT_SNAP` (24 px step, enabled). The `Alt` key
   * temporarily disables snap during a gesture for fine adjustment.
   */
  readonly getSnap?: () => SnapOptions;
}

export interface InteractionsController {
  /** Re-attach listeners to a freshly-mounted SVG (after `rerenderSvg`). */
  rebind(svg: SVGElement, contentGroup: SVGGraphicsElement): void;
  dispose(): void;
}

interface MovingNode {
  readonly id: string;
  readonly original: { readonly x: number; readonly y: number };
}

interface DragState {
  readonly mode: "select" | "move" | "connect" | "marquee" | "resize";
  /** Primary node id for the gesture (irrelevant in marquee mode). */
  readonly nodeId: string;
  readonly pointerId: number;
  readonly startClient: { readonly x: number; readonly y: number };
  readonly startLayout: { readonly x: number; readonly y: number };
  /**
   * For move mode: every node that should be translated during the drag
   * (single-node click → 1 entry; group drag → N entries). Captured at
   * pointerdown so per-frame DOM mutation is cheap.
   */
  readonly movingNodes: readonly MovingNode[];
  /** True once the pointer has moved beyond `DRAG_THRESHOLD_PX`. */
  hasMoved: boolean;
  /** Live ghost line for connect mode. */
  ghostLine: SVGLineElement | null;
  /** Live SVG rect for marquee mode. */
  marqueeRect: SVGRectElement | null;
  /** Resize-only: which handle was grabbed. */
  readonly resizeSide: ResizeSide | null;
  /** Resize-only: original node rectangle in layout coords at pointerdown. */
  readonly resizeOriginalRect: Rect | null;
  /** Resize-only: most recent ephemeral rect; used for the dispatch on up. */
  resizeLastRect: Rect | null;
}

export function attachInteractions(initial: InteractionsOptions): InteractionsController {
  let svg = initial.svg;
  let contentGroup = initial.contentGroup;
  const { history, bus, selection } = initial;
  const idFactory = initial.idFactory ?? uuidv7;
  const isLocked = (): boolean => initial.getLocked?.() === true;
  const getSnap = (): SnapOptions => initial.getSnap?.() ?? DEFAULT_SNAP;

  let drag: DragState | null = null;
  let renameOverlay: { foreignObject: SVGForeignObjectElement; input: HTMLInputElement } | null =
    null;

  // Subscribe to selection so the SVG reflects the current ids.
  let unsubscribeSelection: (() => void) | null = selection.subscribe((ids) => {
    paintSelection(contentGroup, ids);
  });
  // Initial paint in case there is already a selection at attach-time.
  paintSelection(contentGroup, selection.get());

  function clientToLayout(clientX: number, clientY: number): { x: number; y: number } {
    const svgEl = svg as SVGSVGElement;
    const ctm = contentGroup.getScreenCTM?.();
    if (ctm && typeof svgEl.createSVGPoint === "function") {
      const point = svgEl.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      if (typeof point.matrixTransform === "function") {
        const transformed = point.matrixTransform(ctm.inverse());
        return { x: transformed.x, y: transformed.y };
      }
    }
    // Fallback for non-DOM test environments (happy-dom): translate by
    // the SVG bounding rect so coordinates are at least relative to the
    // host. Real browsers use the full SVG matrix path above.
    const rect = svgEl.getBoundingClientRect?.();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }

  function findNodeAt(target: EventTarget | null): SVGGraphicsElement | null {
    if (!(target instanceof Element)) return null;
    const node = target.closest("[data-node-id]");
    return (node as SVGGraphicsElement) ?? null;
  }

  function nodeRectInLayout(group: SVGGraphicsElement): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const rect = group.querySelector("rect, path");
    if (rect instanceof SVGRectElement) {
      const transform = group.getAttribute("transform") ?? "";
      const match = transform.match(/translate\(\s*(-?[\d.]+)[ ,]\s*(-?[\d.]+)\s*\)/);
      const tx = match ? Number(match[1]) : 0;
      const ty = match ? Number(match[2]) : 0;
      return {
        x: tx + Number(rect.getAttribute("x") ?? 0),
        y: ty + Number(rect.getAttribute("y") ?? 0),
        width: Number(rect.getAttribute("width") ?? 0),
        height: Number(rect.getAttribute("height") ?? 0),
      };
    }
    // Fallback: bbox in screen coords mapped back to layout. Less ideal
    // because pan/zoom blur the result, but only used for non-rect frames.
    const bbox = group.getBBox();
    const transform = group.getAttribute("transform") ?? "";
    const match = transform.match(/translate\(\s*(-?[\d.]+)[ ,]\s*(-?[\d.]+)\s*\)/);
    const tx = match ? Number(match[1]) : 0;
    const ty = match ? Number(match[2]) : 0;
    return { x: tx + bbox.x, y: ty + bbox.y, width: bbox.width, height: bbox.height };
  }

  /**
   * Apply an ephemeral resize to a node's DOM (transform + frame width
   * /height + handle positions) without dispatching a command. Edges
   * are not updated here — they snap into place on the full re-render
   * triggered by the `ResizeNodeCommand` dispatch on pointerup.
   *
   * The function rewrites the same attributes that the renderer would
   * have produced, so the visual matches what `renderDiagram` outputs
   * once the command lands.
   */
  function applyEphemeralRect(
    contentGroupEl: SVGGraphicsElement,
    nodeId: string,
    next: Rect,
  ): void {
    const escaped = nodeId.replaceAll('"', '\\"');
    const node = contentGroupEl.querySelector(`[data-node-id="${escaped}"]`);
    if (!(node instanceof SVGGraphicsElement)) return;
    node.setAttribute("transform", `translate(${next.x}, ${next.y})`);

    // Resize the primary frame element. Different node kinds use either
    // a top-level <rect> or a <path>; for paths we rebuild the database
    // cylinder geometry on the fly. The frame is always either the
    // first <rect>/<path>/<g[data-uml-frame]> child of the node group.
    const frame = node.querySelector(":scope > rect, :scope > g[data-uml-frame]");
    if (frame instanceof SVGRectElement) {
      frame.setAttribute("width", String(next.width));
      frame.setAttribute("height", String(next.height));
    } else if (frame && frame instanceof SVGGElement) {
      const innerRect = frame.querySelector("rect");
      if (innerRect) {
        innerRect.setAttribute("width", String(next.width));
        innerRect.setAttribute("height", String(next.height));
      }
    }

    // Reposition the eight resize handles + four port handles.
    const handles = node.querySelectorAll<SVGRectElement>("[data-resize-handle]");
    handles.forEach((handle) => {
      const side = handle.getAttribute("data-resize-handle");
      const pos = handlePosition(side, next.width, next.height);
      if (!pos) return;
      handle.setAttribute("x", String(pos.x - 4));
      handle.setAttribute("y", String(pos.y - 4));
    });
    const ports = node.querySelectorAll<SVGCircleElement>("[data-port-handle]");
    ports.forEach((port) => {
      const side = port.getAttribute("data-port-handle");
      const pos = portPosition(side, next.width, next.height);
      if (!pos) return;
      port.setAttribute("cx", String(pos.x));
      port.setAttribute("cy", String(pos.y));
    });
  }

  function handlePosition(
    side: string | null,
    w: number,
    h: number,
  ): { x: number; y: number } | null {
    switch (side) {
      case "nw":
        return { x: 0, y: 0 };
      case "n":
        return { x: w / 2, y: 0 };
      case "ne":
        return { x: w, y: 0 };
      case "e":
        return { x: w, y: h / 2 };
      case "se":
        return { x: w, y: h };
      case "s":
        return { x: w / 2, y: h };
      case "sw":
        return { x: 0, y: h };
      case "w":
        return { x: 0, y: h / 2 };
      default:
        return null;
    }
  }

  function portPosition(
    side: string | null,
    w: number,
    h: number,
  ): { x: number; y: number } | null {
    switch (side) {
      case "n":
        return { x: w / 2, y: 0 };
      case "e":
        return { x: w, y: h / 2 };
      case "s":
        return { x: w / 2, y: h };
      case "w":
        return { x: 0, y: h / 2 };
      default:
        return null;
    }
  }

  function intersects(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ): boolean {
    return (
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
    );
  }

  function distanceToBorder(
    rect: { x: number; y: number; width: number; height: number },
    point: { x: number; y: number },
  ): number {
    const dxLeft = Math.abs(point.x - rect.x);
    const dxRight = Math.abs(point.x - (rect.x + rect.width));
    const dyTop = Math.abs(point.y - rect.y);
    const dyBottom = Math.abs(point.y - (rect.y + rect.height));
    const insideX = point.x >= rect.x && point.x <= rect.x + rect.width;
    const insideY = point.y >= rect.y && point.y <= rect.y + rect.height;
    if (insideX && insideY) {
      return Math.min(dxLeft, dxRight, dyTop, dyBottom);
    }
    return Number.POSITIVE_INFINITY;
  }

  function defaultEdgeKindFor(type: DiagramType): EdgeKind {
    switch (type) {
      case "c4-context":
      case "c4-container":
      case "c4-component":
        return "uses";
      case "class":
        return "association";
      case "er":
        return "one-to-many";
      case "sequence":
        return "sync-call";
    }
  }

  function startGhostLine(start: { x: number; y: number }): SVGLineElement {
    const line = svg.ownerDocument!.createElementNS(SVG_NS, "line");
    line.setAttribute("class", "uml-edge-ghost");
    line.setAttribute("x1", String(start.x));
    line.setAttribute("y1", String(start.y));
    line.setAttribute("x2", String(start.x));
    line.setAttribute("y2", String(start.y));
    line.setAttribute("stroke", "var(--uml-edge-stroke)");
    line.setAttribute("stroke-width", "1.5");
    line.setAttribute("stroke-dasharray", "4 4");
    line.setAttribute("pointer-events", "none");
    contentGroup.appendChild(line);
    return line;
  }

  function endRename(commit: boolean): void {
    if (!renameOverlay) return;
    const { foreignObject, input } = renameOverlay;
    const nodeId = foreignObject.dataset["nodeId"];
    if (commit && nodeId) {
      const newLabel = input.value.trim();
      const diagram = bus.getState();
      const node = diagram.nodes.find((n) => n.id === nodeId);
      if (node && newLabel.length > 0 && newLabel !== node.label) {
        history.dispatch(updateNodeCommand(nodeId, { label: newLabel }, diagram));
      }
    }
    foreignObject.remove();
    renameOverlay = null;
  }

  function beginRename(group: SVGGraphicsElement): void {
    endRename(false);
    const id = group.getAttribute("data-node-id");
    if (!id) return;
    const diagram = bus.getState();
    const node = diagram.nodes.find((n) => n.id === id);
    if (!node) return;

    const rect = nodeRectInLayout(group);
    const fo = svg.ownerDocument!.createElementNS(SVG_NS, "foreignObject");
    fo.setAttribute("x", String(rect.x + 4));
    fo.setAttribute("y", String(rect.y + 4));
    fo.setAttribute("width", String(Math.max(rect.width - 8, 80)));
    fo.setAttribute("height", "32");
    fo.dataset["nodeId"] = id;

    const input = svg.ownerDocument!.createElementNS(HTML_NS, "input") as HTMLInputElement;
    input.setAttribute("type", "text");
    input.value = node.label;
    input.setAttribute(
      "style",
      [
        "width: 100%",
        "box-sizing: border-box",
        "font: inherit",
        "font-family: var(--uml-font-sans)",
        "font-size: var(--uml-font-size-base)",
        "color: var(--uml-text)",
        "background: var(--uml-bg-elevated)",
        "border: 1px solid var(--uml-accent)",
        "border-radius: 4px",
        "padding: 2px 6px",
        "outline: none",
      ].join(";"),
    );
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        endRename(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        endRename(false);
      }
      // Stop bubble so `attachKeyboardNavigation` doesn't see Enter/Esc.
      event.stopPropagation();
    });
    input.addEventListener("blur", () => {
      endRename(true);
    });
    fo.appendChild(input);
    contentGroup.appendChild(fo);
    renameOverlay = { foreignObject: fo, input };
    queueMicrotask(() => {
      input.focus();
      input.select();
    });
  }

  function onPointerDown(event: PointerEvent): void {
    if (renameOverlay) return; // let the input keep focus
    if (isLocked()) return; // edits suspended; pan/zoom on host still work
    // Ignore clicks on overlay UI (toolbar, HUD buttons, etc.).
    if (event.target instanceof Element) {
      if (event.target.closest("[data-no-pan]") !== null) return;
      if (event.target.closest("button, input, select, textarea, [role='button']") !== null) return;
    }
    const group = findNodeAt(event.target);

    // Empty canvas: shift+drag starts marquee selection; plain click
    // clears selection and lets PanZoom take over for pan.
    if (!group) {
      if (event.shiftKey) {
        startMarquee(event);
        return;
      }
      selection.clear();
      return;
    }

    const nodeId = group.getAttribute("data-node-id");
    if (!nodeId) return;

    const diagram = bus.getState();
    const node = diagram.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const startLayout = clientToLayout(event.clientX, event.clientY);
    const rect = nodeRectInLayout(group);
    const overrides = diagram.metadata.layoutOverrides ?? {};

    // Resize mode wins over everything else: a click that landed inside
    // a `[data-resize-handle]` rect should never be confused with a
    // connect or a move, even if the handle happens to lie within
    // `BORDER_GRAB_PX` of the frame edge.
    const handleEl =
      event.target instanceof Element ? event.target.closest("[data-resize-handle]") : null;
    if (handleEl) {
      // Selection: a resize gesture should leave the node selected (so
      // the handles stay visible while dragging). Force single-select on
      // the resized node.
      selection.set([nodeId]);
      const side = handleEl.getAttribute("data-resize-handle") as ResizeSide | null;
      if (side) {
        drag = {
          mode: "resize",
          nodeId,
          pointerId: event.pointerId,
          startClient: { x: event.clientX, y: event.clientY },
          startLayout,
          movingNodes: [],
          hasMoved: false,
          ghostLine: null,
          marqueeRect: null,
          resizeSide: side,
          resizeOriginalRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          resizeLastRect: null,
        };
        svg.setPointerCapture?.(event.pointerId);
        event.stopPropagation();
        return;
      }
    }

    const distance = distanceToBorder(rect, startLayout);
    // Connect mode triggers when:
    //   * The pointer landed on an explicit `[data-port-handle]` circle
    //     (the visible affordance shown on hover / selection), OR
    //   * The pointer landed within `BORDER_GRAB_PX` of a node's edge.
    const isPortHandle =
      event.target instanceof Element && event.target.closest("[data-port-handle]") !== null;
    const onBorder = isPortHandle || distance <= BORDER_GRAB_PX;

    // Selection update:
    //   * Shift+click → toggle (additive multi-select).
    //   * Click on already-selected node when 2+ are selected → keep
    //     selection (group drag).
    //   * Otherwise → replace selection with this node.
    const wasInSelection = selection.has(nodeId);
    const groupSelected = wasInSelection && selection.get().size > 1;
    if (event.shiftKey) {
      selection.toggle(nodeId);
    } else if (!groupSelected) {
      selection.set([nodeId]);
    }

    const mode = onBorder ? "connect" : "move";

    // For group-move, capture every selected node's original coord so
    // pointermove can translate them in lock-step. For single move /
    // connect, just the primary node.
    const moveSet = mode === "move" && groupSelected ? [...selection.get()] : [nodeId];
    const movingNodes: MovingNode[] = moveSet.map((id) => {
      const coord = overrides[id] ?? { x: 0, y: 0 };
      return { id, original: { x: coord.x, y: coord.y } };
    });

    drag = {
      mode,
      nodeId,
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startLayout,
      movingNodes,
      hasMoved: false,
      ghostLine: null,
      marqueeRect: null,
      resizeSide: null,
      resizeOriginalRect: null,
      resizeLastRect: null,
    };

    svg.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
  }

  function startMarquee(event: PointerEvent): void {
    const startLayout = clientToLayout(event.clientX, event.clientY);
    const rect = svg.ownerDocument!.createElementNS(SVG_NS, "rect");
    rect.setAttribute("class", "uml-marquee");
    rect.setAttribute("x", String(startLayout.x));
    rect.setAttribute("y", String(startLayout.y));
    rect.setAttribute("width", "0");
    rect.setAttribute("height", "0");
    rect.setAttribute("fill", "var(--uml-selection-fill)");
    rect.setAttribute("stroke", "var(--uml-selection-stroke)");
    rect.setAttribute("stroke-width", "1");
    rect.setAttribute("stroke-dasharray", "4 4");
    rect.setAttribute("pointer-events", "none");
    contentGroup.appendChild(rect);
    drag = {
      mode: "marquee",
      nodeId: "",
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startLayout,
      movingNodes: [],
      hasMoved: false,
      ghostLine: null,
      marqueeRect: rect,
      resizeSide: null,
      resizeOriginalRect: null,
      resizeLastRect: null,
    };
    const host = svg.parentElement;
    host?.setAttribute("data-marquee-active", "true");
    svg.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
  }

  function onPointerMove(event: PointerEvent): void {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startClient.x;
    const dy = event.clientY - drag.startClient.y;
    if (!drag.hasMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    drag.hasMoved = true;

    if (drag.mode === "connect") {
      if (!drag.ghostLine) {
        drag.ghostLine = startGhostLine(drag.startLayout);
      }
      const cursor = clientToLayout(event.clientX, event.clientY);
      drag.ghostLine.setAttribute("x2", String(cursor.x));
      drag.ghostLine.setAttribute("y2", String(cursor.y));
      return;
    }

    if (drag.mode === "move") {
      const cursor = clientToLayout(event.clientX, event.clientY);
      const rawDx = cursor.x - drag.startLayout.x;
      const rawDy = cursor.y - drag.startLayout.y;
      // Snap the delta — not the absolute coord — so a node that
      // started off-grid still moves by integer multiples of the step
      // and won't twitch on the first frame. Alt holds free-form mode
      // for fine adjustment, mirroring Figma / draw.io.
      const snap = getSnap();
      const useSnap = snap.enabled && !event.altKey;
      const ddx = useSnap ? snapValue(rawDx, snap) : rawDx;
      const ddy = useSnap ? snapValue(rawDy, snap) : rawDy;
      for (const moving of drag.movingNodes) {
        const node = contentGroup.querySelector(`[data-node-id="${moving.id}"]`);
        if (node instanceof SVGGraphicsElement) {
          node.setAttribute(
            "transform",
            `translate(${moving.original.x + ddx}, ${moving.original.y + ddy})`,
          );
        }
      }
      return;
    }

    if (drag.mode === "resize" && drag.resizeOriginalRect && drag.resizeSide) {
      const cursor = clientToLayout(event.clientX, event.clientY);
      const rawDx = cursor.x - drag.startLayout.x;
      const rawDy = cursor.y - drag.startLayout.y;
      const snap = getSnap();
      const useSnap = snap.enabled && !event.altKey;
      const ddx = useSnap ? snapValue(rawDx, snap) : rawDx;
      const ddy = useSnap ? snapValue(rawDy, snap) : rawDy;
      const next = computeResizeRect(drag.resizeOriginalRect, drag.resizeSide, ddx, ddy);
      drag.resizeLastRect = next;
      applyEphemeralRect(contentGroup, drag.nodeId, next);
      return;
    }

    if (drag.mode === "marquee" && drag.marqueeRect) {
      const cursor = clientToLayout(event.clientX, event.clientY);
      const x = Math.min(drag.startLayout.x, cursor.x);
      const y = Math.min(drag.startLayout.y, cursor.y);
      const w = Math.abs(cursor.x - drag.startLayout.x);
      const h = Math.abs(cursor.y - drag.startLayout.y);
      drag.marqueeRect.setAttribute("x", String(x));
      drag.marqueeRect.setAttribute("y", String(y));
      drag.marqueeRect.setAttribute("width", String(w));
      drag.marqueeRect.setAttribute("height", String(h));
    }
  }

  function onPointerUp(event: PointerEvent): void {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const finished = drag;
    drag = null;
    svg.releasePointerCapture?.(event.pointerId);
    const host = svg.parentElement;
    host?.removeAttribute("data-marquee-active");

    if (finished.mode === "marquee") {
      const cursor = clientToLayout(event.clientX, event.clientY);
      const marqueeRect = {
        x: Math.min(finished.startLayout.x, cursor.x),
        y: Math.min(finished.startLayout.y, cursor.y),
        width: Math.abs(cursor.x - finished.startLayout.x),
        height: Math.abs(cursor.y - finished.startLayout.y),
      };
      finished.marqueeRect?.remove();
      // Hit-test every node group in DOM order against the marquee rect.
      const matched: string[] = [];
      const nodeGroups = contentGroup.querySelectorAll("[data-node-id]");
      nodeGroups.forEach((groupEl) => {
        if (!(groupEl instanceof SVGGraphicsElement)) return;
        const id = groupEl.getAttribute("data-node-id");
        if (!id) return;
        const r = nodeRectInLayout(groupEl);
        if (intersects(r, marqueeRect)) matched.push(id);
      });
      selection.set(matched);
      return;
    }

    if (!finished.hasMoved) return; // pure click — selection already updated.

    if (finished.mode === "move") {
      const cursor = clientToLayout(event.clientX, event.clientY);
      const rawDx = cursor.x - finished.startLayout.x;
      const rawDy = cursor.y - finished.startLayout.y;
      const snap = getSnap();
      const useSnap = snap.enabled && !event.altKey;
      const ddx = useSnap ? snapValue(rawDx, snap) : rawDx;
      const ddy = useSnap ? snapValue(rawDy, snap) : rawDy;
      // One MoveNodeCommand per moving node, batched into a single
      // history frame so Cmd+Z reverts the whole gesture.
      const diagram = bus.getState();
      const moves = finished.movingNodes.map((m) =>
        moveNodeCommand(m.id, { x: m.original.x + ddx, y: m.original.y + ddy }, diagram),
      );
      if (moves.length === 1) {
        history.dispatch(moves[0]!);
      } else if (moves.length > 1) {
        history.dispatchAll(moves);
      }
      return;
    }

    if (finished.mode === "resize" && finished.resizeOriginalRect) {
      // The last ephemeral rect already reflects snap (or its absence
      // when Alt was held). If the pointer moved but no `resizeLastRect`
      // landed, fall back to the original — defensive only; pointermove
      // always sets it once `hasMoved` is true.
      const finalRect = finished.resizeLastRect ?? finished.resizeOriginalRect;
      const diagram = bus.getState();
      history.dispatch(resizeNodeCommand(finished.nodeId, finalRect, diagram));
      return;
    }

    if (finished.mode === "connect") {
      finished.ghostLine?.remove();
      const dropTarget = svg.ownerDocument!.elementFromPoint(event.clientX, event.clientY);
      const targetGroup = findNodeAt(dropTarget);
      const targetId = targetGroup?.getAttribute("data-node-id") ?? null;
      if (targetId && targetId !== finished.nodeId) {
        const diagram = bus.getState();
        history.dispatch(
          addEdgeCommand({
            id: idFactory(),
            source: finished.nodeId,
            target: targetId,
            kind: defaultEdgeKindFor(diagram.type),
          }),
        );
      }
    }
  }

  function onDoubleClick(event: MouseEvent): void {
    if (isLocked()) return;
    const group = findNodeAt(event.target);
    if (!group) return;
    event.stopPropagation();
    event.preventDefault();
    beginRename(group);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape" && renameOverlay) {
      endRename(false);
    }
  }

  function bind(): void {
    svg.addEventListener("pointerdown", onPointerDown as EventListener);
    svg.addEventListener("pointermove", onPointerMove as EventListener);
    svg.addEventListener("pointerup", onPointerUp as EventListener);
    svg.addEventListener("pointercancel", onPointerUp as EventListener);
    svg.addEventListener("dblclick", onDoubleClick as EventListener);
    svg.ownerDocument?.addEventListener("keydown", onKeyDown);
  }

  function unbind(target: SVGElement = svg): void {
    target.removeEventListener("pointerdown", onPointerDown as EventListener);
    target.removeEventListener("pointermove", onPointerMove as EventListener);
    target.removeEventListener("pointerup", onPointerUp as EventListener);
    target.removeEventListener("pointercancel", onPointerUp as EventListener);
    target.removeEventListener("dblclick", onDoubleClick as EventListener);
    target.ownerDocument?.removeEventListener("keydown", onKeyDown);
  }

  bind();

  return {
    rebind(nextSvg: SVGElement, nextContentGroup: SVGGraphicsElement): void {
      unbind(svg);
      svg = nextSvg;
      contentGroup = nextContentGroup;
      bind();
      paintSelection(contentGroup, selection.get());
    },
    dispose(): void {
      endRename(false);
      unbind();
      unsubscribeSelection?.();
      unsubscribeSelection = null;
    },
  };
}

function paintSelection(contentGroup: SVGGraphicsElement, ids: ReadonlySet<string>): void {
  const previouslySelected = contentGroup.querySelectorAll('[data-selected="true"]');
  previouslySelected.forEach((el) => el.removeAttribute("data-selected"));
  for (const id of ids) {
    const escaped = id.replaceAll('"', '\\"');
    const node = contentGroup.querySelector(`[data-node-id="${escaped}"]`);
    if (node) node.setAttribute("data-selected", "true");
  }
  // Mark the cardinality of the selection on the content group so
  // `.uml-node-resize-handle` CSS can show handles only for single-select
  // (group-resize is intentionally not offered).
  if (ids.size === 1) {
    contentGroup.setAttribute("data-selected-count", "single");
  } else if (ids.size === 0) {
    contentGroup.removeAttribute("data-selected-count");
  } else {
    contentGroup.setAttribute("data-selected-count", "multiple");
  }
}

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
  addNodeToGroupCommand,
  moveActivationToLifelineCommand,
  moveEdgeCommand,
  moveEdgeLabelCommand,
  moveGroupCommand,
  moveNodeCommand,
  moveSequenceFragmentCommand,
  removeNodeFromGroupCommand,
  resizeActivationCommand,
  resizeGroupCommand,
  resizeNodeCommand,
  resizeSequenceFragmentCommand,
  updateActivationCommand,
  updateEdgeCommand,
  updateNodeCommand,
} from "../commands/index.js";
import type { ActivationResizeSide, FragmentResizeSide } from "../commands/index.js";
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
   * the renderer's `DEFAULT_SNAP` (12 px step, enabled). The `Alt` key
   * temporarily disables snap during a gesture for fine adjustment.
   */
  readonly getSnap?: () => SnapOptions;
  /**
   * Optional override for the edge kind used when the user drag-to-
   * connects two nodes. When the function returns a value, it replaces
   * the per-diagram-type default in `defaultEdgeKindFor`. Used by the
   * sequence-diagram playground toolbar so the user can pick `return` /
   * `async-call` / `lost-message` / etc. before drawing.
   */
  readonly getEdgeKindOverride?: () => EdgeKind | undefined;
}

export interface InteractionsController {
  /** Re-attach listeners to a freshly-mounted SVG (after `rerenderSvg`). */
  rebind(svg: SVGElement, contentGroup: SVGGraphicsElement): void;
  dispose(): void;
}

interface MovingNode {
  readonly id: string;
  readonly original: { readonly x: number; readonly y: number };
  /** Captured at pointerdown so we can hit-test the node's centre
   *  against every boundary box without re-querying the DOM. */
  readonly originalRect?: Rect;
}

interface DragState {
  readonly mode: "select" | "move" | "connect" | "marquee" | "resize";
  /** Primary id for the gesture — node id when `targetKind === "node"`,
   * group id when `targetKind === "group"`. Empty in marquee mode. */
  readonly nodeId: string;
  /** Whether the gesture targets a regular node or a boundary group. */
  readonly targetKind: "node" | "group";
  readonly pointerId: number;
  readonly startClient: { readonly x: number; readonly y: number };
  readonly startLayout: { readonly x: number; readonly y: number };
  /**
   * For move mode: every node that should be translated during the drag
   * (single-node click → 1 entry; group drag → N entries; boundary
   * drag → its children, captured here so the same loop translates them
   * alongside the boundary frame). Captured at pointerdown so per-frame
   * DOM mutation is cheap.
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
  /** Resize-only: original rectangle in layout coords at pointerdown.
   *  Holds the boundary rect when `targetKind === "group"`. */
  readonly resizeOriginalRect: Rect | null;
  /** Resize-only: most recent ephemeral rect; used for the dispatch on up. */
  resizeLastRect: Rect | null;
  /** Move-only on groups: original boundary rect so we can rewrite the
   *  rect attributes on every pointermove without re-querying the DOM. */
  readonly groupOriginalRect: Rect | null;
  /**
   * Boundary boxes captured at pointerdown (move-mode only, target=node).
   * Used by drag-into-boundary hit-testing so the target highlight + the
   * pointerup membership-change commands work without re-reading the
   * DOM on every frame.
   */
  readonly boundaryBoxes: ReadonlyArray<{ groupId: string; rect: Rect }>;
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
  let edgeReorder: {
    edgeId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    /** Self-call edges (source === target) support both vertical
     *  reorder and horizontal lifeline reassignment; non-self-call
     *  edges are vertical-only. Captured at gesture start so the
     *  direction decision is stable through the drag. */
    isSelfCall: boolean;
    /** Layout-space lifeline cx values, sorted L→R, captured at
     *  gesture start. Used by the horizontal branch to snap the
     *  reassigned self-call to the nearest column. */
    lifelineColumns: ReadonlyArray<{ id: string; cx: number }>;
    /** Direction is decided lazily on the first move that exceeds
     *  `DRAG_THRESHOLD_PX`; once set, it sticks for the rest of the
     *  gesture so the guide doesn't flip mid-drag. */
    direction: "vertical" | "horizontal" | null;
  } | null = null;
  let edgeReorderHorizontalGuide: SVGLineElement | null = null;
  let fragmentReorder: {
    fragmentId: string;
    pointerId: number;
    startClientY: number;
    hasMoved: boolean;
  } | null = null;
  let fragmentResize: {
    fragmentId: string;
    side: "n" | "s" | "e" | "w";
    pointerId: number;
    startClientX: number;
    startClientY: number;
    /** Pointerdown position in *layout* coordinates. Necessary because
     *  `event.clientY` lives in screen space; at any zoom ≠ 1 the
     *  client-space dy does not equal the layout-space dy, so the
     *  grid-cell snap math (in layout px) wouldn't match the visible
     *  grid. */
    startLayoutX: number;
    startLayoutY: number;
    /** For E / W resize: lifeline cx positions captured at gesture start
     *  so the snap-to-nearest-column logic stays stable through the
     *  drag even if the diagram auto-fits underneath. */
    lifelineColumns: ReadonlyArray<{ id: string; cx: number }>;
    /** Layout-space anchor: the cx of the lifeline column that is
     *  currently flush with the dragged edge. Used to derive
     *  `deltaColumns` on pointerup. */
    anchorColumnIndex: number;
    hasMoved: boolean;
  } | null = null;
  let fragmentResizeGuide: SVGLineElement | null = null;
  let activationResize: {
    activationId: string;
    side: "n" | "s";
    pointerId: number;
    startClientY: number;
    startLayoutY: number;
    hasMoved: boolean;
  } | null = null;
  let activationResizeGuide: SVGLineElement | null = null;
  let activationMove: {
    activationId: string;
    nodeId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startLayoutY: number;
    hasMoved: boolean;
    /** Locked on the first move past `DRAG_THRESHOLD_PX`. Vertical
     *  drags retain the bar on its lifeline and translate `topPx` /
     *  `*ExtraPx`; horizontal drags reassign the bar to the nearest
     *  lifeline column at pointerup. */
    direction: "vertical" | "horizontal" | null;
    /** Layout-space cx values of every lifeline, sorted L→R. Captured
     *  at gesture start so the snap math is stable through the drag. */
    lifelineColumns: ReadonlyArray<{ id: string; cx: number }>;
  } | null = null;
  let activationMoveHorizontalGuide: SVGLineElement | null = null;
  /**
   * Edge label drag (any non-sequence diagram type). Pointerdown on a
   * `<g.uml-edge-label>` captures the current offset + the segment's
   * auto midpoint; pointermove translates the label directly; pointerup
   * snaps the absolute label position to the grid, derives a new offset
   * relative to the auto midpoint and dispatches `moveEdgeLabelCommand`.
   */
  let edgeLabelDrag: {
    edgeId: string;
    pointerId: number;
    startClient: { x: number; y: number };
    startLayout: { x: number; y: number };
    labelGroup: SVGGraphicsElement;
    startOffset: { x: number; y: number };
    autoMid: { x: number; y: number };
    hasMoved: boolean;
  } | null = null;

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

  function findGroupAt(target: EventTarget | null): SVGGraphicsElement | null {
    if (!(target instanceof Element)) return null;
    const group = target.closest("[data-group-id]");
    return (group as SVGGraphicsElement) ?? null;
  }

  /**
   * Sequence-only ornament hit-test. Combined fragments, notes, and
   * dividers carry `data-fragment-id` / `data-note-id` / `data-divider-id`
   * but no `data-node-id`, so they are invisible to `findNodeAt`. This
   * helper finds the innermost matching element so a click selects the
   * ornament. Hit-test ordering — note → fragment → divider — mirrors
   * visual nesting (notes sit inside fragments; fragments are the
   * largest ornaments; dividers span the full width and lose to anything
   * overlapping).
   */
  function findOrnamentAt(
    target: EventTarget | null,
  ): { id: string; kind: "note" | "fragment" | "divider" } | null {
    if (!(target instanceof Element)) return null;
    const noteEl = target.closest("[data-note-id]");
    if (noteEl) {
      const id = noteEl.getAttribute("data-note-id");
      if (id) return { id, kind: "note" };
    }
    const fragmentEl = target.closest("[data-fragment-id]");
    if (fragmentEl) {
      const id = fragmentEl.getAttribute("data-fragment-id");
      if (id) return { id, kind: "fragment" };
    }
    const dividerEl = target.closest("[data-divider-id]");
    if (dividerEl) {
      const id = dividerEl.getAttribute("data-divider-id");
      if (id) return { id, kind: "divider" };
    }
    return null;
  }

  // ---------- Sequence drag-to-reorder ----------

  // Mirror of the sequence renderer's row height (`renderer/sequence.ts`).
  // The drag converts pointer dy into row units to snap insertion to
  // the same grid the renderer paints messages on.
  const SEQUENCE_ROW_HEIGHT = 32;
  let edgeReorderGuide: SVGLineElement | null = null;

  function startEdgeReorder(event: PointerEvent, edgeId: string): void {
    const diagram = bus.getState();
    const edge = diagram.edges.find((e) => e.id === edgeId);
    const isSelfCall = !!edge && edge.source === edge.target;
    edgeReorder = {
      edgeId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      isSelfCall,
      lifelineColumns: isSelfCall ? readLifelineColumnsFromDOM() : [],
      direction: null,
    };
    selection.set([edgeId]);
    svg.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
  }

  function rowsMoved(event: PointerEvent): number {
    if (!edgeReorder) return 0;
    const dy = event.clientY - edgeReorder.startClientY;
    return Math.round(dy / SEQUENCE_ROW_HEIGHT);
  }

  function paintEdgeReorderGuide(event: PointerEvent): void {
    if (!edgeReorder) return;

    // Horizontal mode (self-call lifeline reassignment): paint a
    // vertical dashed guide at the nearest lifeline cx. Skip the
    // vertical-reorder logic below.
    if (edgeReorder.direction === "horizontal" && edgeReorder.isSelfCall) {
      if (edgeReorder.lifelineColumns.length === 0) return;
      const cursor = clientToLayout(event.clientX, event.clientY);
      const targetIdx = nearestColumnIndex(edgeReorder.lifelineColumns, cursor.x);
      const targetCol = edgeReorder.lifelineColumns[targetIdx];
      if (!targetCol) return;
      if (!edgeReorderHorizontalGuide) {
        edgeReorderHorizontalGuide = svg.ownerDocument!.createElementNS(SVG_NS, "line");
        edgeReorderHorizontalGuide.setAttribute("class", "uml-edge-reorder-guide");
        edgeReorderHorizontalGuide.setAttribute("stroke", "var(--uml-accent)");
        edgeReorderHorizontalGuide.setAttribute("stroke-width", "2");
        edgeReorderHorizontalGuide.setAttribute("stroke-dasharray", "4 4");
        edgeReorderHorizontalGuide.setAttribute("pointer-events", "none");
        contentGroup.appendChild(edgeReorderHorizontalGuide);
      }
      const bbox = contentGroup.getBBox();
      edgeReorderHorizontalGuide.setAttribute("x1", String(targetCol.cx));
      edgeReorderHorizontalGuide.setAttribute("y1", String(bbox.y));
      edgeReorderHorizontalGuide.setAttribute("x2", String(targetCol.cx));
      edgeReorderHorizontalGuide.setAttribute("y2", String(bbox.y + bbox.height));
      return;
    }

    const diagram = bus.getState();
    const fromIndex = diagram.edges.findIndex((e) => e.id === edgeReorder!.edgeId);
    if (fromIndex < 0) return;
    const moved = rowsMoved(event);
    if (moved === 0) {
      edgeReorderGuide?.remove();
      edgeReorderGuide = null;
      return;
    }
    const target = Math.max(0, Math.min(fromIndex + moved, diagram.edges.length - 1));
    const escaped = diagram.edges[target]!.id.replaceAll('"', '\\"');
    // Regular messages render as `<line>`, self-calls as `<path>`. We
    // tolerate either so the drop-target guide also renders when the
    // dragged or target edge is a loopback. `y1` for the line; bbox-y
    // for the path (the self-call path starts at the message row).
    const targetGroup = contentGroup.querySelector(`[data-edge-id="${escaped}"]`);
    if (!(targetGroup instanceof SVGGraphicsElement)) return;
    const lineEl = targetGroup.querySelector(":scope > line");
    const pathEl = targetGroup.querySelector(":scope > path");
    let y: number;
    if (lineEl instanceof SVGLineElement) {
      y = Number(lineEl.getAttribute("y1") ?? 0);
    } else if (pathEl instanceof SVGPathElement) {
      try {
        y = pathEl.getBBox().y;
      } catch {
        return;
      }
    } else {
      return;
    }
    if (!edgeReorderGuide) {
      edgeReorderGuide = svg.ownerDocument!.createElementNS(SVG_NS, "line");
      edgeReorderGuide.setAttribute("class", "uml-edge-reorder-guide");
      edgeReorderGuide.setAttribute("stroke", "var(--uml-accent)");
      edgeReorderGuide.setAttribute("stroke-width", "2");
      edgeReorderGuide.setAttribute("stroke-dasharray", "4 4");
      edgeReorderGuide.setAttribute("pointer-events", "none");
      contentGroup.appendChild(edgeReorderGuide);
    }
    const bbox = contentGroup.getBBox();
    edgeReorderGuide.setAttribute("x1", String(bbox.x));
    edgeReorderGuide.setAttribute("y1", String(y));
    edgeReorderGuide.setAttribute("x2", String(bbox.x + bbox.width));
    edgeReorderGuide.setAttribute("y2", String(y));
  }

  function finishEdgeReorder(event: PointerEvent): void {
    if (!edgeReorder) return;
    const finished = edgeReorder;
    edgeReorder = null;
    svg.releasePointerCapture?.(event.pointerId);
    edgeReorderGuide?.remove();
    edgeReorderGuide = null;
    edgeReorderHorizontalGuide?.remove();
    edgeReorderHorizontalGuide = null;

    const diagram = bus.getState();
    const fromIndex = diagram.edges.findIndex((e) => e.id === finished.edgeId);
    if (fromIndex < 0) return;

    // Horizontal branch: self-call drop on a different lifeline →
    // reassign the edge's source + target to that lifeline. Only
    // engages when the gesture's locked direction is horizontal — i.e.
    // dx beat dy past the initial threshold and the edge is a
    // self-call (non-self-call sequence edges stay vertical-only).
    if (finished.direction === "horizontal" && finished.isSelfCall) {
      if (finished.lifelineColumns.length === 0) return;
      const cursor = clientToLayout(event.clientX, event.clientY);
      const targetIdx = nearestColumnIndex(finished.lifelineColumns, cursor.x);
      const targetCol = finished.lifelineColumns[targetIdx];
      if (!targetCol) return;
      const edge = diagram.edges.find((e) => e.id === finished.edgeId);
      if (!edge) return;
      if (edge.source === targetCol.id && edge.target === targetCol.id) return;
      history.dispatch(
        updateEdgeCommand(finished.edgeId, { source: targetCol.id, target: targetCol.id }, diagram),
      );
      return;
    }

    const dy = event.clientY - finished.startClientY;
    const moved = Math.round(dy / SEQUENCE_ROW_HEIGHT);
    if (moved === 0) return;
    const toIndex = Math.max(0, Math.min(fromIndex + moved, diagram.edges.length - 1));
    if (toIndex === fromIndex) return;
    history.dispatch(moveEdgeCommand(finished.edgeId, toIndex, diagram));
  }

  /**
   * Edge label drag-to-move. Pointerdown on a `<g.uml-edge-label>`
   * captures the segment's auto midpoint (read from the parent edge
   * `<g>` `data-source-x/y` + `data-target-x/y`) and the label's current
   * offset; pointermove translates the label via `transform` directly
   * (no AST writes); pointerup snaps the absolute label position to the
   * grid and dispatches `moveEdgeLabelCommand` so the offset persists
   * and is reversible through history.
   */
  function startEdgeLabelDrag(
    event: PointerEvent,
    edgeId: string,
    labelGroup: SVGGraphicsElement,
    edgeGroup: SVGGraphicsElement,
  ): void {
    const sx = Number(edgeGroup.getAttribute("data-source-x") ?? 0);
    const sy = Number(edgeGroup.getAttribute("data-source-y") ?? 0);
    const tx = Number(edgeGroup.getAttribute("data-target-x") ?? 0);
    const ty = Number(edgeGroup.getAttribute("data-target-y") ?? 0);
    const autoMid = { x: (sx + tx) / 2, y: (sy + ty) / 2 };
    const startOffsetX = Number(labelGroup.getAttribute("data-label-offset-x") ?? 0);
    const startOffsetY = Number(labelGroup.getAttribute("data-label-offset-y") ?? 0);
    if (event.shiftKey) {
      selection.toggle(edgeId);
    } else {
      selection.set([edgeId]);
    }
    edgeLabelDrag = {
      edgeId,
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startLayout: clientToLayout(event.clientX, event.clientY),
      labelGroup,
      startOffset: { x: startOffsetX, y: startOffsetY },
      autoMid,
      hasMoved: false,
    };
    svg.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
  }

  function paintEdgeLabelDrag(event: PointerEvent): void {
    if (!edgeLabelDrag) return;
    const cursor = clientToLayout(event.clientX, event.clientY);
    const rawDx = cursor.x - edgeLabelDrag.startLayout.x;
    const rawDy = cursor.y - edgeLabelDrag.startLayout.y;
    const offsetX = edgeLabelDrag.startOffset.x + rawDx;
    const offsetY = edgeLabelDrag.startOffset.y + rawDy;
    const mx = edgeLabelDrag.autoMid.x + offsetX;
    const my = edgeLabelDrag.autoMid.y + offsetY;
    edgeLabelDrag.labelGroup.setAttribute("transform", `translate(${mx}, ${my})`);
  }

  function finishEdgeLabelDrag(event: PointerEvent): void {
    if (!edgeLabelDrag) return;
    const finished = edgeLabelDrag;
    edgeLabelDrag = null;
    svg.releasePointerCapture?.(event.pointerId);
    if (!finished.hasMoved) return;
    const cursor = clientToLayout(event.clientX, event.clientY);
    const rawDx = cursor.x - finished.startLayout.x;
    const rawDy = cursor.y - finished.startLayout.y;
    // Snap the final absolute label position to the grid (not the
    // delta), so the label always rests on a grid intersection
    // regardless of where the auto midpoint falls. Alt holds free-form
    // mode for fine adjustment, matching the node-move gesture.
    const snap = getSnap();
    const useSnap = snap.enabled && !event.altKey;
    const absX = finished.autoMid.x + finished.startOffset.x + rawDx;
    const absY = finished.autoMid.y + finished.startOffset.y + rawDy;
    const snappedX = useSnap ? snapValue(absX, snap) : absX;
    const snappedY = useSnap ? snapValue(absY, snap) : absY;
    const labelOffsetX = snappedX - finished.autoMid.x;
    const labelOffsetY = snappedY - finished.autoMid.y;
    history.dispatch(
      moveEdgeLabelCommand(finished.edgeId, { labelOffsetX, labelOffsetY }, bus.getState()),
    );
  }

  /**
   * Fragment drag-to-move. A combined fragment's chronological span is
   * derived from the indices of its edges in `diagram.edges`, so "moving"
   * the fragment vertically means reordering its edges as a contiguous
   * block. Pointerdown on a fragment border captures startClientY; on
   * pointerup we dispatch `moveSequenceFragmentCommand` with deltaRows
   * derived from dy / SEQUENCE_ROW_HEIGHT. A pure click (no movement)
   * leaves the fragment selected — that path is handled by the caller
   * in `onPointerDown`.
   */
  function startFragmentReorder(event: PointerEvent, fragmentId: string): void {
    fragmentReorder = {
      fragmentId,
      pointerId: event.pointerId,
      startClientY: event.clientY,
      hasMoved: false,
    };
    svg.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
  }

  function paintFragmentReorderGuide(event: PointerEvent): void {
    if (!fragmentReorder) return;
    const dy = event.clientY - fragmentReorder.startClientY;
    const moved = Math.round(dy / SEQUENCE_ROW_HEIGHT);
    // Translate the visible fragment frame ephemerally so the user sees
    // the block follow the pointer. The data-fragment-id rect stays put;
    // only the visible (non-hit) rect carries the transform via a CSS
    // transform on the host group.
    const escaped = fragmentReorder.fragmentId.replaceAll('"', '\\"');
    const els = contentGroup.querySelectorAll(`[data-fragment-id="${escaped}"]`);
    els.forEach((el) => {
      if (el instanceof SVGGraphicsElement) {
        el.setAttribute("transform", `translate(0, ${moved * SEQUENCE_ROW_HEIGHT})`);
      }
    });
  }

  /**
   * Fragment N / S handle resize. Drags a handle vertically; on
   * pointerup we dispatch `resizeSequenceFragmentCommand` with
   * `deltaRows = round(dy / SEQUENCE_ROW_HEIGHT)`. The command
   * structurally grows / shrinks the fragment by adding / removing
   * edges to / from the first or last operand — the visible frame
   * follows because its geometry is derived from those operands.
   */
  /**
   * Read lifeline cx values straight off the rendered DOM, sorted L→R.
   * Used by horizontal fragment-resize to snap the dragged edge to the
   * nearest lifeline column.
   */
  function readLifelineColumnsFromDOM(): Array<{ id: string; cx: number }> {
    const result: Array<{ id: string; cx: number }> = [];
    const els = contentGroup.querySelectorAll("g[data-node-id]");
    els.forEach((el) => {
      if (!(el instanceof SVGGraphicsElement)) return;
      const id = el.getAttribute("data-node-id");
      if (!id) return;
      const transform = el.getAttribute("transform") ?? "";
      const match = transform.match(/translate\(\s*(-?[\d.]+)[ ,]\s*(-?[\d.]+)\s*\)/);
      const tx = match ? Number(match[1]) : 0;
      const rect = el.querySelector(":scope > rect");
      const w = rect instanceof SVGRectElement ? Number(rect.getAttribute("width") ?? 0) : 0;
      result.push({ id, cx: tx + w / 2 });
    });
    result.sort((a, b) => a.cx - b.cx);
    return result;
  }

  /**
   * Find the lifeline whose cx is closest to `x`, in the layout-coords
   * column list captured at gesture start.
   */
  function nearestColumnIndex(
    columns: ReadonlyArray<{ id: string; cx: number }>,
    x: number,
  ): number {
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < columns.length; i += 1) {
      const col = columns[i];
      if (!col) continue;
      const d = Math.abs(col.cx - x);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  /**
   * Resolve the current "anchor" column index for an E or W resize. We
   * read the rendered fragment frame's left / right edge and find the
   * nearest lifeline cx — that index becomes the baseline from which
   * `deltaColumns` is measured on pointerup.
   */
  function anchorColumnForFragmentEdge(
    fragmentId: string,
    side: "e" | "w",
    columns: ReadonlyArray<{ id: string; cx: number }>,
  ): number {
    const escaped = fragmentId.replaceAll('"', '\\"');
    const groupEl = contentGroup.querySelector(`g[data-fragment-id="${escaped}"]`);
    if (!(groupEl instanceof SVGGraphicsElement)) return 0;
    const frame = groupEl.querySelector(":scope > rect.uml-sequence-fragment");
    if (!(frame instanceof SVGRectElement)) return 0;
    const frameX = Number(frame.getAttribute("x") ?? 0);
    const frameW = Number(frame.getAttribute("width") ?? 0);
    const edgeX = side === "w" ? frameX : frameX + frameW;
    return nearestColumnIndex(columns, edgeX);
  }

  function startFragmentResize(
    event: PointerEvent,
    fragmentId: string,
    side: "n" | "s" | "e" | "w",
  ): void {
    const lifelineColumns = side === "e" || side === "w" ? readLifelineColumnsFromDOM() : [];
    const anchorColumnIndex =
      side === "e" || side === "w"
        ? anchorColumnForFragmentEdge(fragmentId, side, lifelineColumns)
        : 0;
    const startLayout = clientToLayout(event.clientX, event.clientY);
    fragmentResize = {
      fragmentId,
      side,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLayoutX: startLayout.x,
      startLayoutY: startLayout.y,
      lifelineColumns,
      anchorColumnIndex,
      hasMoved: false,
    };
    selection.set([fragmentId]);
    svg.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
  }

  function paintFragmentResizeGuide(event: PointerEvent): void {
    if (!fragmentResize) return;
    const escaped = fragmentResize.fragmentId.replaceAll('"', '\\"');
    const groupEl = contentGroup.querySelector(`g[data-fragment-id="${escaped}"]`);
    if (!(groupEl instanceof SVGGraphicsElement)) return;
    const frame = groupEl.querySelector(":scope > rect.uml-sequence-fragment");
    if (!(frame instanceof SVGRectElement)) return;
    const frameY = Number(frame.getAttribute("y") ?? 0);
    const frameH = Number(frame.getAttribute("height") ?? 0);
    const frameX = Number(frame.getAttribute("x") ?? 0);
    const frameW = Number(frame.getAttribute("width") ?? 0);

    if (!fragmentResizeGuide) {
      fragmentResizeGuide = svg.ownerDocument!.createElementNS(SVG_NS, "line");
      fragmentResizeGuide.setAttribute("class", "uml-fragment-resize-guide");
      fragmentResizeGuide.setAttribute("stroke", "var(--uml-accent)");
      fragmentResizeGuide.setAttribute("stroke-width", "2");
      fragmentResizeGuide.setAttribute("stroke-dasharray", "4 4");
      fragmentResizeGuide.setAttribute("pointer-events", "none");
      contentGroup.appendChild(fragmentResizeGuide);
    }

    if (fragmentResize.side === "n" || fragmentResize.side === "s") {
      // Snap to the visible grid step (matches snap.ts DEFAULT_SNAP)
      // so the frame edge always lands on a grid cell — same behaviour
      // the user gets when dragging nodes / boundaries. dy is computed
      // in layout coordinates so the snap math is zoom-invariant.
      const snap = getSnap();
      const cell = snap.enabled && snap.step > 0 ? snap.step : 1;
      const cursor = clientToLayout(event.clientX, event.clientY);
      const dy = cursor.y - fragmentResize.startLayoutY;
      const deltaPx = Math.round(dy / cell) * cell;
      const guideY = fragmentResize.side === "n" ? frameY + deltaPx : frameY + frameH + deltaPx;
      fragmentResizeGuide.setAttribute("x1", String(frameX));
      fragmentResizeGuide.setAttribute("y1", String(guideY));
      fragmentResizeGuide.setAttribute("x2", String(frameX + frameW));
      fragmentResizeGuide.setAttribute("y2", String(guideY));
    } else {
      // E / W: paint a vertical guide at the nearest lifeline cx to the
      // pointer in layout coords. Falls back to free-form X if no
      // lifeline columns were captured.
      const cursor = clientToLayout(event.clientX, event.clientY);
      const columns = fragmentResize.lifelineColumns;
      const guideX =
        columns.length > 0
          ? (columns[nearestColumnIndex(columns, cursor.x)]?.cx ?? cursor.x)
          : cursor.x;
      fragmentResizeGuide.setAttribute("x1", String(guideX));
      fragmentResizeGuide.setAttribute("y1", String(frameY));
      fragmentResizeGuide.setAttribute("x2", String(guideX));
      fragmentResizeGuide.setAttribute("y2", String(frameY + frameH));
    }
  }

  function finishFragmentResize(event: PointerEvent): void {
    if (!fragmentResize) return;
    const finished = fragmentResize;
    fragmentResize = null;
    svg.releasePointerCapture?.(event.pointerId);
    fragmentResizeGuide?.remove();
    fragmentResizeGuide = null;
    if (!finished.hasMoved) return;

    if (finished.side === "n" || finished.side === "s") {
      // Vertical fragment resize snaps to the grid step (one cell at
      // a time) and the command stores the result directly in pixels.
      // dy in layout coords keeps the snap math zoom-invariant.
      const snap = getSnap();
      const cell = snap.enabled && snap.step > 0 ? snap.step : 1;
      const cursor = clientToLayout(event.clientX, event.clientY);
      const dy = cursor.y - finished.startLayoutY;
      const deltaPx = Math.round(dy / cell) * cell;
      if (deltaPx === 0) return;
      const side: FragmentResizeSide = finished.side === "n" ? "top" : "bottom";
      history.dispatch(
        resizeSequenceFragmentCommand(finished.fragmentId, side, deltaPx, bus.getState()),
      );
      return;
    }

    if (finished.lifelineColumns.length === 0) return;
    const cursor = clientToLayout(event.clientX, event.clientY);
    const targetIdx = nearestColumnIndex(finished.lifelineColumns, cursor.x);
    const deltaColumns = targetIdx - finished.anchorColumnIndex;
    if (deltaColumns === 0) return;
    const side: FragmentResizeSide = finished.side === "w" ? "left" : "right";
    history.dispatch(
      resizeSequenceFragmentCommand(finished.fragmentId, side, deltaColumns, bus.getState()),
    );
  }

  /**
   * Activation N / S handle resize. Drags the handle vertically; on
   * pointerup we dispatch `resizeActivationCommand` with the grid-snapped
   * `deltaPx`. The command picks the right storage field for the
   * activation flavour (standalone vs edge-anchored).
   */
  function startActivationResize(event: PointerEvent, activationId: string, side: "n" | "s"): void {
    const startLayout = clientToLayout(event.clientX, event.clientY);
    activationResize = {
      activationId,
      side,
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startLayoutY: startLayout.y,
      hasMoved: false,
    };
    selection.set([activationId]);
    svg.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
  }

  function paintActivationResizeGuide(event: PointerEvent): void {
    if (!activationResize) return;
    const escaped = activationResize.activationId.replaceAll('"', '\\"');
    const groupEl = contentGroup.querySelector(`g[data-activation-id="${escaped}"]`);
    if (!(groupEl instanceof SVGGraphicsElement)) return;
    const rect = groupEl.querySelector(":scope > rect.uml-sequence-activation");
    if (!(rect instanceof SVGRectElement)) return;
    const x = Number(rect.getAttribute("x") ?? 0);
    const w = Number(rect.getAttribute("width") ?? 0);
    const y = Number(rect.getAttribute("y") ?? 0);
    const h = Number(rect.getAttribute("height") ?? 0);

    const snap = getSnap();
    const cell = snap.enabled && snap.step > 0 ? snap.step : 1;
    const cursor = clientToLayout(event.clientX, event.clientY);
    const dy = cursor.y - activationResize.startLayoutY;
    const deltaPx = Math.round(dy / cell) * cell;
    const guideY = activationResize.side === "n" ? y + deltaPx : y + h + deltaPx;

    if (!activationResizeGuide) {
      activationResizeGuide = svg.ownerDocument!.createElementNS(SVG_NS, "line");
      activationResizeGuide.setAttribute("class", "uml-activation-resize-guide");
      activationResizeGuide.setAttribute("stroke", "var(--uml-accent)");
      activationResizeGuide.setAttribute("stroke-width", "2");
      activationResizeGuide.setAttribute("stroke-dasharray", "4 4");
      activationResizeGuide.setAttribute("pointer-events", "none");
      contentGroup.appendChild(activationResizeGuide);
    }
    activationResizeGuide.setAttribute("x1", String(x - 4));
    activationResizeGuide.setAttribute("y1", String(guideY));
    activationResizeGuide.setAttribute("x2", String(x + w + 4));
    activationResizeGuide.setAttribute("y2", String(guideY));
  }

  function finishActivationResize(event: PointerEvent): void {
    if (!activationResize) return;
    const finished = activationResize;
    activationResize = null;
    svg.releasePointerCapture?.(event.pointerId);
    activationResizeGuide?.remove();
    activationResizeGuide = null;
    if (!finished.hasMoved) return;

    const snap = getSnap();
    const cell = snap.enabled && snap.step > 0 ? snap.step : 1;
    const cursor = clientToLayout(event.clientX, event.clientY);
    const dy = cursor.y - finished.startLayoutY;
    const deltaPx = Math.round(dy / cell) * cell;
    if (deltaPx === 0) return;
    const side: ActivationResizeSide = finished.side === "n" ? "top" : "bottom";
    history.dispatch(resizeActivationCommand(finished.activationId, side, deltaPx, bus.getState()));
  }

  /**
   * Drag-to-move on an activation bar. Vertical-only — the bar stays on
   * its lifeline column (horizontal lifeline reassignment is handled via
   * the props panel; the renderer derives x from the parent node id).
   * Standalone activations get their `topPx` mutated; edge-anchored
   * activations adjust both `topExtraPx` and `bottomExtraPx` by the same
   * (sign-inverted) delta so the bar translates without changing height.
   */
  function startActivationMove(event: PointerEvent, activationId: string, nodeId: string): void {
    const startLayout = clientToLayout(event.clientX, event.clientY);
    activationMove = {
      activationId,
      nodeId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLayoutY: startLayout.y,
      hasMoved: false,
      direction: null,
      lifelineColumns: readLifelineColumnsFromDOM(),
    };
    svg.setPointerCapture?.(event.pointerId);
  }

  function paintActivationMoveGuide(event: PointerEvent): void {
    if (!activationMove) return;
    const escaped = activationMove.activationId.replaceAll('"', '\\"');
    const groupEl = contentGroup.querySelector(`g[data-activation-id="${escaped}"]`);

    if (activationMove.direction === "horizontal") {
      // Vertical dashed guide at the nearest lifeline cx. The bar
      // itself stays put; on pointerup the activation is reassigned to
      // the chosen lifeline.
      if (groupEl instanceof SVGGraphicsElement) groupEl.removeAttribute("transform");
      if (activationMove.lifelineColumns.length === 0) return;
      const cursor = clientToLayout(event.clientX, event.clientY);
      const targetIdx = nearestColumnIndex(activationMove.lifelineColumns, cursor.x);
      const targetCol = activationMove.lifelineColumns[targetIdx];
      if (!targetCol) return;
      if (!activationMoveHorizontalGuide) {
        activationMoveHorizontalGuide = svg.ownerDocument!.createElementNS(SVG_NS, "line");
        activationMoveHorizontalGuide.setAttribute("class", "uml-activation-move-guide");
        activationMoveHorizontalGuide.setAttribute("stroke", "var(--uml-accent)");
        activationMoveHorizontalGuide.setAttribute("stroke-width", "2");
        activationMoveHorizontalGuide.setAttribute("stroke-dasharray", "4 4");
        activationMoveHorizontalGuide.setAttribute("pointer-events", "none");
        contentGroup.appendChild(activationMoveHorizontalGuide);
      }
      const bbox = contentGroup.getBBox();
      activationMoveHorizontalGuide.setAttribute("x1", String(targetCol.cx));
      activationMoveHorizontalGuide.setAttribute("y1", String(bbox.y));
      activationMoveHorizontalGuide.setAttribute("x2", String(targetCol.cx));
      activationMoveHorizontalGuide.setAttribute("y2", String(bbox.y + bbox.height));
      return;
    }

    // Vertical drag — translate the bar ephemerally; horizontal guide
    // is cleared in case the user crossed back from a horizontal arc.
    activationMoveHorizontalGuide?.remove();
    activationMoveHorizontalGuide = null;
    const snap = getSnap();
    const cell = snap.enabled && snap.step > 0 ? snap.step : 1;
    const cursor = clientToLayout(event.clientX, event.clientY);
    const dy = cursor.y - activationMove.startLayoutY;
    const deltaPx = Math.round(dy / cell) * cell;
    if (groupEl instanceof SVGGraphicsElement) {
      groupEl.setAttribute("transform", `translate(0, ${deltaPx})`);
    }
  }

  function finishActivationMove(event: PointerEvent): void {
    if (!activationMove) return;
    const finished = activationMove;
    activationMove = null;
    svg.releasePointerCapture?.(event.pointerId);

    const escaped = finished.activationId.replaceAll('"', '\\"');
    const groupEl = contentGroup.querySelector(`g[data-activation-id="${escaped}"]`);
    if (groupEl instanceof SVGGraphicsElement) groupEl.removeAttribute("transform");
    activationMoveHorizontalGuide?.remove();
    activationMoveHorizontalGuide = null;

    if (!finished.hasMoved) return;

    // Horizontal branch — reassign the activation to the lifeline whose
    // column cx is closest to the pointer in layout coordinates. Skip
    // when the drop lands on the same lifeline (no-op).
    if (finished.direction === "horizontal") {
      if (finished.lifelineColumns.length === 0) return;
      const cursor = clientToLayout(event.clientX, event.clientY);
      const targetIdx = nearestColumnIndex(finished.lifelineColumns, cursor.x);
      const targetCol = finished.lifelineColumns[targetIdx];
      if (!targetCol) return;
      if (targetCol.id === finished.nodeId) return;
      history.dispatch(
        moveActivationToLifelineCommand(finished.activationId, targetCol.id, bus.getState()),
      );
      return;
    }

    const snap = getSnap();
    const cell = snap.enabled && snap.step > 0 ? snap.step : 1;
    const cursor = clientToLayout(event.clientX, event.clientY);
    const dy = cursor.y - finished.startLayoutY;
    const deltaPx = Math.round(dy / cell) * cell;
    if (deltaPx === 0) return;

    const diagram = bus.getState();
    const node = diagram.nodes.find((n) => n.id === finished.nodeId);
    const interval = node?.activations?.find((a) => a.id === finished.activationId);
    if (!interval) return;

    if (interval.fromEdgeId === undefined) {
      // Standalone — translate the raw top position by deltaPx.
      const nextTop = (interval.topPx ?? 0) + deltaPx;
      history.dispatch(updateActivationCommand(finished.activationId, { topPx: nextTop }, diagram));
    } else {
      // Edge-anchored — shift both extras so the bar translates without
      // changing height. Sign convention in the renderer: topExtraPx is
      // subtracted from yTop; bottomExtraPx is added to yBottom. So a
      // downward translation (deltaPx > 0) needs: topExtra -= deltaPx
      // (top moves down), bottomExtra += deltaPx (bottom moves down).
      history.dispatch(
        updateActivationCommand(
          finished.activationId,
          {
            topExtraPx: (interval.topExtraPx ?? 0) - deltaPx,
            bottomExtraPx: (interval.bottomExtraPx ?? 0) + deltaPx,
          },
          diagram,
        ),
      );
    }
  }

  function finishFragmentReorder(event: PointerEvent): void {
    if (!fragmentReorder) return;
    const finished = fragmentReorder;
    fragmentReorder = null;
    svg.releasePointerCapture?.(event.pointerId);
    // Strip the ephemeral transform — the real re-render lands once the
    // command dispatches below.
    const escaped = finished.fragmentId.replaceAll('"', '\\"');
    contentGroup.querySelectorAll(`[data-fragment-id="${escaped}"]`).forEach((el) => {
      if (el instanceof SVGGraphicsElement) el.removeAttribute("transform");
    });
    if (!finished.hasMoved) return;
    const dy = event.clientY - finished.startClientY;
    const moved = Math.round(dy / SEQUENCE_ROW_HEIGHT);
    if (moved === 0) return;
    history.dispatch(moveSequenceFragmentCommand(finished.fragmentId, moved, bus.getState()));
  }

  /**
   * Read the boundary rectangle straight off the rendered DOM. Mirrors
   * `nodeRectInLayout` for groups: groups don't carry a `transform`
   * attribute (their children render in absolute layout coords), so the
   * rect attributes are already in the layout space we want.
   *
   * Package groups render as a `<path>` so the bounding box lives on a
   * dedicated `[data-uml-group-bounds]` rect; boundary groups still use
   * the visible frame rect.
   */
  function groupRectInLayout(groupEl: SVGGraphicsElement): Rect {
    const rect = groupEl.querySelector(
      ":scope > rect[data-uml-group-bounds], :scope > rect.uml-group-boundary, :scope > rect",
    );
    if (rect instanceof SVGRectElement) {
      return {
        x: Number(rect.getAttribute("x") ?? 0),
        y: Number(rect.getAttribute("y") ?? 0),
        width: Number(rect.getAttribute("width") ?? 0),
        height: Number(rect.getAttribute("height") ?? 0),
      };
    }
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  /**
   * Apply an ephemeral move/resize to a boundary group's DOM. Rewrites
   * the frame rect, label band rect, label text positions, and 8 resize
   * handle positions so the visual matches what `renderGroupLayer` will
   * produce on next render. Children are NOT touched here — the caller
   * (move-mode loop) translates child node groups separately so a single
   * boundary-drag also drags every node it contains.
   */
  /**
   * Snapshot every boundary's current rect in layout coordinates by
   * reading the rendered DOM. Used by drag-into-boundary hit-testing —
   * captured once at pointerdown so the targets don't drift during
   * the gesture (auto-fit boundaries would otherwise chase the
   * dragged node and cause flicker).
   */
  function readBoundaryBoxesFromDOM(
    contentGroupEl: SVGGraphicsElement,
  ): Array<{ groupId: string; rect: Rect }> {
    const result: Array<{ groupId: string; rect: Rect }> = [];
    const els = contentGroupEl.querySelectorAll("[data-group-id]");
    els.forEach((el) => {
      if (!(el instanceof SVGGraphicsElement)) return;
      const id = el.getAttribute("data-group-id");
      if (!id) return;
      result.push({ groupId: id, rect: groupRectInLayout(el) });
    });
    return result;
  }

  /**
   * Pick the innermost boundary whose rect contains `point`. Innermost
   * means smallest area — when boundaries are nested the deepest one
   * wins, matching the visual intuition that a node dropped onto two
   * stacked boundaries belongs to the inner one.
   */
  function findBoundaryAtPoint(
    boxes: ReadonlyArray<{ groupId: string; rect: Rect }>,
    point: { x: number; y: number },
  ): string | null {
    let best: { groupId: string; area: number } | null = null;
    for (const { groupId, rect } of boxes) {
      const inside =
        point.x >= rect.x &&
        point.x <= rect.x + rect.width &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.height;
      if (!inside) continue;
      const area = rect.width * rect.height;
      if (!best || area < best.area) best = { groupId, area };
    }
    return best?.groupId ?? null;
  }

  /**
   * Toggle the `data-uml-drop-target` attribute on boundary groups so
   * CSS can highlight the one the user is hovering with a dragged node.
   * Pass `null` to clear. The attribute is the only DOM writes this
   * function performs — cheap to call per-frame.
   */
  function paintDropTarget(contentGroupEl: SVGGraphicsElement, groupId: string | null): void {
    const previously = contentGroupEl.querySelectorAll('[data-uml-drop-target="true"]');
    previously.forEach((el) => el.removeAttribute("data-uml-drop-target"));
    if (!groupId) return;
    const escaped = groupId.replaceAll('"', '\\"');
    const el = contentGroupEl.querySelector(`[data-group-id="${escaped}"]`);
    if (el) el.setAttribute("data-uml-drop-target", "true");
  }

  function applyEphemeralGroupRect(
    contentGroupEl: SVGGraphicsElement,
    groupId: string,
    next: Rect,
  ): void {
    const escaped = groupId.replaceAll('"', '\\"');
    const groupEl = contentGroupEl.querySelector(`[data-group-id="${escaped}"]`);
    if (!(groupEl instanceof SVGGraphicsElement)) return;

    const isPackage = groupEl.getAttribute("data-uml-group") === "package";

    // Update the bounding rect (package) or visible frame rect (boundary)
    // — both carry the full box so `groupRectInLayout` round-trips it.
    const frameRect = groupEl.querySelector(
      ":scope > rect[data-uml-group-bounds], :scope > rect.uml-group-boundary",
    );
    if (frameRect instanceof SVGRectElement) {
      frameRect.setAttribute("x", String(next.x));
      frameRect.setAttribute("y", String(next.y));
      frameRect.setAttribute("width", String(next.width));
      frameRect.setAttribute("height", String(next.height));
    }

    if (isPackage) {
      applyEphemeralPackageShape(groupEl, next);
    } else {
      applyEphemeralBoundaryShape(groupEl, next);
    }

    // Reposition the eight resize handles around the new rect — common
    // to both kinds.
    const handles = groupEl.querySelectorAll<SVGRectElement>("[data-resize-handle]");
    handles.forEach((handle) => {
      const side = handle.getAttribute("data-resize-handle");
      const local = handlePosition(side, next.width, next.height);
      if (!local) return;
      handle.setAttribute("x", String(next.x + local.x - 4));
      handle.setAttribute("y", String(next.y + local.y - 4));
    });
  }

  function applyEphemeralBoundaryShape(groupEl: SVGGraphicsElement, next: Rect): void {
    const labelBand = groupEl.querySelector('[data-uml-group-handle="label"]');
    if (labelBand instanceof SVGRectElement) {
      labelBand.setAttribute("x", String(next.x));
      labelBand.setAttribute("y", String(next.y));
      labelBand.setAttribute("width", String(next.width));
    }
    const LABEL_INSET_X = 16;
    const LABEL_INSET_Y = 18;
    const labelText = groupEl.querySelector(":scope > text.uml-group__label");
    if (labelText instanceof SVGTextElement) {
      labelText.setAttribute("x", String(next.x + LABEL_INSET_X));
      labelText.setAttribute("y", String(next.y + LABEL_INSET_Y));
    }
    const tagText = groupEl.querySelector(":scope > text.uml-group__type-tag");
    if (tagText instanceof SVGTextElement) {
      tagText.setAttribute("x", String(next.x + LABEL_INSET_X));
      tagText.setAttribute("y", String(next.y + LABEL_INSET_Y + 14));
    }
  }

  /** Mirror of `groups.ts` package geometry for ephemeral DOM updates. */
  const PACKAGE_TAB_HEIGHT = 18;
  function packageTabWidth(label: string, width: number): number {
    return Math.min(Math.max(label.length * 7 + 24, 80), width * 0.6);
  }
  function packagePathD(rect: Rect, tabWidth: number): string {
    const t = PACKAGE_TAB_HEIGHT;
    const { x, y, width: w, height: h } = rect;
    return (
      `M ${x} ${y} L ${x + tabWidth} ${y} L ${x + tabWidth} ${y + t} ` +
      `L ${x + w} ${y + t} L ${x + w} ${y + h} L ${x} ${y + h} Z`
    );
  }

  function applyEphemeralPackageShape(groupEl: SVGGraphicsElement, next: Rect): void {
    const labelText = groupEl.querySelector(":scope > text.uml-group__label");
    const labelStr = labelText instanceof SVGTextElement ? (labelText.textContent ?? "") : "";
    const tabWidth = packageTabWidth(labelStr, next.width);
    // Update the visible package outline.
    const path = groupEl.querySelector("[data-uml-package-path]");
    if (path instanceof SVGPathElement) {
      path.setAttribute("d", packagePathD(next, tabWidth));
    }
    // Update the tab fill (also the label-band hit zone).
    const tab = groupEl.querySelector('[data-uml-group-handle="label"]');
    if (tab instanceof SVGRectElement) {
      tab.setAttribute("x", String(next.x));
      tab.setAttribute("y", String(next.y));
      tab.setAttribute("width", String(tabWidth));
      tab.setAttribute("height", String(PACKAGE_TAB_HEIGHT));
    }
    // Move the label inside the tab.
    if (labelText instanceof SVGTextElement) {
      labelText.setAttribute("x", String(next.x + 8));
      labelText.setAttribute("y", String(next.y + PACKAGE_TAB_HEIGHT - 5));
    }
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

    // Edge label drag — pointerdown on a `<g.uml-edge-label>` pill starts
    // a label-move gesture. Runs ahead of every other branch (only when
    // the click did not resolve to a node) so a label sitting visually
    // over a boundary, edge body, or empty canvas still wins. Sequence
    // diagrams have their own drag-to-reorder gesture on edge bodies —
    // for now we keep label-move disabled there to avoid gesture overlap.
    if (!group) {
      const labelEl =
        event.target instanceof Element ? event.target.closest("g.uml-edge-label") : null;
      if (labelEl instanceof SVGGraphicsElement) {
        const edgeGroup = labelEl.closest("[data-edge-id]");
        const edgeId = edgeGroup?.getAttribute("data-edge-id") ?? null;
        if (edgeGroup instanceof SVGGraphicsElement && edgeId) {
          const diagram = bus.getState();
          if (diagram.type !== "sequence") {
            startEdgeLabelDrag(event, edgeId, labelEl, edgeGroup);
            return;
          }
        }
      }
    }

    // Boundary-group hit takes priority only when no node was matched —
    // the renderer puts groups under nodes in z-order, so most pointerdown
    // events on a node still fall into the node branch above.
    if (!group) {
      const boundaryEl = findGroupAt(event.target);
      if (boundaryEl) {
        handleGroupPointerDown(event, boundaryEl);
        return;
      }
    }

    // Fragment resize handle — must run before the generic ornament
    // selection branch below, because the handle is itself nested inside
    // the fragment group and would otherwise resolve to a fragment
    // click. Resize takes priority over reorder when the handle is hit.
    if (!group) {
      const resizeHandleEl =
        event.target instanceof Element
          ? event.target.closest("[data-fragment-resize-handle]")
          : null;
      if (resizeHandleEl) {
        const sideAttr = resizeHandleEl.getAttribute("data-fragment-resize-handle");
        const fragmentEl = resizeHandleEl.closest("[data-fragment-id]");
        const fragmentId = fragmentEl?.getAttribute("data-fragment-id");
        if (
          fragmentId &&
          (sideAttr === "n" || sideAttr === "s" || sideAttr === "e" || sideAttr === "w")
        ) {
          startFragmentResize(event, fragmentId, sideAttr);
          return;
        }
      }
    }

    // Activation N / S resize handle — same priority as the fragment
    // handle: must beat the activation-rect click branch below so a
    // grab on the handle never resolves to a plain selection.
    if (!group) {
      const handleEl =
        event.target instanceof Element
          ? event.target.closest("[data-activation-resize-handle]")
          : null;
      if (handleEl) {
        const sideAttr = handleEl.getAttribute("data-activation-resize-handle");
        const activationEl = handleEl.closest("[data-activation-id]");
        const activationId = activationEl?.getAttribute("data-activation-id");
        if (activationId && (sideAttr === "n" || sideAttr === "s")) {
          startActivationResize(event, activationId, sideAttr);
          return;
        }
      }
    }

    // Activation rect — select + start vertical drag-to-move. Resize
    // handles above already intercepted any pointerdown on the N/S
    // grips, so reaching here means the user clicked the bar body. The
    // gesture is threshold-gated: a pure click leaves only the
    // selection mutation; movement past `DRAG_THRESHOLD_PX` translates
    // the bar via `updateActivationCommand`.
    if (!group) {
      const activationEl =
        event.target instanceof Element ? event.target.closest("[data-activation-id]") : null;
      if (activationEl) {
        const activationId = activationEl.getAttribute("data-activation-id");
        const nodeId = activationEl.getAttribute("data-activation-node-id");
        if (activationId) {
          if (event.shiftKey) {
            selection.toggle(activationId);
          } else {
            selection.set([activationId]);
          }
          if (nodeId) startActivationMove(event, activationId, nodeId);
          event.stopPropagation();
          return;
        }
      }
    }

    // Sequence ornaments — fragments, notes, dividers — are not nodes
    // but still selectable. Click sets the selection to the ornament id.
    // Fragments additionally support drag-to-move: dragging a fragment
    // vertically shifts its contained edges as a contiguous block in
    // `diagram.edges`. Notes and dividers don't drag — their visual
    // position is fully derived from their anchor edge / participants.
    if (!group) {
      const ornament = findOrnamentAt(event.target);
      if (ornament) {
        if (event.shiftKey) {
          selection.toggle(ornament.id);
        } else {
          selection.set([ornament.id]);
        }
        if (ornament.kind === "fragment") {
          startFragmentReorder(event, ornament.id);
          return;
        }
        event.stopPropagation();
        return;
      }
    }

    // Edge selection. Sequence diagrams drag-to-reorder a message; other
    // diagram types set the selection to the clicked edge so the React
    // layer (PropsPanel) can surface its action / technology fields.
    if (!group) {
      const edgeEl =
        event.target instanceof Element ? event.target.closest("[data-edge-id]") : null;
      if (edgeEl) {
        const diagram = bus.getState();
        const edgeId = edgeEl.getAttribute("data-edge-id");
        if (edgeId) {
          if (diagram.type === "sequence") {
            startEdgeReorder(event, edgeId);
            return;
          }
          if (event.shiftKey) {
            selection.toggle(edgeId);
          } else {
            selection.set([edgeId]);
          }
          event.stopPropagation();
          return;
        }
      }
    }

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
          targetKind: "node",
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
          groupOriginalRect: null,
          boundaryBoxes: [],
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
      // Capture each moving node's full DOM rect so we can hit-test its
      // centre against boundary rects on pointerup without re-querying
      // the DOM after the ephemeral move has rewritten transforms.
      const escaped = id.replaceAll('"', '\\"');
      const el = contentGroup.querySelector(`[data-node-id="${escaped}"]`);
      const r =
        el instanceof SVGGraphicsElement
          ? nodeRectInLayout(el)
          : { x: coord.x, y: coord.y, width: 0, height: 0 };
      return {
        id,
        original: { x: coord.x, y: coord.y },
        originalRect: { x: r.x, y: r.y, width: r.width, height: r.height },
      };
    });

    // Capture every visible boundary's rect once so drag-into-boundary
    // hit-testing stays stable through the gesture even when an
    // auto-fitting boundary would otherwise chase the dragged node.
    const boundaryBoxes = mode === "move" ? readBoundaryBoxesFromDOM(contentGroup) : [];

    drag = {
      mode,
      nodeId,
      targetKind: "node",
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
      groupOriginalRect: null,
      boundaryBoxes,
    };

    svg.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
  }

  /**
   * Boundary-group pointerdown. Distinguishes resize-handle (ResizeSide
   * stored in `resizeOriginalRect` + `resizeSide`) from move (frame /
   * label band hit) and seeds `movingNodes` with the group's children
   * so `pointermove` can translate them in lock-step with the boundary.
   */
  function handleGroupPointerDown(event: PointerEvent, boundaryEl: SVGGraphicsElement): void {
    const groupId = boundaryEl.getAttribute("data-group-id");
    if (!groupId) return;
    const diagram = bus.getState();
    const groupModel = diagram.groups.find((g) => g.id === groupId);
    if (!groupModel) return;

    const startLayout = clientToLayout(event.clientX, event.clientY);
    const rect = groupRectInLayout(boundaryEl);
    const overrides = diagram.metadata.layoutOverrides ?? {};

    // Resize handle — same `data-resize-handle` attribute as nodes use.
    const handleEl =
      event.target instanceof Element ? event.target.closest("[data-resize-handle]") : null;
    if (handleEl) {
      const side = handleEl.getAttribute("data-resize-handle") as ResizeSide | null;
      if (side) {
        selection.set([groupId]);
        drag = {
          mode: "resize",
          nodeId: groupId,
          targetKind: "group",
          pointerId: event.pointerId,
          startClient: { x: event.clientX, y: event.clientY },
          startLayout,
          movingNodes: [],
          hasMoved: false,
          ghostLine: null,
          marqueeRect: null,
          resizeSide: side,
          resizeOriginalRect: { ...rect },
          resizeLastRect: null,
          groupOriginalRect: { ...rect },
          boundaryBoxes: [],
        };
        svg.setPointerCapture?.(event.pointerId);
        event.stopPropagation();
        return;
      }
    }

    // Otherwise: move the boundary. Capture each child's original
    // coordinate so the move-loop translates the whole bundle on the
    // same `(dx, dy)` vector.
    selection.set([groupId]);
    const movingChildren: MovingNode[] = groupModel.children
      .map((childId) => {
        const coord = overrides[childId] ?? { x: 0, y: 0 };
        return { id: childId, original: { x: coord.x, y: coord.y } };
      })
      .filter((m) => diagram.nodes.some((n) => n.id === m.id));

    drag = {
      mode: "move",
      nodeId: groupId,
      targetKind: "group",
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startLayout,
      movingNodes: movingChildren,
      hasMoved: false,
      ghostLine: null,
      marqueeRect: null,
      resizeSide: null,
      resizeOriginalRect: null,
      resizeLastRect: null,
      groupOriginalRect: { ...rect },
      boundaryBoxes: [],
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
      targetKind: "node",
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
      groupOriginalRect: null,
      boundaryBoxes: [],
    };
    const host = svg.parentElement;
    host?.setAttribute("data-marquee-active", "true");
    svg.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
  }

  function onPointerMove(event: PointerEvent): void {
    // Edge-label drag (non-sequence): translate the label `<g>`
    // ephemerally via `transform`. Threshold-gated so a pure click
    // leaves only the selection mutation; the AST write happens once
    // on pointerup.
    if (edgeLabelDrag && edgeLabelDrag.pointerId === event.pointerId) {
      const dx = event.clientX - edgeLabelDrag.startClient.x;
      const dy = event.clientY - edgeLabelDrag.startClient.y;
      if (!edgeLabelDrag.hasMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      edgeLabelDrag.hasMoved = true;
      paintEdgeLabelDrag(event);
      return;
    }
    // Edge-reorder gesture (sequence-only): paint a horizontal guide
    // at the proposed insertion row, OR — for self-calls — a vertical
    // guide at the target lifeline when the user drags horizontally.
    // Direction is locked on the first move that exceeds
    // `DRAG_THRESHOLD_PX` so the guide doesn't flip mid-drag.
    if (edgeReorder && edgeReorder.pointerId === event.pointerId) {
      if (edgeReorder.direction === null) {
        const dx = event.clientX - edgeReorder.startClientX;
        const dy = event.clientY - edgeReorder.startClientY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        edgeReorder.direction =
          edgeReorder.isSelfCall && Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      }
      paintEdgeReorderGuide(event);
      return;
    }
    // Fragment-reorder gesture (sequence-only): translate the visible
    // frame ephemerally so the user sees the block follow the pointer.
    // Threshold-gated so a pure click doesn't trigger movement.
    if (fragmentReorder && fragmentReorder.pointerId === event.pointerId) {
      const dy = event.clientY - fragmentReorder.startClientY;
      if (!fragmentReorder.hasMoved && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      fragmentReorder.hasMoved = true;
      paintFragmentReorderGuide(event);
      return;
    }
    // Fragment-resize gesture (sequence-only): paint a horizontal
    // (N/S) or vertical (E/W) guide at the proposed new edge position.
    if (fragmentResize && fragmentResize.pointerId === event.pointerId) {
      const isVerticalSide = fragmentResize.side === "n" || fragmentResize.side === "s";
      const delta = isVerticalSide
        ? event.clientY - fragmentResize.startClientY
        : event.clientX - fragmentResize.startClientX;
      if (!fragmentResize.hasMoved && Math.abs(delta) < DRAG_THRESHOLD_PX) return;
      fragmentResize.hasMoved = true;
      paintFragmentResizeGuide(event);
      return;
    }
    // Activation-resize gesture (sequence-only): paint a horizontal
    // dashed guide at the proposed new top/bottom edge of the bar.
    if (activationResize && activationResize.pointerId === event.pointerId) {
      const dy = event.clientY - activationResize.startClientY;
      if (!activationResize.hasMoved && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      activationResize.hasMoved = true;
      paintActivationResizeGuide(event);
      return;
    }
    // Activation-move gesture (sequence-only): lazy direction lock —
    // first move past `DRAG_THRESHOLD_PX` decides vertical translate vs
    // horizontal lifeline reassignment. Vertical drags translate the
    // bar group via CSS transform; horizontal drags paint a vertical
    // dashed guide at the target lifeline cx.
    if (activationMove && activationMove.pointerId === event.pointerId) {
      if (activationMove.direction === null) {
        const dx = event.clientX - activationMove.startClientX;
        const dy = event.clientY - activationMove.startClientY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        activationMove.direction = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      }
      activationMove.hasMoved = true;
      paintActivationMoveGuide(event);
      return;
    }
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
      // Translate every captured node (one for plain move, N for group
      // marquee or boundary-with-children move).
      for (const moving of drag.movingNodes) {
        const node = contentGroup.querySelector(`[data-node-id="${moving.id}"]`);
        if (node instanceof SVGGraphicsElement) {
          node.setAttribute(
            "transform",
            `translate(${moving.original.x + ddx}, ${moving.original.y + ddy})`,
          );
        }
      }
      // For boundary moves: also reposition the dashed frame, label and
      // 8 resize handles so the rectangle visually follows the pointer.
      if (drag.targetKind === "group" && drag.groupOriginalRect) {
        applyEphemeralGroupRect(contentGroup, drag.nodeId, {
          x: drag.groupOriginalRect.x + ddx,
          y: drag.groupOriginalRect.y + ddy,
          width: drag.groupOriginalRect.width,
          height: drag.groupOriginalRect.height,
        });
      }
      // Drag-into-boundary highlight: only when dragging a node, not the
      // boundary itself (otherwise we'd light up the boundary we're
      // currently moving). The hit-test uses the primary node's centre.
      const dragSnapshot = drag;
      if (dragSnapshot.targetKind === "node" && dragSnapshot.boundaryBoxes.length > 0) {
        const primaryId = dragSnapshot.nodeId;
        const primary = dragSnapshot.movingNodes.find((m) => m.id === primaryId);
        if (primary?.originalRect) {
          const centre = {
            x: primary.originalRect.x + primary.originalRect.width / 2 + ddx,
            y: primary.originalRect.y + primary.originalRect.height / 2 + ddy,
          };
          paintDropTarget(contentGroup, findBoundaryAtPoint(dragSnapshot.boundaryBoxes, centre));
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
      if (drag.targetKind === "group") {
        applyEphemeralGroupRect(contentGroup, drag.nodeId, next);
      } else {
        applyEphemeralRect(contentGroup, drag.nodeId, next);
      }
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
    if (edgeLabelDrag && edgeLabelDrag.pointerId === event.pointerId) {
      finishEdgeLabelDrag(event);
      return;
    }
    if (edgeReorder && edgeReorder.pointerId === event.pointerId) {
      finishEdgeReorder(event);
      return;
    }
    if (fragmentReorder && fragmentReorder.pointerId === event.pointerId) {
      finishFragmentReorder(event);
      return;
    }
    if (fragmentResize && fragmentResize.pointerId === event.pointerId) {
      finishFragmentResize(event);
      return;
    }
    if (activationResize && activationResize.pointerId === event.pointerId) {
      finishActivationResize(event);
      return;
    }
    if (activationMove && activationMove.pointerId === event.pointerId) {
      finishActivationMove(event);
      return;
    }
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
      // Clear any drag-target highlight that pointermove may have set.
      paintDropTarget(contentGroup, null);

      const cursor = clientToLayout(event.clientX, event.clientY);
      const rawDx = cursor.x - finished.startLayout.x;
      const rawDy = cursor.y - finished.startLayout.y;
      const snap = getSnap();
      const useSnap = snap.enabled && !event.altKey;
      const ddx = useSnap ? snapValue(rawDx, snap) : rawDx;
      const ddy = useSnap ? snapValue(rawDy, snap) : rawDy;
      const diagram = bus.getState();

      if (finished.targetKind === "group" && finished.groupOriginalRect) {
        // Boundary move: one moveGroup + one moveNode per child, all in
        // a single undo frame so Cmd+Z reverts the whole bundle.
        const orig = finished.groupOriginalRect;
        const groupCmd = moveGroupCommand(
          finished.nodeId,
          { x: orig.x + ddx, y: orig.y + ddy, width: orig.width, height: orig.height },
          diagram,
        );
        const childMoves = finished.movingNodes.map((m) =>
          moveNodeCommand(m.id, { x: m.original.x + ddx, y: m.original.y + ddy }, diagram),
        );
        history.dispatchAll([groupCmd, ...childMoves]);
        return;
      }

      // One MoveNodeCommand per moving node, plus membership-change
      // commands when the final centre lands inside / outside a
      // boundary. Everything goes through `dispatchAll` so Cmd+Z reverts
      // the whole drag-into / drag-out-of gesture atomically.
      const cmds: Array<ReturnType<typeof moveNodeCommand>> = [];
      // Pre-compute parent group lookup so we can detect changes.
      const parentByChild = new Map<string, string>();
      for (const g of diagram.groups) {
        for (const childId of g.children) parentByChild.set(childId, g.id);
      }
      for (const m of finished.movingNodes) {
        cmds.push(moveNodeCommand(m.id, { x: m.original.x + ddx, y: m.original.y + ddy }, diagram));
        if (!m.originalRect || finished.boundaryBoxes.length === 0) continue;
        const centre = {
          x: m.originalRect.x + m.originalRect.width / 2 + ddx,
          y: m.originalRect.y + m.originalRect.height / 2 + ddy,
        };
        const targetGroupId = findBoundaryAtPoint(finished.boundaryBoxes, centre);
        const currentParent = parentByChild.get(m.id) ?? null;
        if (targetGroupId === currentParent) continue;
        if (currentParent) {
          const removeCmd = removeNodeFromGroupCommand(m.id, currentParent, diagram);
          if (removeCmd) cmds.push(removeCmd as never);
        }
        if (targetGroupId) {
          const addCmd = addNodeToGroupCommand(m.id, targetGroupId, diagram);
          if (addCmd) cmds.push(addCmd as never);
        }
      }
      if (cmds.length === 1) {
        history.dispatch(cmds[0]!);
      } else if (cmds.length > 1) {
        history.dispatchAll(cmds);
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
      if (finished.targetKind === "group") {
        history.dispatch(resizeGroupCommand(finished.nodeId, finalRect, diagram));
      } else {
        history.dispatch(resizeNodeCommand(finished.nodeId, finalRect, diagram));
      }
      return;
    }

    if (finished.mode === "connect") {
      finished.ghostLine?.remove();
      const dropTarget = svg.ownerDocument!.elementFromPoint(event.clientX, event.clientY);
      const targetGroup = findNodeAt(dropTarget);
      const targetId = targetGroup?.getAttribute("data-node-id") ?? null;
      if (targetId) {
        const diagram = bus.getState();
        // Sequence diagrams allow self-messages (drop on the same lifeline
        // creates a self-call rendered as a curved loopback arc). Other
        // diagram types still reject self-edges — they're modelling
        // mistakes there (a class associating with itself, etc.).
        if (targetId === finished.nodeId && diagram.type !== "sequence") return;
        const override = initial.getEdgeKindOverride?.();
        history.dispatch(
          addEdgeCommand({
            id: idFactory(),
            source: finished.nodeId,
            target: targetId,
            kind: override ?? defaultEdgeKindFor(diagram.type),
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
    // Boundary groups carry `data-group-id`; sequence ornaments carry
    // `data-fragment-id` / `data-note-id` / `data-divider-id`. We probe
    // each candidate selector — exactly one will exist for any id.
    // Painting `data-selected` on the ornament wrapper lets CSS reveal
    // its resize handles (fragment N/S handles only show while
    // selected, mirroring node behaviour).
    const target =
      contentGroup.querySelector(`g[data-node-id="${escaped}"]`) ??
      contentGroup.querySelector(`g[data-group-id="${escaped}"]`) ??
      contentGroup.querySelector(`g[data-fragment-id="${escaped}"]`) ??
      contentGroup.querySelector(`g[data-note-id="${escaped}"]`) ??
      contentGroup.querySelector(`g[data-divider-id="${escaped}"]`) ??
      contentGroup.querySelector(`g[data-activation-id="${escaped}"]`) ??
      contentGroup.querySelector(`g[data-edge-id="${escaped}"]`);
    if (target) target.setAttribute("data-selected", "true");
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

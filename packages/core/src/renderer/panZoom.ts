/**
 * Framework-agnostic pan / zoom controller for an `<svg>` host. Wires
 * wheel + drag + pinch and writes the current transform into a callback
 * (or directly onto a child `<g>` if `target` is supplied). Returns a
 * `dispose` function that removes every listener — call this from
 * `editor.destroy()` to avoid leaks.
 *
 * The controller never reaches into the diagram model — it operates
 * purely on screen coordinates. The vnode tree is responsible for
 * placing nodes inside a transformable group so the resulting matrix
 * can be applied verbatim.
 */
export interface PanZoomState {
  scale: number;
  translateX: number;
  translateY: number;
}

export interface PanZoomOptions {
  readonly minScale?: number;
  readonly maxScale?: number;
  readonly wheelStep?: number;
  /** Apply the latest transform to a child group automatically. */
  readonly target?: SVGGraphicsElement;
  /** Called after every state change (wheel / drag / pinch / setState). */
  readonly onChange?: (state: PanZoomState) => void;
}

export interface PanZoomController {
  getState(): PanZoomState;
  setState(next: Partial<PanZoomState>): void;
  reset(): void;
  /**
   * Multiplicative zoom from the viewport centre. Positive `factor`s
   * (e.g. 1.2) zoom in; values < 1 zoom out. Result is clamped to
   * `[minScale, maxScale]`.
   */
  zoomIn(factor?: number): void;
  zoomOut(factor?: number): void;
  /**
   * Fit a content bounding box (in layout coordinates) into the host
   * viewport. The matrix is recomputed so the entire box is visible
   * with `padding` px of margin and centred.
   */
  fitToContent(
    bbox: { x: number; y: number; width: number; height: number },
    viewport?: { width: number; height: number },
    padding?: number,
  ): void;
  /** Subscribe to state changes — fires after every wheel/drag/setState. */
  onChange(listener: (state: PanZoomState) => void): () => void;
  /** Replace the SVG group the transform is written onto (post-rerender). */
  rebindTarget(target: SVGGraphicsElement | null): void;
  dispose(): void;
}

const DEFAULT_OPTIONS: Required<Omit<PanZoomOptions, "target" | "onChange">> = {
  minScale: 0.2,
  maxScale: 4,
  wheelStep: 0.001,
};

export function createPanZoomController(
  host: HTMLElement | SVGElement,
  options: PanZoomOptions = {},
): PanZoomController {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let state: PanZoomState = { scale: 1, translateX: 0, translateY: 0 };
  let dragging = false;
  let lastPointer: { x: number; y: number } | null = null;
  const activePointers = new Map<number, { x: number; y: number }>();
  let pinchStartDistance: number | null = null;
  let pinchStartScale = 1;

  const listeners = new Set<(state: PanZoomState) => void>();

  let currentTarget: SVGGraphicsElement | undefined = config.target;

  const apply = (): void => {
    if (currentTarget) {
      currentTarget.setAttribute(
        "transform",
        `translate(${state.translateX} ${state.translateY}) scale(${state.scale})`,
      );
    }
    if (options.onChange) options.onChange(state);
    for (const listener of [...listeners]) listener(state);
  };

  const zoomAt = (cx: number, cy: number, factor: number): void => {
    const nextScale = clampScale(state.scale * factor);
    if (nextScale === state.scale) return;
    const ratio = nextScale / state.scale;
    state = {
      scale: nextScale,
      translateX: cx - (cx - state.translateX) * ratio,
      translateY: cy - (cy - state.translateY) * ratio,
    };
    apply();
  };

  const clampScale = (value: number): number =>
    Math.min(config.maxScale, Math.max(config.minScale, value));

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * config.wheelStep);
    const nextScale = clampScale(state.scale * factor);
    // Zoom around the cursor — keep the point under the pointer fixed.
    const rect = host.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    const ratio = nextScale / state.scale;
    state = {
      scale: nextScale,
      translateX: cx - (cx - state.translateX) * ratio,
      translateY: cy - (cy - state.translateY) * ratio,
    };
    apply();
  };

  const onPointerDown = (event: PointerEvent): void => {
    // Skip native pointerdown that originated inside an interactive
    // overlay (canvas toolbar, HUD slot button, etc.). React's synthetic
    // `stopPropagation` doesn't suppress the native event in time —
    // pointerdown still reaches this listener and would otherwise call
    // `setPointerCapture` on the host, hijacking pointerup so the
    // button never receives a real `click`.
    const target = event.target;
    if (target instanceof Element) {
      if (target.closest("[data-no-pan]") !== null) return;
      if (target.closest("button, input, select, textarea, [role='button']") !== null) return;
    }
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.size === 1) {
      dragging = true;
      lastPointer = { x: event.clientX, y: event.clientY };
      (host as Element).setPointerCapture?.(event.pointerId);
    } else if (activePointers.size === 2) {
      dragging = false;
      const [a, b] = [...activePointers.values()];
      pinchStartDistance = distanceBetween(a!, b!);
      pinchStartScale = state.scale;
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (dragging && lastPointer && activePointers.size === 1) {
      const dx = event.clientX - lastPointer.x;
      const dy = event.clientY - lastPointer.y;
      lastPointer = { x: event.clientX, y: event.clientY };
      state = { ...state, translateX: state.translateX + dx, translateY: state.translateY + dy };
      apply();
      return;
    }
    if (activePointers.size === 2 && pinchStartDistance) {
      const [a, b] = [...activePointers.values()];
      const distance = distanceBetween(a!, b!);
      const nextScale = clampScale(pinchStartScale * (distance / pinchStartDistance));
      state = { ...state, scale: nextScale };
      apply();
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    activePointers.delete(event.pointerId);
    if (activePointers.size === 0) {
      dragging = false;
      lastPointer = null;
      pinchStartDistance = null;
    } else if (activePointers.size === 1) {
      const remaining = [...activePointers.values()][0]!;
      dragging = true;
      lastPointer = remaining;
      pinchStartDistance = null;
    }
  };

  host.addEventListener("wheel", onWheel as EventListener, { passive: false });
  host.addEventListener("pointerdown", onPointerDown as EventListener);
  host.addEventListener("pointermove", onPointerMove as EventListener);
  host.addEventListener("pointerup", onPointerUp as EventListener);
  host.addEventListener("pointercancel", onPointerUp as EventListener);

  apply();

  return {
    getState(): PanZoomState {
      return { ...state };
    },
    setState(partial: Partial<PanZoomState>): void {
      state = {
        ...state,
        ...partial,
        scale: partial.scale !== undefined ? clampScale(partial.scale) : state.scale,
      };
      apply();
    },
    reset(): void {
      state = { scale: 1, translateX: 0, translateY: 0 };
      apply();
    },
    zoomIn(factor: number = 1.2): void {
      const rect = host.getBoundingClientRect?.();
      const cx = (rect?.width ?? 0) / 2;
      const cy = (rect?.height ?? 0) / 2;
      zoomAt(cx, cy, factor);
    },
    zoomOut(factor: number = 1.2): void {
      const rect = host.getBoundingClientRect?.();
      const cx = (rect?.width ?? 0) / 2;
      const cy = (rect?.height ?? 0) / 2;
      zoomAt(cx, cy, 1 / factor);
    },
    fitToContent(
      bbox: { x: number; y: number; width: number; height: number },
      viewport?: { width: number; height: number },
      padding: number = 24,
    ): void {
      const vp =
        viewport ??
        (() => {
          const rect = host.getBoundingClientRect?.();
          return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
        })();
      if (vp.width <= 0 || vp.height <= 0 || bbox.width <= 0 || bbox.height <= 0) return;
      const availableW = Math.max(vp.width - padding * 2, 1);
      const availableH = Math.max(vp.height - padding * 2, 1);
      const fitScale = clampScale(Math.min(availableW / bbox.width, availableH / bbox.height));
      const tx = (vp.width - bbox.width * fitScale) / 2 - bbox.x * fitScale;
      const ty = (vp.height - bbox.height * fitScale) / 2 - bbox.y * fitScale;
      state = { scale: fitScale, translateX: tx, translateY: ty };
      apply();
    },
    onChange(listener: (state: PanZoomState) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    rebindTarget(target: SVGGraphicsElement | null): void {
      currentTarget = target ?? undefined;
      // Re-apply current state to the freshly-bound group so the
      // visual stays in sync after a rerender.
      apply();
    },
    dispose(): void {
      host.removeEventListener("wheel", onWheel as EventListener);
      host.removeEventListener("pointerdown", onPointerDown as EventListener);
      host.removeEventListener("pointermove", onPointerMove as EventListener);
      host.removeEventListener("pointerup", onPointerUp as EventListener);
      host.removeEventListener("pointercancel", onPointerUp as EventListener);
      listeners.clear();
    },
  };
}

function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

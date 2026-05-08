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

  const apply = (): void => {
    if (config.target) {
      config.target.setAttribute(
        "transform",
        `translate(${state.translateX} ${state.translateY}) scale(${state.scale})`,
      );
    }
    if (options.onChange) options.onChange(state);
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
    dispose(): void {
      host.removeEventListener("wheel", onWheel as EventListener);
      host.removeEventListener("pointerdown", onPointerDown as EventListener);
      host.removeEventListener("pointermove", onPointerMove as EventListener);
      host.removeEventListener("pointerup", onPointerUp as EventListener);
      host.removeEventListener("pointercancel", onPointerUp as EventListener);
    },
  };
}

function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Keyboard-navigation adapter. Wraps `keydown` on a host element and
 * routes the canonical UML-Editor shortcuts to caller-provided callbacks.
 * The renderer never decides what "Delete" means in practice — that's
 * the editor's job (it dispatches a `RemoveNodeCommand` on the bus).
 *
 * Shortcuts (from the spec, § Keyboard):
 *
 *   Tab              → focus next node
 *   Shift+Tab        → focus previous node
 *   Arrow keys       → nudge selection by `step` px (Shift = 10× nudge)
 *   Delete / Bksp    → request removal of the focused node
 *   Enter            → request "edit label" mode
 *   Cmd/Ctrl+Z       → undo (consumed only when `onUndo` is provided)
 *   Cmd/Ctrl+Shift+Z → redo
 *   Cmd/Ctrl+= / +   → zoom in
 *   Cmd/Ctrl+-       → zoom out
 *   Cmd/Ctrl+0       → reset zoom (1:1)
 *   Cmd/Ctrl+1 / F   → fit diagram to viewport
 *   Cmd/Ctrl+L       → toggle lock (suspend canvas-side editing)
 */
export interface KeyboardNavigationCallbacks {
  readonly onTab?: (direction: "forward" | "backward") => void;
  readonly onArrow?: (direction: "up" | "down" | "left" | "right", scale: number) => void;
  readonly onDelete?: () => void;
  readonly onEnter?: () => void;
  readonly onUndo?: () => void;
  readonly onRedo?: () => void;
  readonly onZoomIn?: () => void;
  readonly onZoomOut?: () => void;
  readonly onZoomReset?: () => void;
  readonly onFitToView?: () => void;
  readonly onToggleLock?: () => void;
  readonly onSelectAll?: () => void;
  /** Cmd/Ctrl+Shift+G toggles the SVG grid layer (snap stays active). */
  readonly onToggleGrid?: () => void;
}

export interface KeyboardNavigationOptions extends KeyboardNavigationCallbacks {
  /** Default arrow-step in CSS pixels. */
  readonly step?: number;
}

export interface KeyboardNavigationController {
  dispose(): void;
}

export function attachKeyboardNavigation(
  host: HTMLElement | SVGElement,
  options: KeyboardNavigationOptions,
): KeyboardNavigationController {
  const step = options.step ?? 8;

  const handler = (event: KeyboardEvent): void => {
    if (event.key === "Tab") {
      if (!options.onTab) return;
      event.preventDefault();
      options.onTab(event.shiftKey ? "backward" : "forward");
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (!options.onDelete) return;
      event.preventDefault();
      options.onDelete();
      return;
    }
    if (event.key === "Enter") {
      if (!options.onEnter) return;
      event.preventDefault();
      options.onEnter();
      return;
    }
    if (event.key.startsWith("Arrow")) {
      if (!options.onArrow) return;
      event.preventDefault();
      const direction = event.key.slice(5).toLowerCase() as "up" | "down" | "left" | "right";
      options.onArrow(direction, event.shiftKey ? step * 10 : step);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && (event.key === "z" || event.key === "Z")) {
      if (event.shiftKey) {
        if (!options.onRedo) return;
        event.preventDefault();
        options.onRedo();
      } else {
        if (!options.onUndo) return;
        event.preventDefault();
        options.onUndo();
      }
      return;
    }
    if ((event.metaKey || event.ctrlKey) && (event.key === "=" || event.key === "+")) {
      if (!options.onZoomIn) return;
      event.preventDefault();
      options.onZoomIn();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "-") {
      if (!options.onZoomOut) return;
      event.preventDefault();
      options.onZoomOut();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "0") {
      if (!options.onZoomReset) return;
      event.preventDefault();
      options.onZoomReset();
      return;
    }
    if (
      ((event.metaKey || event.ctrlKey) && event.key === "1") ||
      (!event.metaKey && !event.ctrlKey && (event.key === "f" || event.key === "F"))
    ) {
      if (!options.onFitToView) return;
      event.preventDefault();
      options.onFitToView();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && (event.key === "l" || event.key === "L")) {
      if (!options.onToggleLock) return;
      event.preventDefault();
      options.onToggleLock();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && (event.key === "a" || event.key === "A")) {
      if (!options.onSelectAll) return;
      event.preventDefault();
      options.onSelectAll();
      return;
    }
    if (
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      (event.key === "g" || event.key === "G")
    ) {
      if (!options.onToggleGrid) return;
      event.preventDefault();
      options.onToggleGrid();
    }
  };

  host.addEventListener("keydown", handler as EventListener);
  return {
    dispose(): void {
      host.removeEventListener("keydown", handler as EventListener);
    },
  };
}

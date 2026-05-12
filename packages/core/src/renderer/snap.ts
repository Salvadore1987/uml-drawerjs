/**
 * Grid-snap helpers used by both move-drag and resize-drag in
 * `interactions.ts`. Snap is a *value* operation — it never mutates the
 * diagram; the caller chooses what to snap (a delta, a final coordinate,
 * a width). Splitting it out keeps the rule in one place and lets the
 * playground / unit tests share a single source of truth for the grid
 * step (default `12` px, matching the `--uml-canvas-grid-density` token
 * — both move-drag and resize-drag land on whole grid cells).
 */

export interface SnapOptions {
  readonly enabled: boolean;
  /** Grid step in layout pixels. Must be > 0 to take effect. */
  readonly step: number;
}

export const DEFAULT_SNAP: SnapOptions = { enabled: true, step: 12 };

/** Round a single value to the nearest multiple of the grid step. */
export function snapValue(value: number, options: SnapOptions = DEFAULT_SNAP): number {
  if (!options.enabled || options.step <= 0) return value;
  return Math.round(value / options.step) * options.step;
}

/** Snap a 2D point in-place; returns a new object. */
export function snapPoint(
  point: { readonly x: number; readonly y: number },
  options: SnapOptions = DEFAULT_SNAP,
): { x: number; y: number } {
  return { x: snapValue(point.x, options), y: snapValue(point.y, options) };
}

/** Snap a rectangle's origin and dimensions independently. */
export function snapRect(
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  options: SnapOptions = DEFAULT_SNAP,
): { x: number; y: number; width: number; height: number } {
  return {
    x: snapValue(rect.x, options),
    y: snapValue(rect.y, options),
    width: snapValue(rect.width, options),
    height: snapValue(rect.height, options),
  };
}

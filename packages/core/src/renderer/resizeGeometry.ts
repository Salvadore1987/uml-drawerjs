/**
 * Pure geometry of an 8-handle node resize. Given the original rectangle,
 * the side that was grabbed, and the pointer delta in layout coordinates,
 * compute the new rectangle and clamp it to a minimum size so the node
 * cannot collapse into a line.
 *
 * Splitting this out of `interactions.ts` keeps the rule unit-testable
 * without happy-dom / pointer events.
 */

export type ResizeSide = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ResizeOptions {
  /** Minimum width in layout pixels. Defaults to 80. */
  readonly minWidth?: number;
  /** Minimum height in layout pixels. Defaults to 40. */
  readonly minHeight?: number;
}

const DEFAULT_MIN_W = 80;
const DEFAULT_MIN_H = 40;

export function computeResizeRect(
  original: Rect,
  side: ResizeSide,
  dx: number,
  dy: number,
  options: ResizeOptions = {},
): Rect {
  const minW = options.minWidth ?? DEFAULT_MIN_W;
  const minH = options.minHeight ?? DEFAULT_MIN_H;
  let x = original.x;
  let y = original.y;
  let width = original.width;
  let height = original.height;

  // West sides shift x AND shrink width by the same delta (anchor stays
  // on the east edge). East sides only grow width. Same idea vertically.
  if (side === "w" || side === "nw" || side === "sw") {
    x = original.x + dx;
    width = original.width - dx;
  }
  if (side === "e" || side === "ne" || side === "se") {
    width = original.width + dx;
  }
  if (side === "n" || side === "nw" || side === "ne") {
    y = original.y + dy;
    height = original.height - dy;
  }
  if (side === "s" || side === "sw" || side === "se") {
    height = original.height + dy;
  }

  // Clamp width/height — and if a west/north side is being dragged past
  // the opposite edge, anchor the rect at the opposite edge so the user
  // never sees an inverted rectangle (Figma / draw.io behaviour).
  if (width < minW) {
    if (side === "w" || side === "nw" || side === "sw") {
      x = original.x + original.width - minW;
    }
    width = minW;
  }
  if (height < minH) {
    if (side === "n" || side === "nw" || side === "ne") {
      y = original.y + original.height - minH;
    }
    height = minH;
  }

  return { x, y, width, height };
}

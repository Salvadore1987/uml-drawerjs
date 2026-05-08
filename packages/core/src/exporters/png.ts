import type { Diagram } from "../model/types.js";
import { exportSvg } from "./svg.js";
import type { ExportSvgOptions } from "./svg.js";

/**
 * PNG export — rasterise the SVG via an off-screen `<canvas>`. The
 * render path lives entirely in the host's DOM (browsers / Electron) —
 * no native binary, no headless rendering server.
 *
 * The flow is:
 *   1. Build the SVG string from the renderer's vnode tree.
 *   2. Wrap in a data: URL and load through `new Image()`.
 *   3. Draw onto a fresh canvas of the SVG's `width`/`height`.
 *   4. Read back via `canvas.toBlob('image/png')`.
 *
 * Steps 2–4 use injectable hooks so unit tests can run without a real
 * browser — pass a stub `imageFactory` and `canvasFactory`.
 */
export interface ExportPngOptions extends ExportSvgOptions {
  /** Output PNG width in CSS pixels. Defaults to the SVG's declared width. */
  readonly width?: number;
  /** Output PNG height. Defaults to the SVG's declared height. */
  readonly height?: number;
  /** Devicepixel ratio. Defaults to `globalThis.devicePixelRatio` ?? 1. */
  readonly devicePixelRatio?: number;
  /** Test seam: factory for `HTMLImageElement`-shaped objects. */
  readonly imageFactory?: () => PngImage;
  /** Test seam: factory for `HTMLCanvasElement`-shaped objects. */
  readonly canvasFactory?: (width: number, height: number) => PngCanvas;
}

/** Minimal `HTMLImageElement` surface used by the exporter. */
export interface PngImage {
  src: string;
  width?: number;
  height?: number;
  onload: (() => void) | null;
  onerror: ((reason?: unknown) => void) | null;
}

/** Minimal `HTMLCanvasElement` surface used by the exporter. */
export interface PngCanvas {
  width: number;
  height: number;
  getContext(kind: "2d"): PngCanvasContext | null;
  toBlob(callback: (blob: Blob | null) => void, mimeType?: string): void;
}

export interface PngCanvasContext {
  scale(x: number, y: number): void;
  drawImage(image: PngImage, x: number, y: number, width: number, height: number): void;
}

/**
 * Render the diagram to a PNG `Blob`. Uses the renderer's vnode tree;
 * the resulting bitmap matches the on-screen SVG modulo browser
 * font-rendering. When the host has `globalThis.Image` /
 * `document.createElement('canvas')` available, no factories are needed.
 */
export async function exportPng(diagram: Diagram, options: ExportPngOptions = {}): Promise<Blob> {
  const svg = exportSvg(diagram, { ...options, includeXmlDeclaration: false });
  const dpr = options.devicePixelRatio ?? readDevicePixelRatio();
  const dimensions = parseSvgDimensions(svg, options);

  const image = (options.imageFactory ?? defaultImageFactory)();
  const canvas = (options.canvasFactory ?? defaultCanvasFactory)(
    dimensions.width * dpr,
    dimensions.height * dpr,
  );

  await loadImage(image, svgToDataUri(svg));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("exportPng: failed to acquire 2D canvas context");
  ctx.scale(dpr, dpr);
  ctx.drawImage(image, 0, 0, dimensions.width, dimensions.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("exportPng: canvas.toBlob returned null"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

function loadImage(image: PngImage, src: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    image.onload = (): void => resolve();
    image.onerror = (reason): void =>
      reject(reason instanceof Error ? reason : new Error("exportPng: image failed to load"));
    image.src = src;
  });
}

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function parseSvgDimensions(
  svg: string,
  options: ExportPngOptions,
): { width: number; height: number } {
  if (options.width !== undefined && options.height !== undefined) {
    return { width: options.width, height: options.height };
  }
  const widthMatch = /<svg[^>]*\bwidth="(\d+(?:\.\d+)?)"/u.exec(svg);
  const heightMatch = /<svg[^>]*\bheight="(\d+(?:\.\d+)?)"/u.exec(svg);
  return {
    width: options.width ?? Number(widthMatch?.[1] ?? 800),
    height: options.height ?? Number(heightMatch?.[1] ?? 600),
  };
}

function readDevicePixelRatio(): number {
  const dpr = (globalThis as { devicePixelRatio?: number }).devicePixelRatio;
  return typeof dpr === "number" && dpr > 0 ? dpr : 1;
}

function defaultImageFactory(): PngImage {
  const ImageCtor = (globalThis as { Image?: { new (): PngImage } }).Image;
  if (!ImageCtor) {
    throw new Error("exportPng: `Image` is not available — pass `imageFactory` explicitly");
  }
  return new ImageCtor();
}

function defaultCanvasFactory(width: number, height: number): PngCanvas {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc) {
    throw new Error("exportPng: `document` is not available — pass `canvasFactory` explicitly");
  }
  const canvas = doc.createElement("canvas") as unknown as PngCanvas;
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

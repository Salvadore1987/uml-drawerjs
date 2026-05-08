/**
 * Exporters / importers — interoperability layer over the AST.
 *
 *   - `.puml` — PlantUML text. `exportPuml` ⇄ `importPuml`. Importers run
 *     auto-layout when no `' @drawer:meta` annotations are present.
 *   - `.umljson` — native lossless format. `exportJson` / `importJson`
 *     round-trip byte-equal AST + layout + styles + schemaVersion.
 *   - `.svg` — `exportSvg` serialises the renderer's vnode tree to a
 *     standalone XML string. Optional `themeStyleBlock` makes the output
 *     viewable outside the editor host.
 *   - `.png` — `exportPng` rasterises the SVG via an off-screen canvas;
 *     hooks let tests run without a real DOM.
 */
export { exportPuml, importPuml } from "./puml.js";
export type { ImportPumlOptions, ImportPumlResult } from "./puml.js";

export { exportJson, importJson } from "./json.js";
export type {
  ExportJsonOptions,
  ImportJsonResult,
  ImportJsonSuccess,
  ImportJsonFailure,
} from "./json.js";

export { exportSvg, serializeVNode, buildThemeStyleBlock } from "./svg.js";
export type { ExportSvgOptions } from "./svg.js";

export { exportPng } from "./png.js";
export type { ExportPngOptions, PngImage, PngCanvas, PngCanvasContext } from "./png.js";

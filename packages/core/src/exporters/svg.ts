import type { Diagram } from "../model/types.js";
import { renderDiagram } from "../renderer/index.js";
import type { RendererOptions, VNode } from "../renderer/index.js";

/**
 * SVG export — serialise the renderer's vnode tree into an XML string.
 * No DOM is required: the serialiser walks the same `VNode` shape that
 * `mountSvg` consumes, escaping text and attribute values along the way.
 *
 * The output is portable: every visual property already references
 * `var(--uml-…)`, so callers must inline a stylesheet (or copy the
 * resolved theme tokens via `themeStyleBlock`) when the SVG is opened
 * outside a host that provides the contract — see `inlineThemeStyles`.
 */
export interface ExportSvgOptions extends RendererOptions {
  /**
   * Inline `<style>` block that maps every `--uml-*` token to a literal
   * value. When present, the exported SVG is self-contained and renders
   * the same in any viewer.
   */
  readonly themeStyleBlock?: string;
  /** Add the standalone XML prologue. Defaults to `false` for embeds. */
  readonly includeXmlDeclaration?: boolean;
}

export function exportSvg(diagram: Diagram, options: ExportSvgOptions = {}): string {
  const rendered = renderDiagram(diagram, options);
  const root = options.themeStyleBlock
    ? injectStyle(rendered.root, options.themeStyleBlock)
    : rendered.root;
  const svg = serializeVNode(injectXmlNs(root));
  return options.includeXmlDeclaration ? `<?xml version="1.0" encoding="UTF-8"?>\n${svg}` : svg;
}

/** Walk a vnode tree and emit a well-formed SVG string. */
export function serializeVNode(vnode: VNode): string {
  const attrs = serializeAttrs(vnode);
  const childParts: string[] = [];
  if (vnode.text !== undefined) childParts.push(escapeText(vnode.text));
  for (const child of vnode.children ?? []) childParts.push(serializeVNode(child));
  if (childParts.length === 0) return `<${vnode.tag}${attrs} />`;
  return `<${vnode.tag}${attrs}>${childParts.join("")}</${vnode.tag}>`;
}

function serializeAttrs(vnode: VNode): string {
  const out: string[] = [];
  if (vnode.attrs) {
    for (const [key, value] of Object.entries(vnode.attrs)) {
      if (value === undefined || value === false) continue;
      out.push(` ${key}="${escapeAttr(String(value))}"`);
    }
  }
  if (vnode.aria) {
    for (const [key, value] of Object.entries(vnode.aria)) {
      out.push(` ${key}="${escapeAttr(value)}"`);
    }
  }
  if (vnode.classes && vnode.classes.length > 0) {
    out.push(` class="${escapeAttr(vnode.classes.join(" "))}"`);
  }
  if (vnode.style) {
    out.push(` style="${escapeAttr(vnode.style)}"`);
  }
  return out.join("");
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/"/gu, "&quot;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

function escapeText(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

/**
 * Wrap the root with `xmlns` so the SVG opens correctly in browsers and
 * standalone viewers. The renderer doesn't add it — that would pollute
 * intra-app DOM where xmlns is already implied by namespace lookup.
 */
function injectXmlNs(root: VNode): VNode {
  const attrs = { xmlns: "http://www.w3.org/2000/svg", ...(root.attrs ?? {}) };
  return { ...root, attrs };
}

function injectStyle(root: VNode, css: string): VNode {
  const styleNode: VNode = {
    tag: "style",
    text: css,
  };
  return {
    ...root,
    children: [styleNode, ...(root.children ?? [])],
  };
}

/**
 * Build a `<style>` block that materialises every `--uml-*` token as a
 * literal value. Use this when the exported SVG must render outside the
 * editor host — e.g. when a downstream tool opens it in isolation.
 *
 * The map is intentionally typed as `Record<string, string>` rather than
 * the locked-down `tokens.json` shape so callers can override individual
 * tokens (skin colours, larger fonts) without round-tripping through the
 * theme package.
 */
export function buildThemeStyleBlock(tokens: Record<string, string>): string {
  const declarations = Object.entries(tokens)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");
  return `:root, [data-uml-host] {\n${declarations}\n}`;
}

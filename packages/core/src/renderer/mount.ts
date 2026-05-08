import type { VNode } from "./types.js";

/**
 * Walk a `VNode` tree and produce real SVG DOM. This is the single point
 * where the renderer touches `document` / `Element`; every per-kind
 * module returns plain data, so unit tests can keep DOM out of the way
 * unless they explicitly target `mount`.
 *
 * The mount returns a `dispose` function that detaches the produced root
 * from `host` — useful for `editor.destroy()` (Phase 10) and for tests
 * that mount/unmount in a loop.
 */
export interface MountResult {
  readonly root: SVGElement;
  dispose(): void;
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const HTML_TAGS = new Set(["div", "span"]); // for foreignObject children — none in MVP

export function mountSvg(host: Element, vnode: VNode): MountResult {
  const root = createElementFor(vnode);
  applyVNode(root, vnode);
  host.appendChild(root);
  return {
    root: root as SVGElement,
    dispose(): void {
      if (root.parentNode === host) host.removeChild(root);
    },
  };
}

/** Re-render: replace the existing root in `host` with a fresh tree. */
export function rerenderSvg(previous: MountResult, host: Element, vnode: VNode): MountResult {
  previous.dispose();
  return mountSvg(host, vnode);
}

function createElementFor(vnode: VNode): Element {
  const ownerDocument = resolveDocument();
  if (HTML_TAGS.has(vnode.tag)) {
    return ownerDocument.createElement(vnode.tag);
  }
  return ownerDocument.createElementNS(SVG_NAMESPACE, vnode.tag);
}

function applyVNode(element: Element, vnode: VNode): void {
  if (vnode.attrs) {
    for (const [key, value] of Object.entries(vnode.attrs)) {
      if (value === undefined || value === false) continue;
      element.setAttribute(key, String(value));
    }
  }
  if (vnode.aria) {
    for (const [key, value] of Object.entries(vnode.aria)) {
      element.setAttribute(key, value);
    }
  }
  if (vnode.classes && vnode.classes.length > 0) {
    element.setAttribute("class", vnode.classes.join(" "));
  }
  if (vnode.style) {
    element.setAttribute("style", vnode.style);
  }
  if (vnode.text !== undefined) {
    element.textContent = vnode.text;
  }
  for (const child of vnode.children ?? []) {
    const childEl = createElementFor(child);
    applyVNode(childEl, child);
    element.appendChild(childEl);
  }
}

function resolveDocument(): Document {
  // `document` lives on `globalThis` in both browsers and happy-dom; the
  // narrow guard helps when the renderer is imported into a non-DOM
  // context (e.g. SSR or pre-mount validation).
  const doc = (globalThis as { document?: Document }).document;
  if (!doc) {
    throw new Error("renderer/mount: `document` is not available in this environment");
  }
  return doc;
}

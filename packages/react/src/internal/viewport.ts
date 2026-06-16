/**
 * Convert the center of the canvas host (in host pixels) to diagram/layout
 * coordinates, given the current pan/zoom.
 *
 * The renderer keeps the SVG viewBox aligned 1:1 with host pixels and applies
 * the pan/zoom as `translate(translateX translateY) scale(scale)` on the
 * content group, so a diagram point maps to screen as `screen = diagram*scale
 * + translate`. Inverting for the host-center pixel gives the diagram point
 * currently shown at the middle of the visible workspace — the right spot to
 * drop a newly-added element so it isn't created off-screen.
 */
export function viewportCenterInDiagram(
  hostWidth: number,
  hostHeight: number,
  panZoom: { scale: number; translateX: number; translateY: number },
): { x: number; y: number } {
  const scale = panZoom.scale || 1;
  return {
    x: (hostWidth / 2 - panZoom.translateX) / scale,
    y: (hostHeight / 2 - panZoom.translateY) / scale,
  };
}

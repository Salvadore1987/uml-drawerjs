# Renderer & layout

The renderer is a small declarative SVG layer — no D3, no virtual DOM library. It works in two passes:

```
Diagram + coordinates  ──renderDiagram──►  VNode tree  ──mountSvg──►  SVGElement
```

`renderDiagram` is pure data: it returns a virtual SVG tree plus per-node geometry. `mountSvg` is the only place that touches `document` — pass it the host element where the SVG should appear. Tests run the first pass directly without any DOM.

## Layout

`runAutoLayout(diagram, options)` dispatches by diagram type:

- **Sequence** — custom synchronous algorithm: lifelines on a horizontal axis, messages stacked vertically. Deterministic across runs.
- **Everything else** — ELK layered. Loaded via `await import("elkjs/lib/elk.bundled.js")` only on the first call; the worker bundle never lands in the core barrel.
- **Fallback** — when ELK throws (loader missing, malformed input, no `Worker`), we fall back to a deterministic √N×√N grid so the editor never enters a non-rendering state.

ELK output writes coordinates into `metadata.layoutOverrides`. `applyLayoutCommand` is the recommended path so the change is undoable.

## Pan / zoom / minimap / keyboard

Framework-agnostic adapters, all in `@uml-drawer/core/renderer`:

| Adapter                    | Purpose                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `createPanZoomController`  | Wheel zoom around cursor, pointer drag, two-finger pinch, clamped to `[minScale, maxScale]`. |
| `attachKeyboardNavigation` | Tab / arrows / Delete / Enter / Cmd-Z / Cmd-Shift-Z routed to caller-provided callbacks.     |
| `renderMinimap`            | Scaled rect-per-node + viewport-rect from the current pan/zoom state.                        |
| `createSelectionModel`     | Headless `Set<id>` store with subscribe / set / clear / add / remove / toggle.               |
| `summarizeForA11y`         | Deterministic text summary used by `<svg role="img" aria-label="…" />`.                      |

## Performance

The renderer aims at **60 FPS pan/zoom on 200-node diagrams** and **parse + regenerate < 50 ms** on a typical diagram. Phase 14's `perf.test.ts` enforces the parse + regen budget; pan/zoom FPS is measured in browser-side Playwright runs (Phase 14b).

Bundle-size budgets (after brotli):

| Slice                        | Limit | Today    |
| ---------------------------- | ----- | -------- |
| `core` barrel (no ELK)       | 40 KB | 28.89 KB |
| `core/parser`                | 8 KB  | 2.88 KB  |
| `core/renderer`              | 10 KB | 4.74 KB  |
| `core/layout` (ELK external) | 3 KB  | 1.20 KB  |
| `react`                      | 10 KB | 4.05 KB  |
| `react/styles.css`           | 6 KB  | 1.84 KB  |

`pnpm size` enforces these.

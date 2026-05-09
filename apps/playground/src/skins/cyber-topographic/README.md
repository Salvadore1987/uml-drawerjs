# cyber-topographic — showcase skin

Reskins the `@uml-drawer/react` playground to the design language captured in [`docs/design/02-cyber-topographic.html`](../../../../../docs/design/02-cyber-topographic.html). Lives entirely in this folder; the library packages stay design-agnostic.

## Activate

Add the class to the playground root and import `index.css` at the entry:

```ts
import "./skins/cyber-topographic/index.css";
document.body.classList.add("cyber-topographic-skin");
```

Drop the class to fall back to the library's neutral defaults:

```ts
document.body.classList.remove("cyber-topographic-skin");
```

This is the design-agnostic guarantee made by Phase 1 and Phase 12.

## Files

| File              | Role                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `tokens.css`      | Internal skin palette (`--phos`, `--cyan`, `--magenta`, `--bg-0..2`, `--ink*`, `--line*`, `--glow-*`). |
| `mapping.css`     | Routes the internal tokens onto the library `--uml-*` contract.                                        |
| `fonts.css`       | Imports Sora + Azeret Mono and binds them to `--uml-font-sans` / `--uml-font-mono`.                    |
| `bg.css`          | Page-level decorative layers — radial gradient, topographic SVG mask, scanline grain.                  |
| `decorations.css` | Chrome decorations for the playground topbar / panels / HUD / command channel / statusbar.             |
| `index.css`       | Entry; imports all of the above in the correct order.                                                  |

## Mapping

```text
--uml-bg                ← --bg-0
--uml-bg-elevated       ← --bg-2
--uml-bg-overlay        ← --hud-bg
--uml-text              ← --ink
--uml-text-muted        ← --ink-soft
--uml-text-faint        ← --ink-dim
--uml-text-on-accent    ← --bg-0
--uml-border            ← --line-strong
--uml-border-subtle     ← --line
--uml-border-strong     ← --line-strong
--uml-accent            ← --phos
--uml-success           ← --phos
--uml-warning           ← --warn
--uml-danger            ← --magenta
--uml-info              ← --cyan
--uml-node-bg           ← --bg-2
--uml-node-text         ← --ink
--uml-node-border       ← --line-strong
--uml-node-stereotype   ← --ink-soft
--uml-edge-stroke       ← --line-strong
--uml-edge-arrow        ← --cyan
--uml-edge-label-bg     ← --bg-2
--uml-edge-label-text   ← --ink-soft
--uml-canvas-bg         ← --bg-1
--uml-canvas-grid       ← --grid-dot
--uml-selection-fill    ← --phos-soft
--uml-selection-stroke  ← --phos
--uml-selection-handle  ← --phos
--uml-focus-ring        ← --phos-line
--uml-font-sans         ← Sora
--uml-font-mono         ← Azeret Mono
```

## Reduced motion

`prefers-reduced-motion: reduce` zeroes `--topo-opacity`, `--scan-opacity`, and every `--glow-*` token, and disables the `live-dot` pulse animation. The structural layout is unchanged.

## Theme

`data-theme="dark" | "light"` on the playground root flips palettes synchronously. When `data-theme` is absent, `prefers-color-scheme: light` activates the light branch automatically.

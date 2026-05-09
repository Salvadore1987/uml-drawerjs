# Theming

UML Drawer JS is **design-agnostic by contract**. Every visual decision in the published packages flows through the `--uml-*` CSS custom property namespace — no hex literals, no skin-specific tokens, no font families baked into `packages/*`. CI enforces this on every push.

## Two layers

```
@uml-drawer/theme            ← contract.css + neutral defaults-{light,dark}.css
@uml-drawer/react            ← styles.css references only --uml-* tokens
your skin (downstream)       ← redeclares --uml-* under a class scope
```

The `cyber-topographic` skin in `apps/playground/src/skins/cyber-topographic/` is the reference implementation of "downstream skin".

## Activating the contract

Import the contract once at the entry of your application:

```ts
import "@uml-drawer/theme";
```

This pulls in `contract.css` plus both `defaults-{light,dark}.css`. The contract takes effect on any element carrying `data-uml-host` — typically the host the editor is mounted into. Theme switching is `data-theme="dark" | "light"` on that same element; in its absence, `prefers-color-scheme` decides.

## The contract

Categorical view of the variables you can override (full machine-readable list in `@uml-drawer/theme/tokens.json`):

| Group      | Variables                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------- |
| Surface    | `--uml-bg`, `--uml-bg-elevated`, `--uml-bg-overlay`                                            |
| Text       | `--uml-text`, `--uml-text-muted`, `--uml-text-faint`, `--uml-text-on-accent`                   |
| Border     | `--uml-border`, `--uml-border-subtle`, `--uml-border-strong`                                   |
| Semantic   | `--uml-accent`, `--uml-success`, `--uml-warning`, `--uml-danger`, `--uml-info`                 |
| Node       | `--uml-node-bg`, `--uml-node-text`, `--uml-node-border`, `--uml-node-stereotype`               |
| Edge       | `--uml-edge-stroke`, `--uml-edge-arrow`, `--uml-edge-label-bg`, `--uml-edge-label-text`        |
| Canvas     | `--uml-canvas-bg`, `--uml-canvas-grid`                                                         |
| Selection  | `--uml-selection-fill`, `--uml-selection-stroke`, `--uml-selection-handle`, `--uml-focus-ring` |
| Typography | `--uml-font-sans`, `--uml-font-mono`, `--uml-font-size-{sm,base,lg}`, `--uml-line-height`      |
| Geometry   | `--uml-radius-{sm,md,lg}`, `--uml-edge-stroke-width`, `--uml-canvas-grid-density`              |
| Motion     | `--uml-transition-theme`                                                                       |
| Shadow     | `--uml-shadow-sm`, `--uml-shadow-md`, `--uml-shadow-lg`                                        |

## Writing a skin

A skin is a CSS file that overrides `--uml-*` values inside a more specific selector. Activate by adding the class to the host:

```css
.my-skin {
  --uml-accent: #7c3aed;
  --uml-bg: #1f1730;
  --uml-bg-elevated: #2a2240;
  /* ... */
}
```

```ts
document.body.classList.add("my-skin");
```

Removing the class restores the neutral defaults. That's the design-agnostic guarantee verified by `pnpm guard:design-agnostic` in CI.

## Reduced motion

The library ships no animations and no glow / blur effects. The contract's only motion-related token is `--uml-transition-theme` (used on the `data-theme` swap), which is zeroed under `@media (prefers-reduced-motion: reduce)` automatically. Skins that introduce gloss are expected to gate every glow / blur / scanline behind the same media query.

## Reference: cyber-topographic skin

See [`apps/playground/src/skins/cyber-topographic/README.md`](https://github.com/Salvadore1987/uml-drawerjs/blob/main/apps/playground/src/skins/cyber-topographic/README.md) for a worked example, including the full mapping table from skin tokens onto the `--uml-*` contract.

# @uml-drawer/theme

Design-agnostic theming contract for [UML Drawer JS](../../README.md).

This package ships **only CSS variables** — there is no brand aesthetic here. Components in `@uml-drawer/core` and `@uml-drawer/react` consume `--uml-*` variables exclusively, so any visual identity (a "skin") is layered on top by overriding individual variables in a more specific scope.

## Install

```bash
pnpm add @uml-drawer/theme
```

## Usage

### Single-file import

```ts
import "@uml-drawer/theme";
// or, equivalently:
import "@uml-drawer/theme/contract.css";
```

`contract.css` declares every `--uml-*` token and `@import`s the neutral light/dark defaults.

### Granular imports

```ts
import "@uml-drawer/theme/contract.css";
import "@uml-drawer/theme/defaults-dark.css";
import "@uml-drawer/theme/defaults-light.css";
```

Useful if a downstream consumer wants to swap one of the defaults files for their own pre-baked palette.

### Markup

The theming contract scopes itself to elements carrying the `data-uml-host` attribute. Theme switching happens via `data-theme="light" | "dark"` on the same element.

```html
<div data-uml-host data-theme="dark">
  <!-- editor renders here -->
</div>
```

When `data-theme` is omitted, the active theme is auto-detected from `prefers-color-scheme`. A 0.3-second transition is applied to `background-color` and `color`; both transitions are disabled under `prefers-reduced-motion: reduce`.

## Tokens

The contract is split across the following categories:

| Category   | Examples                                                                         |
| ---------- | -------------------------------------------------------------------------------- |
| surface    | `--uml-bg`, `--uml-bg-elevated`, `--uml-bg-overlay`                              |
| text       | `--uml-text`, `--uml-text-muted`, `--uml-text-faint`, `--uml-text-on-accent`     |
| border     | `--uml-border`, `--uml-border-subtle`, `--uml-border-strong`                     |
| semantic   | `--uml-accent`, `--uml-success`, `--uml-warning`, `--uml-danger`, `--uml-info`   |
| node       | `--uml-node-bg`, `--uml-node-text`, `--uml-node-border`, `--uml-node-stereotype` |
| edge       | `--uml-edge-stroke`, `--uml-edge-arrow`, `--uml-edge-label-bg`, …                |
| canvas     | `--uml-canvas-bg`, `--uml-canvas-grid`, `--uml-canvas-grid-density`              |
| selection  | `--uml-selection-fill`, `--uml-selection-stroke`, `--uml-focus-ring`             |
| typography | `--uml-font-sans`, `--uml-font-mono`, `--uml-font-size-base`, …                  |
| radius     | `--uml-radius-sm`, `--uml-radius-md`, `--uml-radius-lg`                          |
| shadow     | `--uml-shadow-sm`, `--uml-shadow-md`, `--uml-shadow-lg`                          |
| motion     | `--uml-transition-theme`                                                         |

The full contract — names, types, descriptions, default values per theme — lives in [`src/tokens.json`](./src/tokens.json) and is published as `@uml-drawer/theme/tokens.json` for downstream tooling (skin validators, documentation site, design-tooling integrations).

## Writing a skin

A skin is a stylesheet that overrides `--uml-*` variables in a more specific scope than the default contract. The recommended pattern is to scope the override to a class on a wrapping element (not on `:root`, never on `<html>` directly):

```css
/* my-skin.css */
:where(.my-skin) [data-uml-host] {
  --uml-accent: #ff007a;
  --uml-bg: #0a0a0f;
  --uml-canvas-bg: #050507;
  --uml-edge-stroke: #ff007a;
}
```

```html
<body class="my-skin">
  <div data-uml-host data-theme="dark"><!-- editor --></div>
</body>
```

Use `:where()` for the skin selector to keep specificity at the same level as the base contract — otherwise per-instance `data-theme` overrides on the host become harder to layer.

The `apps/playground/src/skins/cyber-topographic` directory demonstrates a fully-styled skin built on top of this contract.

## What this package intentionally does NOT ship

- No font assets (Sora, Azeret Mono, etc.) — only neutral system stacks.
- No background SVGs or topographic patterns.
- No glow / blur / scanline effects.
- No brand-specific token names (`--phos`, `--cyan`, `--bg-0` belong to the cyber-topographic skin only).

These all live in showcase skins under `apps/playground`, never in this package.

## Build

```bash
pnpm --filter @uml-drawer/theme build
```

The build step copies `src/*.css` and `src/tokens.json` to `dist/`. There is no preprocessing — CSS files ship as authored.

## License

MIT

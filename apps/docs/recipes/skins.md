# Custom skins

Skin authors override the `--uml-*` contract from a single class scope. The cyber-topographic skin in the playground is the reference implementation.

## File layout

```
my-skin/
├── tokens.css         # internal palette
├── mapping.css        # routes internal tokens onto --uml-*
├── fonts.css          # optional
├── decorations.css    # page-level chrome
└── index.css          # entry that imports the others
```

## tokens.css

Declare your skin's internal palette under a single class. Keep these names skin-only — they must not leak into the library.

```css
.my-skin {
  --brand-primary: #7c3aed;
  --brand-bg: #1f1730;
  --brand-bg-elevated: #2a2240;
  --brand-text: #efe6ff;
  --brand-line: rgba(255, 255, 255, 0.12);
}

.my-skin[data-theme="light"] {
  --brand-bg: #faf5ff;
  --brand-bg-elevated: #ffffff;
  --brand-text: #1f1730;
  --brand-line: rgba(31, 23, 48, 0.12);
}
```

## mapping.css

Route the internal tokens onto the contract:

```css
.my-skin {
  --uml-bg: var(--brand-bg);
  --uml-bg-elevated: var(--brand-bg-elevated);
  --uml-text: var(--brand-text);
  --uml-accent: var(--brand-primary);
  --uml-border: var(--brand-line);
  --uml-node-bg: var(--brand-bg-elevated);
  --uml-node-text: var(--brand-text);
  --uml-edge-stroke: var(--brand-line);
  /* … */
}
```

The full list of `--uml-*` tokens lives in `@uml-drawer/theme/tokens.json`.

## Activation

Add the class to the host element (typically `<body>`) and import the entry CSS:

```ts
import "./my-skin/index.css";
document.body.classList.add("my-skin");
```

Removing the class restores the library's neutral defaults — that is the design-agnostic guarantee verified by `pnpm guard:design-agnostic` in CI.

## Reduced motion

If your skin introduces glow / blur / scanline / gradient effects, gate them behind `@media (prefers-reduced-motion: reduce)`:

```css
@media (prefers-reduced-motion: reduce) {
  .my-skin {
    --my-glow: none;
    /* zero out any animated gloss tokens */
  }
}
```

## Reference: cyber-topographic

See [`apps/playground/src/skins/cyber-topographic/`](https://github.com/Salvadore1987/uml-drawerjs/tree/main/apps/playground/src/skins/cyber-topographic) for a worked example that includes Sora + Azeret Mono fonts, a topographic SVG mask, and a scanline grain layer.

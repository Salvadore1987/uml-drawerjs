# `@uml-drawer/theme`

Design-agnostic theming contract. Pure CSS — no JS code, no functions.

## Files

| Subpath                                | Purpose                                                                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `@uml-drawer/theme/contract.css`       | Declares every `--uml-*` custom property under `[data-uml-host]` with default values.                                              |
| `@uml-drawer/theme/defaults-dark.css`  | Neutral dark palette, applied via `[data-uml-host][data-theme="dark"]` and via `prefers-color-scheme` when `data-theme` is absent. |
| `@uml-drawer/theme/defaults-light.css` | Neutral light palette, mirrored.                                                                                                   |
| `@uml-drawer/theme/index.css`          | Convenience entry: `@import`s the three above in order.                                                                            |
| `@uml-drawer/theme/tokens.json`        | Machine-readable contract — `{ name, default, description }` per token.                                                            |

## Usage

```ts
import "@uml-drawer/theme"; // pulls in index.css
```

Or pin individual files for narrower bundles:

```css
@import "@uml-drawer/theme/contract.css";
@import "@uml-drawer/theme/defaults-dark.css";
```

## tokens.json

```ts
import tokens from "@uml-drawer/theme/tokens.json";
for (const { name, default: value, description } of tokens) {
  // generate docs / dev tools / runtime token inspectors
}
```

The contract is documented inline in [`contract.css`](https://github.com/Salvadore1987/uml-drawerjs/blob/main/packages/theme/src/contract.css). The full categorical view lives on the [Theming](../theming) page.

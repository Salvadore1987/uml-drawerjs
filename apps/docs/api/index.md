# API Reference

UML Drawer JS publishes four packages. The reference here is hand-curated for the load-bearing entry points; full TypeDoc-generated reference follows post-1.0 (it auto-regenerates from the source `.d.ts` on every release).

| Package                                           | Subpaths                                                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [`@uml-drawer/core`](./core)                      | `/model`, `/commands`, `/history`, `/parser`, `/generator`, `/validators`, `/layout`, `/renderer`, `/exporters`, `/editor` |
| [`@uml-drawer/react`](./react)                    | Top-level barrel + `/styles.css`                                                                                           |
| [`@uml-drawer/codemirror-plantuml`](./codemirror) | `/language`, `/highlight`, `/lint`, `/autocomplete`, `/snippets`                                                           |
| [`@uml-drawer/theme`](./theme)                    | `/contract.css`, `/defaults-light.css`, `/defaults-dark.css`, `/index.css`, `/tokens.json`                                 |

## Conventions

- Every package is **ESM-only**, **`sideEffects: false`** (theme excluded — its sole export is CSS), and ships **`.d.ts`** declarations.
- Every public function is documented inline; refer to the source `.d.ts` for the authoritative signature until TypeDoc lands.
- IDs are **uuidv7** unless the caller passes a custom `idFactory` for deterministic tests.
- Import subpaths exist so consumers can pull in narrow pieces without dragging the whole barrel: `import { parsePlantUml } from "@uml-drawer/core/parser"` is preferred over `import { parsePlantUml } from "@uml-drawer/core"`.

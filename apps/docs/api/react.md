# `@uml-drawer/react`

Idiomatic React 18+ adapter. Components emit only structural CSS — every visual token resolves through `--uml-*`.

## Components

```tsx
<UmlEditor
  diagramType={DiagramType}
  value={string?}                // controlled
  defaultValue={string?}         // uncontrolled
  onChange={(event: EditorChangeEvent) => void}
  onValidate={(errors: readonly DiagramError[]) => void}
  theme={"dark" | "light" | "auto"}
  layout={{
    palette?: "left" | "right" | "hidden";
    props?:   "left" | "right" | "hidden";
    text?:    "top"  | "bottom" | "hidden";
  }}
  paletteFilter={(item: PaletteItem) => boolean}
  editorOptions={Partial<CreateEditorOptions>}
>
  {children}
</UmlEditor>
```

Sub-components — render any subset as children of `<UmlEditor>`:

| Component          | Props (selected)                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `<Canvas>`         | `ariaLabel?: string`. Registers its DOM as the host for the SVG renderer.                          |
| `<Palette>`        | `items?: PaletteItem[]`, `title?: string`. Filtered by editor's `diagramType` and `paletteFilter`. |
| `<PropsPanel>`     | `title?: string`. Inspector for the selected node / edge.                                          |
| `<TextEditor>`     | `title?: string`, `debounceMs?: number`. Plain-textarea editor.                                    |
| `<Outline>`        | `title?: string`. Tree summary with click-to-select.                                               |
| `<HUD>`            | `tl / tr / bl / br: ReactNode`. Four-corner overlay primitive.                                     |
| `<CommandChannel>` | `commands: Record<string, CommandHandler>`, `placeholder?`, `historyLimit?`.                       |
| `<Statusbar>`      | `label?: string`, `trailing?: ReactNode`.                                                          |

## Hooks

```ts
useEditor():                   EditorInstance | null;
useEditorState():              EditorChangeEvent;            // { text, ast, errors, command }
useDiagramErrors():            readonly DiagramError[];
useSelection():                readonly [ReadonlySet<string>, SelectionController];
```

`useEditor()` returns `null` during the brief window between `<UmlEditor>` mount and `<Canvas>` registering its host. Throws if called outside `<UmlEditor>`.

## Stylesheet

```ts
import "@uml-drawer/react/styles.css";
```

Imports `@uml-drawer/theme/contract.css` transitively. Class names follow the BEM-ish `uml-component__element--modifier` convention so skin authors can target them precisely.

## Default palette

Exported as `DEFAULT_PALETTE_ITEMS`. Each item is `{ kind, label, category, diagramTypes }`. Override the entire list via `<Palette items={...}>` or filter with the prop on `<UmlEditor>`.

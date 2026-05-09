# Getting Started

UML Drawer JS is a small set of npm packages plus a showcase playground. The most common path is to drop the React adapter into an existing app, but the framework-agnostic core is fully usable on its own.

## Install

```bash
pnpm add @uml-drawer/react @uml-drawer/core @uml-drawer/theme react react-dom
```

The CodeMirror language extension is optional — install it only if you want highlight + diagnostics + autocomplete on the textual side:

```bash
pnpm add @uml-drawer/codemirror-plantuml \
  @codemirror/state @codemirror/view @codemirror/language \
  @codemirror/lint @codemirror/autocomplete
```

## Mount an editor

```tsx
import { UmlEditor, Canvas, Palette, PropsPanel, TextEditor, Outline } from "@uml-drawer/react";
import "@uml-drawer/react/styles.css";

const initial = `@startuml
class Order
class Customer
Order --> Customer : owner
@enduml
`;

export function App() {
  return (
    <UmlEditor diagramType="class" defaultValue={initial} theme="auto">
      <Palette />
      <Canvas />
      <PropsPanel />
      <TextEditor />
      <Outline />
    </UmlEditor>
  );
}
```

`<UmlEditor>` is the root provider — it owns the underlying `createEditor` instance plus the shared selection model. The `<Canvas>` child registers its DOM as the host for the SVG renderer; until it mounts, the consumer hooks return `null` so you can safely render placeholder UI.

## Vanilla bootstrap

If you do not use React, drop down to `@uml-drawer/core`:

```ts
import { createEditor } from "@uml-drawer/core/editor";

const editor = createEditor(document.getElementById("host")!, {
  diagramType: "class",
  theme: "auto",
});

await editor.loadFromText(initial);
const svg = editor.exportSvg();
editor.destroy();
```

Every editor instance exposes `loadFromText`, `loadFromJson`, `exportText`, `exportSvg`, `exportPng`, `exportJson`, `undo`, `redo`, `runAutoLayout`, `applyTheme`, and `destroy`.

## Theme

Add `@uml-drawer/theme` to the page once. Themes follow `data-theme="dark" | "light"` on the host element, with `prefers-color-scheme` auto-detect when the attribute is absent.

```ts
import "@uml-drawer/theme";
```

See [Theming](./theming) for the full `--uml-*` contract and how to ship your own skin.

## Next steps

- [Concepts → AST as the source of truth](./concepts/ast)
- [Per-type guides](./diagrams/class)
- [Recipes](./recipes/)
- [Open the showcase Playground](/playground/)

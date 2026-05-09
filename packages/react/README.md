# @uml-drawer/react

Idiomatic React 18+ adapter for [UML Drawer JS](https://github.com/Salvadore1987/uml-drawerjs). Composes the framework-agnostic `@uml-drawer/core` editor behind controlled / uncontrolled `<UmlEditor>` plus drop-in sub-components for the canvas, palette, properties panel, text editor, outline, HUD, command channel, and status bar.

Design-agnostic: every visual decision flows through the `--uml-*` theming contract from `@uml-drawer/theme`. Skins live downstream.

## Install

```bash
pnpm add @uml-drawer/react @uml-drawer/core @uml-drawer/theme react react-dom
```

## Quick start

```tsx
import { UmlEditor, Canvas, Palette, PropsPanel, TextEditor } from "@uml-drawer/react";
import "@uml-drawer/react/styles.css";

export function App() {
  return (
    <UmlEditor
      diagramType="class"
      defaultValue={`@startuml\nclass Order\n@enduml\n`}
      onChange={(event) => console.log(event.text)}
    >
      <Palette />
      <Canvas />
      <PropsPanel />
      <TextEditor />
    </UmlEditor>
  );
}
```

## Components

| Component          | Purpose                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `<UmlEditor>`      | Root provider. Owns the `createEditor` instance + the shared `SelectionModel`.                                |
| `<Canvas>`         | Diagram surface. Registers its DOM as the host for the underlying SVG renderer.                               |
| `<Palette>`        | Categorised tool palette. Filtered by `diagramType` and the optional `paletteFilter` prop.                    |
| `<PropsPanel>`     | Inspector for the selected node / edge.                                                                       |
| `<TextEditor>`     | Plain-textarea editor for the PlantUML source — pair with `@uml-drawer/codemirror-plantuml` for highlighting. |
| `<Outline>`        | Tree summary of groups / nodes / edges with click-to-select.                                                  |
| `<HUD>`            | Four-corner overlay primitive. Slots: `tl`, `tr`, `bl`, `br`.                                                 |
| `<CommandChannel>` | Slash-command shell. Hosts register handlers per command name.                                                |
| `<Statusbar>`      | Diagram counts + validator severity totals.                                                                   |

## Hooks

```ts
const editor = useEditor(); // EditorInstance | null while booting
const event = useEditorState(); // { text, ast, errors, command }
const errors = useDiagramErrors(); // readonly DiagramError[]
const [selected, controller] = useSelection();
```

## Layout & filtering

```tsx
<UmlEditor
  diagramType="c4-container"
  layout={{ palette: "left", props: "right", text: "bottom" }}
  paletteFilter={(item) => item.kind !== "database"}
/>
```

`layout` accepts `"left" | "right" | "hidden"` for `palette` / `props`, and `"top" | "bottom" | "hidden"` for `text`. Slots map onto CSS grid areas — restyle skins by overriding the same `--uml-*` tokens the rest of the library consumes.

## Theming

The adapter's stylesheet only references `--uml-*` custom properties — no hex literals, no skin-specific tokens. Combined with `@uml-drawer/theme`, this gives you a design-agnostic baseline that downstream apps (the playground's cyber-topographic skin, your own brand) override by declaring more-specific `--uml-*` values inside a class scope.

## Status

Phase 12 of the [implementation plan](../../docs/IMPLEMENTATION_PLAN.md). The package builds, typechecks, and passes 17 unit tests under happy-dom. Storybook / Ladle preview pages and the Phase-14 design-agnostic guard tests on the _built_ CSS land alongside Phase 13/14.

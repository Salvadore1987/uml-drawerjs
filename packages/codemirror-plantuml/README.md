# @uml-drawer/codemirror-plantuml

CodeMirror 6 language extension for the PlantUML subset supported by [UML Drawer JS](https://github.com/Salvadore1987/uml-drawerjs).

- Syntax highlighting via `StreamLanguage` (Lezer migration tracked in [ADR-0003](../../docs/adr/0003-plantuml-subset.md)).
- Diagnostics + quick-fix actions through `@codemirror/lint`, reusing `@uml-drawer/core`'s validator stack.
- Context-aware autocomplete + snippets per diagram type.

## Install

```bash
pnpm add @uml-drawer/codemirror-plantuml @uml-drawer/core \
  @codemirror/state @codemirror/view @codemirror/language \
  @codemirror/lint @codemirror/autocomplete
```

## Quick start

```ts
import { EditorView, basicSetup } from "codemirror";
import { plantUmlSupport } from "@uml-drawer/codemirror-plantuml";

const view = new EditorView({
  parent: document.getElementById("editor")!,
  extensions: [basicSetup, plantUmlSupport({ diagramType: "class" })],
});
```

## Wiring quick-fixes to a CommandBus

Pass the editor instance from `@uml-drawer/core` so `apply()` actions
flow through your CQRS bus and are part of the undo stack:

```ts
import { createEditor } from "@uml-drawer/core";

const editor = createEditor(canvasHost, { diagramType: "class" });

const view = new EditorView({
  parent: textHost,
  extensions: [
    plantUmlSupport({
      diagramType: "class",
      dispatch: (command) => editor.dispatch(command),
      getDiagram: () => editor.getState(),
    }),
  ],
});
```

## Composing manually

```ts
import { plantUml, plantUmlLint, plantUmlCompletions } from "@uml-drawer/codemirror-plantuml";
import { autocompletion } from "@codemirror/autocomplete";

const extensions = [
  plantUml(),
  plantUmlLint({ diagramType: "class" }),
  autocompletion({
    override: [plantUmlCompletions({ diagramType: "class" })],
  }),
];
```

## Highlight class names

The default `HighlightStyle` maps every token to a stable class name so
hosts can override them through the `--uml-*` theming contract:

| Class                    | Token                                     |
| ------------------------ | ----------------------------------------- | ----- | --- | -------- |
| `uml-cm-keyword`         | `title`, `note`, `skinparam`, …           |
| `uml-cm-control-keyword` | `@startuml`, `@enduml`                    |
| `uml-cm-type`            | `class`, `interface`, `Person`, `Rel`, …  |
| `uml-cm-string`          | `"..."`                                   |
| `uml-cm-number`          | numeric literals                          |
| `uml-cm-comment`         | `' …`                                     |
| `uml-cm-meta`            | `' @drawer:meta {…}`                      |
| `uml-cm-arrow`           | `-->`, `--                                | >`, ` |     | --o{`, … |
| `uml-cm-operator`        | `()` / `,` / `:` / `{}` / `[]` / `<>` / ` | `     |
| `uml-cm-identifier`      | aliases / labels                          |
| `uml-cm-invalid`         | unterminated strings, etc.                |

## Status

Phase 11 of the [implementation plan](../../docs/IMPLEMENTATION_PLAN.md). The MVP rides on the hand-rolled core parser; the Lezer migration is tracked in ADR-0003 and will replace `StreamLanguage` without breaking the public surface.

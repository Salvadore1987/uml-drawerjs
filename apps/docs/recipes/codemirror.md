# CodeMirror integration

`@uml-drawer/codemirror-plantuml` ships highlighting, diagnostics with quick-fixes, and context-aware autocomplete on top of CodeMirror 6.

## Install

```bash
pnpm add @uml-drawer/codemirror-plantuml @uml-drawer/core \
  @codemirror/state @codemirror/view @codemirror/language \
  @codemirror/lint @codemirror/autocomplete
```

## One-call setup

```ts
import { EditorView, basicSetup } from "codemirror";
import { plantUmlSupport } from "@uml-drawer/codemirror-plantuml";

const view = new EditorView({
  parent: document.getElementById("editor"),
  doc: "@startuml\nclass Foo\n@enduml\n",
  extensions: [basicSetup, plantUmlSupport({ diagramType: "class" })],
});
```

`plantUmlSupport({...})` returns `[language, lint, autocompletion]`.

## Wiring quick-fixes to your CommandBus

Pass the editor instance from `@uml-drawer/core` so quick-fix actions flow through your CQRS bus and become part of the undo stack:

```ts
import { createEditor } from "@uml-drawer/core/editor";
import { plantUmlSupport } from "@uml-drawer/codemirror-plantuml";

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

## Manual composition

If you want finer control over which extensions land:

```ts
import { plantUml, plantUmlLint, plantUmlCompletions } from "@uml-drawer/codemirror-plantuml";
import { autocompletion } from "@codemirror/autocomplete";

const extensions = [
  plantUml(),
  plantUmlLint({ diagramType: "class" }),
  autocompletion({ override: [plantUmlCompletions({ diagramType: "class" })] }),
];
```

## Highlight class names

The default `HighlightStyle` maps each token onto stable class names; restyle them through your `--uml-*` tokens or a skin:

| Class                    | Token                                    |
| ------------------------ | ---------------------------------------- |
| `uml-cm-keyword`         | `title`, `note`, `skinparam`, …          |
| `uml-cm-control-keyword` | `@startuml`, `@enduml`                   |
| `uml-cm-type`            | `class`, `interface`, `Person`, `Rel`, … |
| `uml-cm-string`          | `"…"`                                    |
| `uml-cm-number`          | numeric literals                         |
| `uml-cm-comment`         | `' …`                                    |
| `uml-cm-meta`            | `' @drawer:meta {…}`                     |
| `uml-cm-arrow`           | `-->`, `--\|>`, `\|\|--o{`, …            |
| `uml-cm-operator`        | brackets / colons / pipes                |
| `uml-cm-identifier`      | aliases / labels                         |
| `uml-cm-invalid`         | unterminated strings, etc.               |

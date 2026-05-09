# `@uml-drawer/codemirror-plantuml`

CodeMirror 6 language support for the PlantUML subset. Lezer-grammar migration is tracked in [ADR-0003](https://github.com/Salvadore1987/uml-drawerjs/blob/main/docs/adr/0003-plantuml-subset.md); the public API survives that change.

## Top-level

```ts
plantUml():                                LanguageSupport;
plantUmlLanguage:                          Language;
plantUmlLint(opts: PlantUmlLintOptions):   Extension;
plantUmlCompletions(opts):                 CompletionSource;
plantUmlSupport(opts):                     Extension[];   // [language, lint, autocompletion]

plantUmlHighlightStyle, plantUmlHighlighting, highlightTags;
SNIPPETS_BY_DIAGRAM, snippetsFor(type);

computeDiagnostics(text, opts): Diagnostic[];   // pure — usable outside an EditorView
runLinter(view, opts): readonly Diagnostic[];
```

## `PlantUmlLintOptions`

```ts
interface PlantUmlLintOptions {
  diagramType: DiagramType;
  dispatch?: (command: Command) => void | boolean;
  getDiagram?: () => Diagram | null;
  delay?: number;
  idFactory?: () => string;
  transformDiagnostic?: (d: Diagnostic, e: DiagramError) => Diagnostic | null;
}
```

`dispatch` wires quick-fix actions to your `CommandBus`. `getDiagram` lets the linter operate on the live AST when the editor is attached, instead of the freshly-parsed snapshot.

## `PlantUmlAutocompleteOptions`

```ts
interface PlantUmlAutocompleteOptions {
  diagramType: DiagramType;
  getDiagram?: () => Diagram | null;
  idFactory?: () => string;
  extraCompletions?: readonly Completion[];
}
```

The completion source merges four buckets per diagram type: snippets, keywords, kinds, and live identifiers parsed from the buffer.

## Highlight class table

See the [CodeMirror integration recipe](../recipes/codemirror) for the full list of `uml-cm-*` class names.

import { EditorState } from "@codemirror/state";
import { highlightTree } from "@lezer/highlight";
import { describe, expect, it } from "vitest";

import { plantUmlHighlightStyle } from "./highlight.js";
import { plantUmlLanguage } from "./language.js";

interface HighlightedRun {
  text: string;
  classes: string;
}

/**
 * Tokenises `source` and returns the (text, class-name) runs the editor
 * would render. We rely on `highlightTree` so we exercise the same
 * pipeline CodeMirror uses for syntax highlighting, including the
 * StreamLanguage tokenTable mapping.
 */
function highlight(source: string): HighlightedRun[] {
  const state = EditorState.create({ doc: source, extensions: [plantUmlLanguage] });
  const tree = plantUmlLanguage.parser.parse(source);
  const runs: HighlightedRun[] = [];
  let cursor = 0;
  const emit = (from: number, to: number, classes: string): void => {
    if (from > cursor) runs.push({ text: source.slice(cursor, from), classes: "" });
    runs.push({ text: source.slice(from, to), classes });
    cursor = to;
  };
  highlightTree(tree, plantUmlHighlightStyle, emit);
  if (cursor < source.length) runs.push({ text: source.slice(cursor), classes: "" });
  void state;
  return runs;
}

function findRun(runs: HighlightedRun[], text: string): HighlightedRun | undefined {
  return runs.find((run) => run.text === text);
}

describe("StreamLanguage tokenizer — highlight classes", () => {
  it("classes are tagged as type names", () => {
    // Arrange & Act
    const runs = highlight("class Foo");

    // Assert
    expect(findRun(runs, "class")?.classes).toContain("uml-cm-type");
    expect(findRun(runs, "Foo")?.classes).toContain("uml-cm-identifier");
  });

  it("@startuml and @enduml are control keywords", () => {
    // Arrange & Act
    const runs = highlight("@startuml\nclass A\n@enduml\n");

    // Assert
    expect(findRun(runs, "@startuml")?.classes).toContain("uml-cm-control-keyword");
    expect(findRun(runs, "@enduml")?.classes).toContain("uml-cm-control-keyword");
  });

  it("classifies plain comments distinctly from meta comments", () => {
    // Arrange & Act
    const plain = highlight("' just a note");
    const meta = highlight(`' @drawer:meta {"layoutOverrides":{}}`);

    // Assert
    expect(plain.find((r) => r.text.startsWith("'"))?.classes).toContain("uml-cm-comment");
    expect(meta.find((r) => r.text.startsWith("'"))?.classes).toContain("uml-cm-meta");
  });

  it("strings are tagged regardless of contents", () => {
    // Arrange & Act
    const runs = highlight('System(s, "Banking System", "Core")');

    // Assert
    const stringRun = runs.find((r) => r.text.includes("Banking System"));
    expect(stringRun?.classes).toContain("uml-cm-string");
  });

  it("arrow operators are tagged together", () => {
    // Arrange & Act
    const runs = highlight("Foo --|> Bar");

    // Assert
    expect(findRun(runs, "--|>")?.classes).toContain("uml-cm-arrow");
  });

  it("unterminated strings emit an invalid token", () => {
    // Arrange & Act
    const runs = highlight('Foo "open');

    // Assert
    const opened = runs.find((r) => r.text.startsWith('"'));
    expect(opened?.classes).toContain("uml-cm-invalid");
  });

  it("C4 macros are recognised as type names", () => {
    // Arrange & Act
    const runs = highlight('Person(p, "User")');

    // Assert
    expect(findRun(runs, "Person")?.classes).toContain("uml-cm-type");
  });
});

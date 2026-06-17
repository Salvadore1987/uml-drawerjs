import { CompletionContext } from "@codemirror/autocomplete";
import type { CompletionResult } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { plantUmlCompletions } from "./autocomplete.js";
import { plantUmlLanguage } from "./language.js";

function complete(
  doc: string,
  pos: number,
  diagramType: Parameters<typeof plantUmlCompletions>[0]["diagramType"],
  options: Partial<Parameters<typeof plantUmlCompletions>[0]> = {},
): CompletionResult | null {
  const state = EditorState.create({ doc, extensions: [plantUmlLanguage] });
  const context = new CompletionContext(state, pos, true);
  const result = plantUmlCompletions({ diagramType, ...options })(context);
  if (result instanceof Promise) {
    throw new Error("plantUmlCompletions returned a promise — tests assume sync resolution");
  }
  return result;
}

function labels(result: CompletionResult | null): string[] {
  return (result?.options ?? []).map((opt) => opt.label).sort();
}

describe("plantUmlCompletions — context-aware proposals", () => {
  it("offers class-diagram keywords", () => {
    // Arrange
    const doc = "@startuml\n";

    // Act
    const result = complete(doc, doc.length, "class");

    // Assert
    const ls = labels(result);
    expect(ls).toContain("class");
    expect(ls).toContain("interface");
    expect(ls).toContain("enum");
  });

  it("offers C4 macros for c4-context", () => {
    // Arrange
    const doc = "@startuml\n";

    // Act
    const result = complete(doc, doc.length, "c4-context");

    // Assert
    const ls = labels(result);
    expect(ls).toContain("Person");
    expect(ls).toContain("System");
    expect(ls).toContain("Rel");
  });

  it("c4-component layers contain Component on top of Container/Context", () => {
    // Arrange & Act
    const result = complete("@startuml\n", "@startuml\n".length, "c4-component");

    // Assert
    const ls = labels(result);
    expect(ls).toContain("Component");
    expect(ls).toContain("Container");
    expect(ls).toContain("System");
  });

  it("includes ER keywords for er diagrams", () => {
    // Arrange & Act
    const result = complete("@startuml\n", "@startuml\n".length, "er");

    // Assert
    expect(labels(result)).toContain("entity");
  });

  it("surfaces existing node ids parsed from the document", () => {
    // Arrange
    const doc = "@startuml\nclass Foo\nclass Bar\n@enduml\n";

    // Act
    const result = complete(doc, doc.length, "class");

    // Assert — the parser-allocated ids are uuidv7-ish; we cannot predict
    // them, so we check via the `detail` field which always carries the
    // node's label.
    const variableCompletions = (result?.options ?? []).filter(
      (opt) => opt.type === "variable" && typeof opt.detail === "string",
    );
    expect(variableCompletions.length).toBeGreaterThanOrEqual(2);
    const details = variableCompletions.map((opt) => opt.detail).join(" | ");
    expect(details).toContain("Foo");
    expect(details).toContain("Bar");
  });

  it("snippets are present (e.g. @startuml scaffold)", () => {
    // Arrange & Act
    const result = complete("", 0, "class");

    // Assert
    expect(labels(result)).toContain("@startuml");
  });

  it("returns null when there's nothing to match and the trigger is implicit", () => {
    // Arrange
    const state = EditorState.create({ doc: "Foo ", extensions: [plantUmlLanguage] });
    const implicit = new CompletionContext(state, 4, /* explicit */ false);

    // Act
    const result = plantUmlCompletions({ diagramType: "class" })(implicit);

    // Assert
    expect(result).toBeNull();
  });

  it("proposes SQL types in ER attribute-type position", () => {
    // Arrange — cursor right after the colon of an entity column.
    const doc = '@startuml\nentity "Order" as order {\n  total : NUM\n}\n@enduml\n';
    const pos = doc.indexOf("NUM") + "NUM".length;

    // Act
    const result = complete(doc, pos, "er");

    // Assert — SQL vocabulary, not keywords/snippets.
    const ls = labels(result);
    expect(ls).toContain("NUMERIC");
    expect(ls).toContain("VARCHAR");
    expect(ls).not.toContain("entity");
    expect(ls).not.toContain("@startuml");
  });

  it("tolerates the PK marker before an ER column name", () => {
    // Arrange
    const doc = '@startuml\nentity "Order" as order {\n  * id : UUI\n}\n@enduml\n';
    const pos = doc.indexOf("UUI") + "UUI".length;

    // Act
    const result = complete(doc, pos, "er");

    // Assert
    expect(labels(result)).toContain("UUID");
  });

  it("proposes Java types in class attribute-type position", () => {
    // Arrange
    const doc = "@startuml\nclass Order {\n  total : Big\n}\n@enduml\n";
    const pos = doc.indexOf("Big") + "Big".length;

    // Act
    const result = complete(doc, pos, "class");

    // Assert — Java vocabulary, and crucially NOT the SQL-only types.
    const ls = labels(result);
    expect(ls).toContain("BigDecimal");
    expect(ls).not.toContain("VARCHAR");
  });

  it("extraCompletions are appended", () => {
    // Arrange & Act
    const result = complete("@startuml\n", "@startuml\n".length, "class", {
      extraCompletions: [{ label: "TeamSpecificMacro", type: "function" }],
    });

    // Assert
    expect(labels(result)).toContain("TeamSpecificMacro");
  });
});

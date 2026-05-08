import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createEmptyDiagram } from "../model/factory.js";
import type { Diagram, DiagramType } from "../model/types.js";
import { parsePlantUml } from "../parser/parse.js";
import { generatePlantUml } from "./index.js";
import { aliasFromId, escapeStringLiteral } from "./format.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "../../__fixtures__");

const FIXTURES: { type: DiagramType; folder: string }[] = [
  { type: "c4-context", folder: "c4-context" },
  { type: "c4-container", folder: "c4-container" },
  { type: "c4-component", folder: "c4-component" },
  { type: "class", folder: "class" },
  { type: "er", folder: "er" },
  { type: "sequence", folder: "sequence" },
];

function makeCounterFactory(): () => string {
  let counter = 0;
  return () => `id-${++counter}`;
}

describe("generatePlantUml — fixture round-trip", () => {
  for (const fixture of FIXTURES) {
    it(`gen→parse for the ${fixture.type} fixture preserves the AST`, () => {
      // Arrange
      const pumlPath = resolve(fixtureRoot, fixture.folder, "sample.puml");
      const text = readFileSync(pumlPath, "utf8");
      const first = parsePlantUml(text, {
        diagramType: fixture.type,
        diagramId: "diagram-fixture",
        idFactory: makeCounterFactory(),
      });
      expect(first.errors).toEqual([]);

      // Act — generate from the parsed AST then re-parse
      const generated = generatePlantUml(first.ast);
      const second = parsePlantUml(generated, {
        diagramType: fixture.type,
        diagramId: "diagram-fixture",
        idFactory: makeCounterFactory(),
      });

      // Assert
      expect(second.errors).toEqual([]);
      expect(second.ast).toEqual(first.ast);
    });
  }
});

describe("generatePlantUml — output shape", () => {
  it("wraps every diagram with @startuml / @enduml and trailing newline", () => {
    // Arrange
    const diagram = createEmptyDiagram("class");

    // Act
    const text = generatePlantUml(diagram);

    // Assert
    expect(text.startsWith("@startuml\n")).toBe(true);
    expect(text.endsWith("@enduml\n")).toBe(true);
  });

  it("emits the title on its own `title` line when present", () => {
    // Arrange
    const diagram: Diagram = {
      ...createEmptyDiagram("class"),
      title: "My Title",
    };

    // Act
    const text = generatePlantUml(diagram);

    // Assert
    expect(text).toContain("\ntitle My Title\n");
  });

  it("encodes layoutOverrides + styles as a single ' @drawer:meta line", () => {
    // Arrange
    const diagram: Diagram = {
      ...createEmptyDiagram("class"),
      styles: { foo: { fill: "#abc" } },
      metadata: {
        schemaVersion: "0.1.0",
        layoutOverrides: { foo: { x: 1, y: 2 } },
      },
    };

    // Act
    const text = generatePlantUml(diagram);

    // Assert
    const metaLine = text.split("\n").find((line) => line.startsWith("' @drawer:meta "));
    expect(metaLine).toBeDefined();
    const payload: unknown = JSON.parse(metaLine?.replace("' @drawer:meta ", "") ?? "{}");
    expect(payload).toEqual({
      layoutOverrides: { foo: { x: 1, y: 2 } },
      styles: { foo: { fill: "#abc" } },
    });
  });

  it("re-emits metadata.opaque lines verbatim before @enduml", () => {
    // Arrange — round-trip a fixture that exercises the opaque bucket
    const text = `@startuml\nclass Foo\nnote left of Foo : a note\n@enduml\n`;
    const { ast } = parsePlantUml(text, {
      diagramType: "class",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    });
    expect(ast.metadata.opaque).toEqual(["note left of Foo : a note"]);

    // Act
    const generated = generatePlantUml(ast);

    // Assert
    expect(generated).toContain("note left of Foo : a note\n@enduml");
  });

  it("normalises arrow direction for class inheritance (parses <|-- as --|>)", () => {
    // Arrange
    const text = `@startuml\nclass Parent\nclass Child\nParent <|-- Child\n@enduml\n`;
    const { ast } = parsePlantUml(text, {
      diagramType: "class",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    });

    // Act
    const generated = generatePlantUml(ast);

    // Assert — the canonical forward form is emitted
    expect(generated).toContain("--|>");
    expect(generated).not.toContain("<|--");
  });

  it("preserves the `[tech]` suffix on C4 Rel labels by promoting it to a 4th argument", () => {
    // Arrange
    const text =
      `@startuml\n` +
      `Person(p, "Person")\n` +
      `System(s, "System")\n` +
      `Rel(p, s, "Uses", "HTTPS")\n` +
      `@enduml\n`;
    const { ast } = parsePlantUml(text, {
      diagramType: "c4-context",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    });
    // Sanity-check the parser still encodes tech as `[HTTPS]` in the label.
    expect(ast.edges[0]?.label).toBe("Uses [HTTPS]");

    // Act
    const generated = generatePlantUml(ast);

    // Assert — the suffix is decoded back into the 4-arg form. The
    // generator uses the label as alias when it's a clean `\w+`, so the
    // emitted aliases are `Person` and `System` (not their AST ids).
    expect(generated).toContain('Rel(Person, System, "Uses", "HTTPS")');
  });
});

describe("generator format helpers", () => {
  it("aliasFromId produces a \\w+ identifier prefixed with `n_`", () => {
    // Arrange / Act / Assert
    expect(aliasFromId("id-42")).toBe("n_id_42");
    expect(aliasFromId("n_already")).toBe("n_already");
    expect(aliasFromId("01ARZ-uuid")).toBe("n_01ARZ_uuid");
  });

  it("escapeStringLiteral escapes backslash and double-quote", () => {
    // Arrange / Act / Assert
    expect(escapeStringLiteral('say "hi"')).toBe('say \\"hi\\"');
    expect(escapeStringLiteral("path\\to\\file")).toBe("path\\\\to\\\\file");
  });
});

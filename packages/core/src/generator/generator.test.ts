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

  it("emits Person_Ext for kind 'person-external' (round-trip with the parser)", () => {
    // Arrange
    const text = `@startuml\nPerson_Ext(a, "Auditor", "Reviews")\n@enduml\n`;
    const { ast } = parsePlantUml(text, {
      diagramType: "c4-context",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    });
    expect(ast.nodes[0]?.kind).toBe("person-external");

    // Act
    const generated = generatePlantUml(ast);

    // Assert — the original alias `a` is preserved on the node and
    // round-trips through the generator (instead of being re-derived
    // from the label as it was before alias persistence).
    expect(generated).toContain('Person_Ext(a, "Auditor", "Reviews")');
  });

  it("emits SystemDb for a database without technology, ContainerDb when one is set", () => {
    // Arrange — Context-level SystemDb (no tech). Single-word labels keep
    // the alias predictable: the generator uses the label verbatim as
    // alias when it matches `\w+` (see existing tech-suffix test).
    const ctxText = `@startuml\nSystemDb(d, "AuditLog")\n@enduml\n`;
    const ctxAst = parsePlantUml(ctxText, {
      diagramType: "c4-context",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    }).ast;
    const ctnText = `@startuml\nContainerDb(d, "Postgres", "PostgreSQL")\n@enduml\n`;
    const ctnAst = parsePlantUml(ctnText, {
      diagramType: "c4-container",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    }).ast;

    // Act
    const ctxOut = generatePlantUml(ctxAst);
    const ctnOut = generatePlantUml(ctnAst);

    // Assert — original alias `d` survives the round-trip on both tiers.
    expect(ctxOut).toContain('SystemDb(d, "AuditLog")');
    expect(ctnOut).toContain('ContainerDb(d, "Postgres", "PostgreSQL")');
  });

  it("emits Container_Ext for kind 'container-external' (round-trip)", () => {
    // Arrange
    const text = `@startuml\nContainer_Ext(pay, "Payments", "REST", "Third-party")\n@enduml\n`;
    const { ast } = parsePlantUml(text, {
      diagramType: "c4-container",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    });
    expect(ast.nodes[0]?.kind).toBe("container-external");

    // Act
    const generated = generatePlantUml(ast);

    // Assert — original alias `pay` round-trips through the generator.
    expect(generated).toContain('Container_Ext(pay, "Payments", "REST", "Third-party")');
  });

  it("emits SystemQueue / ContainerQueue based on the technology field", () => {
    // Arrange
    const ctxText = `@startuml\nSystemQueue(q, "Events")\n@enduml\n`;
    const ctxAst = parsePlantUml(ctxText, {
      diagramType: "c4-context",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    }).ast;
    const ctnText = `@startuml\nContainerQueue(q, "Events", "Kafka")\n@enduml\n`;
    const ctnAst = parsePlantUml(ctnText, {
      diagramType: "c4-container",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    }).ast;

    // Act
    const ctxOut = generatePlantUml(ctxAst);
    const ctnOut = generatePlantUml(ctnAst);

    // Assert — original alias `q` survives on both tiers.
    expect(ctxOut).toContain('SystemQueue(q, "Events")');
    expect(ctnOut).toContain('ContainerQueue(q, "Events", "Kafka")');
  });

  it("uses an explicit group.alias as the boundary alias in the generated PlantUML", () => {
    // Arrange — round-trip through the parser to lock the alias on the group
    const text = `@startuml\nSystem_Boundary(bank, "Internet Banking System") {\n  Container(api, "API")\n}\n@enduml\n`;
    const { ast } = parsePlantUml(text, {
      diagramType: "c4-container",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    });
    expect(ast.groups[0]?.alias).toBe("bank");

    // Act — rename the alias as a user would via the props panel
    const renamed = {
      ...ast,
      groups: ast.groups.map((g, i) => (i === 0 ? { ...g, alias: "bank2" } : g)),
    };
    const generated = generatePlantUml(renamed);

    // Assert
    expect(generated).toContain('System_Boundary(bank2, "Internet Banking System")');
  });

  it("preserves authored aliases across parse → generate (no n_<id> regression on round-trip)", () => {
    // Arrange — the playground's default c4-container sample uses readable
    // aliases (`customer`, `web`, `api`, `db`, `events`, `mail`, `payments`).
    // A regression here surfaces immediately: the user opens the editor,
    // touches nothing, exports, and aliases collapse to label-derived or
    // `n_id_N` values — making the export unreadable and breaking
    // hand-edited `Rel(...)` statements that targeted the original names.
    const text =
      `@startuml\n` +
      `title Online Banking — Containers\n` +
      `\n` +
      `Person(customer, "Customer", "Personal banking customer")\n` +
      `System_Ext(mail, "E-mail System", "Sends notifications")\n` +
      `System_Boundary(bank, "Internet Banking System") {\n` +
      `  Container(web, "Web App", "JS / SPA", "Delivers static content")\n` +
      `  Container(api, "API", "Java/Spring", "Provides banking functionality")\n` +
      `  ContainerDb(db, "Database", "PostgreSQL", "Stores accounts, transactions")\n` +
      `  ContainerQueue(events, "Domain Events", "Kafka", "Publishes account events")\n` +
      `}\n` +
      `Container_Ext(payments, "Payments Gateway", "REST", "Third-party processor")\n` +
      `\n` +
      `Rel(customer, web, "Uses", "HTTPS")\n` +
      `Rel(api, db, "Reads/Writes", "JDBC")\n` +
      `@enduml\n`;
    const { ast } = parsePlantUml(text, {
      diagramType: "c4-container",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    });

    // Act
    const generated = generatePlantUml(ast);

    // Assert — every authored alias survives, both at the macro definition
    // site and inside Rel(...) references.
    for (const alias of ["customer", "mail", "bank", "web", "api", "db", "events", "payments"]) {
      expect(generated).toMatch(new RegExp(`\\(${alias}[,)]`));
    }
    expect(generated).toContain("Rel(customer, web,");
    expect(generated).toContain("Rel(api, db,");
    expect(generated).not.toMatch(/\bn_id_\d+\b/); // no synthesized aliases
  });

  it("emits a C4-PlantUML !include line for each c4 tier so output renders in vanilla PlantUML", () => {
    // Arrange — minimum viable diagram per tier; we only assert the include
    // line, so the body content doesn't matter.
    const ctx = generatePlantUml(createEmptyDiagram("c4-context"));
    const ctn = generatePlantUml(createEmptyDiagram("c4-container"));
    const cmp = generatePlantUml(createEmptyDiagram("c4-component"));
    const cls = generatePlantUml(createEmptyDiagram("class"));

    // Assert — include lines appear immediately after @startuml (line 2)
    // and only on c4-* diagrams.
    expect(ctx.split("\n")[1]).toBe("!include <C4/C4_Context>");
    expect(ctn.split("\n")[1]).toBe("!include <C4/C4_Container>");
    expect(cmp.split("\n")[1]).toBe("!include <C4/C4_Component>");
    expect(cls).not.toContain("!include");
  });

  it("drops the empty third argument from Rel(...) when there's neither label nor tech", () => {
    // Arrange
    const text =
      `@startuml\n` +
      `Person(p, "Person")\n` +
      `System(s, "System")\n` +
      `Rel(p, s, "")\n` +
      `@enduml\n`;
    const { ast } = parsePlantUml(text, {
      diagramType: "c4-context",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    });

    // Act
    const generated = generatePlantUml(ast);

    // Assert — clean two-arg form, no `Rel(p, s, "")` artefact. Original
    // aliases `p` and `s` survive the round-trip.
    expect(generated).toContain("Rel(p, s)\n");
    expect(generated).not.toMatch(/Rel\([^()]+,\s*[^()]+,\s*""\)/);
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
    // original aliases `p` and `s` round-trip through the parser.
    expect(generated).toContain('Rel(p, s, "Uses", "HTTPS")');
  });

  it("round-trips class members, generics, enum literals and per-end multiplicity", () => {
    // Arrange — exercises every classic-UML extension landed in PR-1..3.
    const text =
      `@startuml\n` +
      `interface Repository<T> {\n` +
      `  {abstract} +findById(id: String): T\n` +
      `}\n` +
      `abstract class AbstractEntity {\n` +
      `  {abstract} +validate(): void\n` +
      `  {static} +nextId(): String\n` +
      `}\n` +
      `enum AccountStatus {\n` +
      `  ACTIVE\n` +
      `  FROZEN\n` +
      `  CLOSED\n` +
      `}\n` +
      `class Account {\n` +
      `  -balance: Decimal {readonly}\n` +
      `  {static} +VERSION: String = "1.0"\n` +
      `}\n` +
      `class Transaction\n` +
      `Account "1" *-- "0..*" Transaction : holds\n` +
      `@enduml\n`;
    const first = parsePlantUml(text, {
      diagramType: "class",
      diagramId: "diag",
      idFactory: makeCounterFactory(),
    });
    expect(first.errors).toEqual([]);

    // Act
    const generated = generatePlantUml(first.ast);
    const second = parsePlantUml(generated, {
      diagramType: "class",
      diagramId: "diag",
      idFactory: makeCounterFactory(),
    });

    // Assert — round-trip is loss-free.
    expect(second.errors).toEqual([]);
    expect(second.ast).toEqual(first.ast);

    // Spot-check the generator emitted UML modifiers and per-end multiplicity.
    expect(generated).toContain("interface Repository<T> {");
    expect(generated).toContain("abstract class AbstractEntity {");
    expect(generated).toContain("{abstract} +validate(): void");
    expect(generated).toContain("{static} +nextId(): String");
    expect(generated).toContain("-balance: Decimal {readonly}");
    expect(generated).toContain('{static} +VERSION: String = "1.0"');
    expect(generated).toMatch(/Account "1" \*-- "0\.\.\*" Transaction : holds/u);
  });

  it("round-trips class-diagram packages with contained classes", () => {
    // Arrange
    const text =
      `@startuml\n` +
      `package "com.bank" {\n` +
      `  class Account\n` +
      `  class Transaction\n` +
      `}\n` +
      `class Audit\n` +
      `@enduml\n`;
    const first = parsePlantUml(text, {
      diagramType: "class",
      diagramId: "diag",
      idFactory: makeCounterFactory(),
    });
    expect(first.errors).toEqual([]);
    expect(first.ast.groups).toHaveLength(1);
    expect(first.ast.groups[0]?.children).toHaveLength(2);

    // Act
    const generated = generatePlantUml(first.ast);
    const second = parsePlantUml(generated, {
      diagramType: "class",
      diagramId: "diag",
      idFactory: makeCounterFactory(),
    });

    // Assert — package + contained classes survive a full round-trip.
    expect(second.errors).toEqual([]);
    expect(second.ast.groups).toHaveLength(1);
    expect(second.ast.groups[0]?.label).toBe("com.bank");
    expect(generated).toContain('package "com.bank" {');
    expect(generated).toContain("  class Account");
    expect(generated).toContain("  class Transaction");
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

describe("formatDiagramMeta + parser round-trip", () => {
  it("preserves layoutOverrides across generate → parse despite fresh ids", () => {
    // Arrange — parse a seed, then attach overrides keyed by the current
    // (counter-allocated) node ids.
    const seed = `@startuml
!include <C4/C4_Context>
Person(customer, "Customer", "")
System(orderSystem, "Order Platform", "")
Rel(customer, orderSystem, "Uses")
@enduml`;
    const first = parsePlantUml(seed, {
      diagramType: "c4-context",
      diagramId: "diag",
      idFactory: makeCounterFactory(),
    });
    expect(first.errors).toEqual([]);

    const overrides: Record<string, { x: number; y: number }> = {};
    first.ast.nodes.forEach((node, i) => {
      overrides[node.id] = { x: 10 * (i + 1), y: 20 * (i + 1) };
    });
    const withOverrides: Diagram = {
      ...first.ast,
      metadata: { ...first.ast.metadata, layoutOverrides: overrides },
    };

    // Act — generate (alias-keyed meta) then reparse with a *fresh* factory
    // so the second parse allocates different ids for the same aliases.
    const generated = generatePlantUml(withOverrides);
    const second = parsePlantUml(generated, {
      diagramType: "c4-context",
      diagramId: "diag",
      idFactory: makeCounterFactory(),
    });

    // Assert — wire payload is alias-keyed, and every node keeps its coord.
    const metaLine = generated.split("\n").find((line) => line.includes("@drawer:meta"));
    expect(metaLine).toBeDefined();
    expect(metaLine).toContain('"customer"');
    expect(metaLine).not.toContain('"id-');

    expect(second.errors).toEqual([]);
    const after = second.ast.metadata.layoutOverrides ?? {};
    expect(Object.keys(after)).toHaveLength(Object.keys(overrides).length);
    for (const node of second.ast.nodes) {
      const before = first.ast.nodes.find((n) => n.alias === node.alias);
      expect(before).toBeDefined();
      if (before) {
        expect(after[node.id]).toEqual(overrides[before.id]);
      }
    }
  });
});

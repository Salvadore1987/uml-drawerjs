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

describe("generatePlantUml — ER composition / aggregation", () => {
  it("round-trips ER composition (`*--`) and aggregation (`o--`)", () => {
    // Arrange
    const source = `@startuml
entity Order
entity OrderLine
entity Tag
Order *-- OrderLine
Order o-- Tag
@enduml
`;
    const first = parsePlantUml(source, {
      diagramType: "er",
      diagramId: "diagram-er-comp",
      idFactory: makeCounterFactory(),
    });
    expect(first.errors).toEqual([]);

    // Act
    const generated = generatePlantUml(first.ast);

    // Assert — arrows survive generation and the AST round-trips.
    expect(generated).toContain("*--");
    expect(generated).toContain("o--");
    const second = parsePlantUml(generated, {
      diagramType: "er",
      diagramId: "diagram-er-comp",
      idFactory: makeCounterFactory(),
    });
    expect(second.errors).toEqual([]);
    expect(second.ast).toEqual(first.ast);
  });
});

describe("generatePlantUml — ER foreign-key references", () => {
  it("round-trips `<<FK Target.col>>` on a column", () => {
    // Arrange
    const source = `@startuml
entity Customer {
  * id : UUID
}
entity Order {
  + customer_id : UUID <<FK Customer.id>>
}
@enduml
`;
    const first = parsePlantUml(source, {
      diagramType: "er",
      diagramId: "diagram-er-fk",
      idFactory: makeCounterFactory(),
    });
    expect(first.errors).toEqual([]);

    // Act
    const generated = generatePlantUml(first.ast);

    // Assert
    expect(generated).toContain("<<FK Customer.id>>");
    const second = parsePlantUml(generated, {
      diagramType: "er",
      diagramId: "diagram-er-fk",
      idFactory: makeCounterFactory(),
    });
    expect(second.errors).toEqual([]);
    expect(second.ast).toEqual(first.ast);
  });
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

  it("emits SystemDb_Ext / ContainerDb_Ext / ComponentDb_Ext for kind 'database-external' by tier", () => {
    // Arrange — the same external-database kind must round-trip to the
    // tier-correct macro: SystemDb_Ext on Context, ContainerDb_Ext on
    // Container, ComponentDb_Ext on Component.
    const ctxText = `@startuml\nSystemDb_Ext(d, "Legacy")\n@enduml\n`;
    const ctxParsed = parsePlantUml(ctxText, {
      diagramType: "c4-context",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    });
    const ctnText = `@startuml\nContainerDb_Ext(d, "Legacy", "Oracle")\n@enduml\n`;
    const ctnParsed = parsePlantUml(ctnText, {
      diagramType: "c4-container",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    });
    const cmpText = `@startuml\nComponentDb_Ext(d, "Legacy", "Oracle")\n@enduml\n`;
    const cmpParsed = parsePlantUml(cmpText, {
      diagramType: "c4-component",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    });

    // Assert — all three parse to the single `database-external` kind.
    expect(ctxParsed.ast.nodes[0]?.kind).toBe("database-external");
    expect(ctnParsed.ast.nodes[0]?.kind).toBe("database-external");
    expect(cmpParsed.ast.nodes[0]?.kind).toBe("database-external");

    // Act
    const ctxOut = generatePlantUml(ctxParsed.ast);
    const ctnOut = generatePlantUml(ctnParsed.ast);
    const cmpOut = generatePlantUml(cmpParsed.ast);

    // Assert — each tier regenerates its own external-database macro.
    expect(ctxOut).toContain('SystemDb_Ext(d, "Legacy")');
    expect(ctnOut).toContain('ContainerDb_Ext(d, "Legacy", "Oracle")');
    expect(cmpOut).toContain('ComponentDb_Ext(d, "Legacy", "Oracle")');
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

  it('always emits Rel(from, to, "label") — even with empty label — so plantuml.com\'s bundled C4 stdlib resolves the macro', () => {
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

    // Assert — the empty third argument is kept so the upstream Rel macro's
    // parameter count matches. Original aliases `p` and `s` survive too.
    expect(generated).toContain('Rel(p, s, "")');
    expect(generated).not.toMatch(/Rel\(p, s\)\s*$/m);
  });

  it("round-trips the C4 Rel technology argument through the dedicated field", () => {
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
    // The parser splits action name and technology into separate fields.
    expect(ast.edges[0]?.label).toBe("Uses");
    expect(ast.edges[0]?.technology).toBe("HTTPS");

    // Act
    const generated = generatePlantUml(ast);

    // Assert — the technology field re-emits the 4-arg form. The original
    // aliases `p` and `s` round-trip through the parser.
    expect(generated).toContain('Rel(p, s, "Uses", "HTTPS")');
  });

  it("emits $tags plus a single AddRelTag('async') header before the first Rel", () => {
    // Arrange
    const text =
      `@startuml\n` +
      `Person(p, "Person")\n` +
      `System(s, "System")\n` +
      `Rel(p, s, "Uses", "HTTPS", $tags="async")\n` +
      `@enduml\n`;
    const { ast } = parsePlantUml(text, {
      diagramType: "c4-context",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    });

    // Act
    const generated = generatePlantUml(ast);

    // Assert — tags re-emit on the Rel; the dashed line-style declaration
    // appears exactly once, ahead of the Rel lines (C4-PlantUML scoping).
    expect(generated).toContain('Rel(p, s, "Uses", "HTTPS", $tags="async")');
    const declarations = generated.match(/AddRelTag\("async", \$lineStyle = DashedLine\(\)\)/g);
    expect(declarations).toHaveLength(1);
    expect(generated.indexOf('AddRelTag("async"')).toBeLessThan(generated.indexOf("Rel(p, s"));
  });

  it("treats tags: [] as absent — no $tags argument, no AddRelTag header", () => {
    // Arrange — commands clear tags with [] (applyPatch skips undefined).
    const ast: Diagram = {
      id: "d",
      type: "c4-context",
      nodes: [
        { id: "p", kind: "person", label: "Person", alias: "p" },
        { id: "s", kind: "system", label: "System", alias: "s" },
      ],
      edges: [{ id: "e1", source: "p", target: "s", kind: "uses", label: "Uses", tags: [] }],
      groups: [],
      metadata: { schemaVersion: "1.0.0", layoutOverrides: {} },
    };

    // Act
    const generated = generatePlantUml(ast);

    // Assert
    expect(generated).toContain('Rel(p, s, "Uses")');
    expect(generated).not.toContain("$tags");
    expect(generated).not.toContain("AddRelTag");
  });

  it("async Rel text is a generator fixed point (parse → generate → parse → generate)", () => {
    // Arrange
    const text =
      `@startuml\n` +
      `AddRelTag("async", $lineStyle = DashedLine())\n` +
      `Person(p, "Person")\n` +
      `System(s, "System")\n` +
      `Rel(p, s, "Uses", "HTTPS", $tags="async+critical")\n` +
      `@enduml\n`;
    const first = parsePlantUml(text, {
      diagramType: "c4-context",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    });

    // Act
    const generatedOnce = generatePlantUml(first.ast);
    const second = parsePlantUml(generatedOnce, {
      diagramType: "c4-context",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    });
    const generatedTwice = generatePlantUml(second.ast);

    // Assert — no duplicate AddRelTag, tags preserved verbatim.
    expect(second.errors).toEqual([]);
    expect(second.ast.edges[0]?.tags).toEqual(["async", "critical"]);
    expect(generatedTwice).toBe(generatedOnce);
  });

  it("decodes the legacy `[tech]` label suffix into a 4-arg Rel (back-compat)", () => {
    // Arrange — an AST authored before the `technology` field existed, where
    // technology still rides as a `[HTTPS]` suffix on the label.
    const ast: Diagram = {
      id: "d",
      type: "c4-context",
      nodes: [
        { id: "p", kind: "person", label: "Person", alias: "p" },
        { id: "s", kind: "system", label: "System", alias: "s" },
      ],
      edges: [{ id: "e1", source: "p", target: "s", kind: "uses", label: "Uses [HTTPS]" }],
      groups: [],
      metadata: { schemaVersion: "1.0.0", layoutOverrides: {} },
    };

    // Act
    const generated = generatePlantUml(ast);

    // Assert
    expect(generated).toContain('Rel(p, s, "Uses", "HTTPS")');
  });

  it("round-trips class members, enum literals and per-end multiplicity", () => {
    // Arrange — exercises every classic-UML extension landed in PR-1..3.
    const text =
      `@startuml\n` +
      `interface Repository {\n` +
      `  {abstract} +findById(id: String): String\n` +
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
    expect(generated).toContain("interface Repository {");
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
    expect(generated).toMatch(/package "com\.bank" as \w+ \{/u);
    expect(generated).toContain("  class Account");
    expect(generated).toContain("  class Transaction");
  });

  it("emits nested packages when a package contains another package", () => {
    // Arrange — declared nesting: outer package contains an inner package
    // which contains the class. The parser records this via openGroupStack.
    const text =
      `@startuml\n` +
      `package "outer" {\n` +
      `  package "inner" {\n` +
      `    class Account\n` +
      `  }\n` +
      `}\n` +
      `@enduml\n`;
    const first = parsePlantUml(text, {
      diagramType: "class",
      diagramId: "diag",
      idFactory: makeCounterFactory(),
    });
    expect(first.errors).toEqual([]);
    const outer = first.ast.groups.find((g) => g.label === "outer");
    const inner = first.ast.groups.find((g) => g.label === "inner");
    expect(outer?.children).toContain(inner!.id);

    // Act — the generator must nest `inner` inside `outer`, not emit siblings.
    const generated = generatePlantUml(first.ast);

    // Assert — `inner` is indented inside `outer`, and the class inside `inner`.
    expect(generated).toMatch(
      /package "outer" as \w+ \{\n {2}package "inner" as \w+ \{\n {4}class Account\n {2}\}\n\}/u,
    );
    // Round-trips: re-parsing keeps the nesting.
    const second = parsePlantUml(generated, {
      diagramType: "class",
      diagramId: "diag",
      idFactory: makeCounterFactory(),
    });
    const outer2 = second.ast.groups.find((g) => g.label === "outer");
    const inner2 = second.ast.groups.find((g) => g.label === "inner");
    expect(outer2?.children).toContain(inner2!.id);
  });

  it("infers package nesting from geometry when only sibling packages are declared", () => {
    // Arrange — flat packages (as the buggy generator used to emit) plus
    // layout overrides whose boxes show `inner` sitting inside `outer`. This
    // mirrors a saved-then-reloaded diagram whose logical nesting was lost.
    const text =
      `@startuml\n` +
      `' @drawer:meta {"layoutOverrides":{"outer":{"x":0,"y":0,"width":600,"height":400},"inner":{"x":40,"y":40,"width":300,"height":200}}}\n` +
      `package "outer" as outer {\n` +
      `}\n` +
      `package "inner" as inner {\n` +
      `  class Account\n` +
      `}\n` +
      `@enduml\n`;

    // Act
    const { ast, errors } = parsePlantUml(text, {
      diagramType: "class",
      diagramId: "diag",
      idFactory: makeCounterFactory(),
    });

    // Assert — geometry inference re-parented `inner` under `outer`.
    expect(errors).toEqual([]);
    const outer = ast.groups.find((g) => g.label === "outer");
    const inner = ast.groups.find((g) => g.label === "inner");
    expect(outer?.children).toContain(inner!.id);
    const generated = generatePlantUml(ast);
    expect(generated).toMatch(
      /package "outer" as \w+ \{\n {2}package "inner" as \w+ \{\n {4}class Account\n {2}\}\n\}/u,
    );
  });

  it("round-trips a resized package's layout override (size survives re-parse)", () => {
    // Arrange — a package with an explicit {x,y,width,height} override (as a
    // user resize produces) plus one contained class.
    const groupId = "0198gggg-1111-7000-8000-gggggggggggg";
    const nodeId = "0198nnnn-2222-7000-8000-nnnnnnnnnnnn";
    const diagram = createEmptyDiagram("class");
    diagram.nodes.push({ id: nodeId, kind: "class", label: "Account" });
    diagram.groups.push({ id: groupId, kind: "package", label: "com.bank", children: [nodeId] });
    diagram.metadata.layoutOverrides = {
      [groupId]: { x: 50, y: 60, width: 400, height: 300 },
      [nodeId]: { x: 80, y: 120 },
    };

    // Act
    const generated = generatePlantUml(diagram);
    const { ast } = parsePlantUml(generated, {
      diagramType: "class",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    });

    // Assert — the package is emitted with a stable alias and its size maps
    // back onto the re-parsed group id (not orphaned → no default-size revert).
    expect(generated).toMatch(/package "com\.bank" as \w+ \{/u);
    const group = ast.groups[0];
    expect(group?.label).toBe("com.bank");
    expect(ast.metadata.layoutOverrides?.[group!.id]).toEqual({
      x: 50,
      y: 60,
      width: 400,
      height: 300,
    });
    // Round-trip is stable.
    expect(generatePlantUml(ast)).toBe(generated);
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

  it("preserves edgeLayoutOverrides across generate → parse despite fresh edge ids", () => {
    // Arrange — seed an AST with one Rel, attach an edge-label override
    // keyed by the current edge id, then re-parse with a fresh factory to
    // simulate a real reload (edge id is reallocated).
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
    const originalEdgeId = first.ast.edges[0]?.id;
    expect(originalEdgeId).toBeDefined();
    if (!originalEdgeId) return;

    const withOverride: Diagram = {
      ...first.ast,
      metadata: {
        ...first.ast.metadata,
        edgeLayoutOverrides: {
          [originalEdgeId]: { labelOffsetX: 36, labelOffsetY: -24 },
        },
      },
    };

    // Act
    const generated = generatePlantUml(withOverride);
    const second = parsePlantUml(generated, {
      diagramType: "c4-context",
      diagramId: "diag",
      idFactory: makeCounterFactory(),
    });

    // Assert — alias-pair encoding is on the wire, and the reparsed edge
    // sees the override remapped to its new id.
    const metaLine = generated.split("\n").find((line) => line.includes("@drawer:meta"));
    expect(metaLine).toBeDefined();
    expect(metaLine).toContain('"customer->orderSystem"');

    expect(second.errors).toEqual([]);
    const reparsedEdgeId = second.ast.edges[0]?.id;
    expect(reparsedEdgeId).toBeDefined();
    if (reparsedEdgeId) {
      expect(second.ast.metadata.edgeLayoutOverrides?.[reparsedEdgeId]).toEqual({
        labelOffsetX: 36,
        labelOffsetY: -24,
      });
    }
  });
});

describe("C4 node extras (stereotype / technology) round-trip", () => {
  // Parse a C4 source, mutate fields the macros can't express, then return
  // the AST so each test can generate from a node carrying extras.
  function c4AstWith(
    mutate: (ast: Diagram) => void,
    diagramType: DiagramType = "c4-context",
  ): Diagram {
    const source =
      `@startuml\n` +
      `Person(customer, "Customer")\n` +
      `System(orderSystem, "Order Platform")\n` +
      `@enduml\n`;
    const { ast, errors } = parsePlantUml(source, {
      diagramType,
      diagramId: "d",
      idFactory: makeCounterFactory(),
    });
    expect(errors).toEqual([]);
    mutate(ast);
    return ast;
  }

  it("emits stereotype via nodeExtras sidecar without touching the macro line", () => {
    // Arrange — system with a stereotype the System() macro has no slot for.
    const ast = c4AstWith((d) => {
      const node = d.nodes.find((n) => n.alias === "orderSystem");
      if (node) node.stereotype = "domain";
    });

    // Act
    const generated = generatePlantUml(ast);
    const metaLine = generated.split("\n").find((line) => line.includes("@drawer:meta"));

    // Assert — macro line unchanged; stereotype rides the sidecar.
    expect(generated).toContain('System(orderSystem, "Order Platform")');
    expect(metaLine).toBeDefined();
    const payload = JSON.parse(metaLine!.replace("' @drawer:meta ", "")) as {
      nodeExtras?: Record<string, { stereotype?: string; technology?: string }>;
    };
    expect(payload.nodeExtras?.orderSystem?.stereotype).toBe("domain");
  });

  it("emits Person/System technology via nodeExtras (no 4th macro argument)", () => {
    // Arrange
    const ast = c4AstWith((d) => {
      const node = d.nodes.find((n) => n.alias === "customer");
      if (node) node.technology = "Browser";
    });

    // Act
    const generated = generatePlantUml(ast);
    const metaLine = generated.split("\n").find((line) => line.includes("@drawer:meta"));

    // Assert — Person line keeps its arity; technology rides the sidecar.
    expect(generated).toContain('Person(customer, "Customer")');
    expect(generated).not.toMatch(/Person\(customer,[^\n]*"Browser"/);
    const payload = JSON.parse(metaLine!.replace("' @drawer:meta ", "")) as {
      nodeExtras?: Record<string, { technology?: string }>;
    };
    expect(payload.nodeExtras?.customer?.technology).toBe("Browser");
  });

  it("does NOT duplicate Container technology into nodeExtras", () => {
    // Arrange — container technology is already a macro argument.
    const source =
      `@startuml\n` + `Container(api, "API", "Java", "Handles intake")\n` + `@enduml\n`;
    const { ast, errors } = parsePlantUml(source, {
      diagramType: "c4-container",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    });
    expect(errors).toEqual([]);
    expect(ast.nodes[0]?.technology).toBe("Java");

    // Act
    const generated = generatePlantUml(ast);

    // Assert — technology stays in the macro; no nodeExtras sidecar emitted.
    expect(generated).toContain('Container(api, "API", "Java", "Handles intake")');
    expect(generated).not.toContain("nodeExtras");
  });

  it("restores stereotype + technology through parse(generate(ast)) with fresh ids", () => {
    // Arrange
    const ast = c4AstWith((d) => {
      const person = d.nodes.find((n) => n.alias === "customer");
      if (person) person.technology = "Browser";
      const system = d.nodes.find((n) => n.alias === "orderSystem");
      if (system) {
        system.stereotype = "domain";
        system.technology = "Spring";
      }
    });

    // Act — regenerate, then reparse with a fresh factory (new ids).
    const generated = generatePlantUml(ast);
    const reparsed = parsePlantUml(generated, {
      diagramType: "c4-context",
      diagramId: "d2",
      idFactory: makeCounterFactory(),
    });

    // Assert — fields survive the round-trip, matched by alias.
    expect(reparsed.errors).toEqual([]);
    const person = reparsed.ast.nodes.find((n) => n.alias === "customer");
    const system = reparsed.ast.nodes.find((n) => n.alias === "orderSystem");
    expect(person?.technology).toBe("Browser");
    expect(system?.stereotype).toBe("domain");
    expect(system?.technology).toBe("Spring");
  });

  it("does not emit nodeExtras for non-C4 diagrams (class stereotype uses <<...>>)", () => {
    // Arrange — a class with a stereotype, which the class generator already
    // expresses via `<<...>>` rather than the sidecar.
    const source = `@startuml\nclass Foo\n@enduml\n`;
    const { ast } = parsePlantUml(source, {
      diagramType: "class",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    });
    const node = ast.nodes.find((n) => n.label === "Foo");
    if (node) node.stereotype = "service";

    // Act
    const generated = generatePlantUml(ast);

    // Assert — no sidecar for class diagrams.
    expect(generated).not.toContain("nodeExtras");
  });

  it('round-trips a class label that isn\'t a bare identifier via `"label" as alias`', () => {
    // Arrange — a freshly added class carries a spaced placeholder label and
    // no alias (the palette dispatches addNodeCommand with `New Class`).
    const diagram = createEmptyDiagram("class");
    diagram.nodes.push({
      id: "0198abcd-1234-7000-8000-aaaaaaaaaaaa",
      kind: "class",
      label: "New Class",
    });

    // Act — generate, then re-parse, then generate again.
    const generated = generatePlantUml(diagram);
    const { ast } = parsePlantUml(generated, {
      diagramType: "class",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    });
    const regenerated = generatePlantUml(ast);

    // Assert — the label survives as a quoted name (not a GUID), and the
    // round-trip is stable.
    expect(generated).toContain('class "New Class" as ');
    expect(generated).not.toMatch(/class n_[0-9a-f_]+\s*$/mu);
    expect(ast.nodes[0]?.label).toBe("New Class");
    expect(regenerated).toBe(generated);
  });

  it('round-trips an entity label that isn\'t a bare identifier via `"label" as alias`', () => {
    // Arrange
    const diagram = createEmptyDiagram("er");
    diagram.nodes.push({
      id: "0198abcd-1234-7000-8000-bbbbbbbbbbbb",
      kind: "entity",
      label: "Customer Order",
    });

    // Act
    const generated = generatePlantUml(diagram);
    const { ast } = parsePlantUml(generated, {
      diagramType: "er",
      diagramId: "d",
      idFactory: makeCounterFactory(),
    });

    // Assert
    expect(generated).toContain('entity "Customer Order" as ');
    expect(ast.nodes[0]?.label).toBe("Customer Order");
  });
});

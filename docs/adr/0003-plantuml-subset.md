# ADR-0003 — PlantUML subset for MVP and parser-implementation choice

- **Status:** Accepted (Phase 4)
- **Date:** 2026-05-08
- **Authors:** UML Drawer JS contributors
- **Phase:** [Phase 4 — DSL Parser](../IMPLEMENTATION_PLAN.md#6-phase-4--dsl-parser-lezer)

## Context

Phase 4 of the implementation plan calls for a Lezer-generated parser of PlantUML — same grammar reused later by the CodeMirror language extension (Phase 11). The exit criterion is the behavioural one:

> All 5 diagram types parse; invalid input emits a `DiagramError` with a `range` and a `code: SYNTAX_*`; the AST is preserved on errors (the last valid AST remains).

PlantUML is a large language: thousands of constructs across diagram types, macros from C4-PlantUML, preprocessor directives, skinparams, notes, partitions, and many more. Producing a Lezer grammar that compiles cleanly — even covering only the MVP subset — is a multi-day effort: token / production tuning, conflict resolution, ambiguity handling, and a separate AST-builder layer that walks the resulting `Tree`.

We need a working parser to unblock Phase 5 (generator), Phase 6 (validators), Phase 8 (renderer), and Phase 10 (`createEditor`). Blocking those phases on a full Lezer grammar would push the rest of the MVP back substantially.

## Decision

### Parser implementation

We ship a **hand-rolled, line-based parser** for Phase 4. The implementation lives in `packages/core/src/parser/`:

- `tokenizer.ts` — splits source into `SourceLine[]` with offsets for accurate `DiagramError.range` ranges.
- `lines/{c4,class,er,sequence,shared}.ts` — pattern matchers per diagram type.
- `meta.ts` — encoder + decoder for `' @drawer:meta {...}` annotations.
- `context.ts` — accumulator state + alias→id resolution.
- `parse.ts` — public `parsePlantUml(text, options)` entry, dispatches per line.

Lines that no matcher recognises are stashed verbatim into `metadata.opaque` so the generator (Phase 5) can round-trip them unchanged.

We will migrate to a Lezer grammar in a follow-up. The migration target is a focused refactor of the front-end (tokenizer + line dispatchers replaced by a Lezer `Tree` walker) leaving the AST shape, error model, and meta-comment handling untouched. The follow-up may land:

- as a sub-phase **Phase 4b** before Phase 11, or
- bundled with **Phase 11** (CodeMirror language extension) when CodeMirror's incremental highlighter requires a real grammar.

The trigger to migrate is the first downstream feature whose value depends on incremental parsing — likely diagnostics in CodeMirror that need to update on every keystroke without re-running the whole parser. Until then, the hand-rolled parser is sufficient because the editor only re-parses on a debounced "text changed" signal, not per keystroke.

### Supported PlantUML subset

The MVP recognises the constructs below across all five diagram types. **Anything not on this list is captured into `metadata.opaque` verbatim.**

#### Universal

| Construct        | Example                                                  | Notes                                                                                                                                                          |
| ---------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document markers | `@startuml`, `@enduml`                                   | An identifier after `@startuml` becomes the diagram title if no `title` line is present. Missing markers emit `SYNTAX_MISSING_MARKER` warnings (non-blocking). |
| Title            | `title Sample Title`                                     | Sets `diagram.title`.                                                                                                                                          |
| Comments         | `' some comment`                                         | Ignored.                                                                                                                                                       |
| Meta-comments    | `' @drawer:meta {"layoutOverrides":{"a":{"x":1,"y":2}}}` | Decoded into `metadata.layoutOverrides` and `styles`. Malformed payloads emit `SYNTAX_META`.                                                                   |

#### C4 (`c4-context` / `c4-container` / `c4-component`)

| Macro                                                                     | Mapped to                                                                                                              |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Person(alias, "label", "description"?)`                                  | `NodeKind: "person"`                                                                                                   |
| `Person_Ext(alias, "label", "description"?)`                              | `NodeKind: "person"` (the `_Ext` differentiator carries through label/description text only — refining is a follow-up) |
| `System(alias, "label", "description"?)`                                  | `NodeKind: "system"`                                                                                                   |
| `System_Ext(alias, "label", "description"?)`                              | `NodeKind: "system-external"`                                                                                          |
| `Container(alias, "label", "tech"?, "description"?)`                      | `NodeKind: "container"`                                                                                                |
| `ContainerDb(alias, "label", "tech"?, "description"?)`                    | `NodeKind: "database"`                                                                                                 |
| `Component(alias, "label", "tech"?, "description"?)`                      | `NodeKind: "component"`                                                                                                |
| `ComponentDb(alias, "label", "tech"?, "description"?)`                    | `NodeKind: "database"`                                                                                                 |
| `Boundary` / `System_Boundary` / `Enterprise_Boundary` `(alias, "label")` | `GroupKind: "boundary"` (children-tracking is opaque until P4-follow-up)                                               |
| `Rel(from, to, "label", "tech"?)`, plus `Rel_U/D/L/R`                     | `EdgeKind: "uses"`. Technology rides as a `[tech]` suffix on `label` until `DiagramEdge` exposes a dedicated field.    |

#### Class

(Pipe characters in arrow operators are escaped below to keep the markdown table from being misparsed.)

- **Class declaration** — `class Foo`, `interface Foo`, `abstract class Foo`, `enum Foo`. Member blocks (`{ ... }`) are not yet modelled — closing `}` is silently consumed.
- **Stereotype** — `class Foo <<service>>` populates `node.stereotype`.
- **Inheritance** — `Foo --\|> Bar` or `Bar <\|-- Foo` → `EdgeKind: "inheritance"`.
- **Realization** — `Foo ..\|> Bar` or `Bar <\|.. Foo` → `EdgeKind: "realization"`.
- **Composition** — `Foo *-- Bar` → `EdgeKind: "composition"`.
- **Aggregation** — `Foo o-- Bar` → `EdgeKind: "aggregation"`.
- **Association** — `Foo --> Bar`, `Foo -- Bar` → `EdgeKind: "association"`.
- **Dependency** — `Foo ..> Bar`, `Foo .. Bar` → `EdgeKind: "dependency"`.
- **Edge label** — `Foo --> Bar : transforms` populates `edge.label`.

Members (attributes, operations) inside a `{ ... }` block are not in this MVP. They land in a follow-up — see `__fixtures__/class/sample.puml` for the supported shape today.

#### Entity Relationship (`er`)

- **Entity declaration** — `entity User`, `entity User as U`. Member blocks not yet supported.
- **1 — 1** — `A \|\|--\|\| B` → `EdgeKind: "one-to-one"`, cardinality `{source:"1", target:"1"}`.
- **1 — many** — `A \|\|--o{ B` → `EdgeKind: "one-to-many"`, cardinality `{"1","0..*"}`.
- **many — 1** — `A }o--\|\| B` → `EdgeKind: "one-to-many"`, cardinality flipped.
- **many — many** — `A }o--o{ B` → `EdgeKind: "many-to-many"`.
- **Edge label** — `A \|\|--o{ B : places` populates `edge.label`.

#### Sequence

| Construct     | Example                                      | Notes                                             |
| ------------- | -------------------------------------------- | ------------------------------------------------- |
| Participant   | `participant Auth`, `participant "DB" as db` | `NodeKind: "lifeline"` (or `"actor"` for `actor`) |
| Sync message  | `A -> B : msg`                               | `EdgeKind: "sync-call"`                           |
| Async message | `A ->> B : msg`                              | `EdgeKind: "async-call"`                          |
| Return        | `A --> B : ok`                               | `EdgeKind: "return"`                              |

Activations (`activate` / `deactivate`), notes (`note left of …`), and combined fragments (`alt` / `opt` / `loop`) are not in this MVP — they fall through to `metadata.opaque`.

### Errors

The parser emits `DiagramError` with `code` drawn from a stable namespace. Severity is `error` for bad input and `warning` for soft issues (missing markers).

| Code                       | Severity  | Trigger                                                                                            |
| -------------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| `SYNTAX_MALFORMED`         | `error`   | A line looks like a known construct but doesn't match its expected shape (e.g. unsupported arrow). |
| `SYNTAX_UNKNOWN_REFERENCE` | `error`   | Edge / `Rel(...)` references an unknown alias.                                                     |
| `SYNTAX_META`              | `error`   | Meta-comment payload is not valid JSON or is not a JSON object.                                    |
| `SYNTAX_MISSING_MARKER`    | `warning` | `@startuml` or `@enduml` is missing. AST is still produced.                                        |
| `SYNTAX_UNBALANCED_QUOTE`  | `error`   | Reserved for future shape-checks (not yet emitted in MVP).                                         |

Errors carry a `range: { from, to }` in the original text so CodeMirror lint markers and the props-panel "problems" list can highlight precisely.

### Determinism for tests

The parser accepts an `idFactory: () => string` option (default: `uuidv7`). Test fixtures pass a counter-based factory so the resulting AST is byte-stable and can be snapshotted.

## Consequences

### Pros

- Phase 5 (generator), Phase 6 (validators), Phase 8 (renderer), Phase 10 (`createEditor`) unblocked in days, not weeks.
- Public API (`parsePlantUml(text, options) → { ast, errors }`) does not change when Lezer lands.
- The MVP subset is small and explicit — easy to review, easy to extend test-by-test.
- Hand-rolled regex matchers are easy to debug; non-matching lines round-trip via `metadata.opaque`.

### Cons

- No incremental parsing yet. CodeMirror's lint extension will need to re-run the full parse on each debounced text change. Acceptable for diagrams up to a few hundred lines (parse + regenerate budget is < 50 ms per the NFR — well within the typical re-parse cost on a modern machine).
- The grammar is implicit (regexes scattered across `lines/*.ts`) rather than a single declarative `.grammar` file. Documentation lives in this ADR plus the fixtures.
- Member blocks (`class Foo { … }`, `entity Foo { … }`) are not yet modelled — they fall into `metadata.opaque`. The renderer and the props-panel will surface "no attributes/operations parsed" hints until P4-follow-up addresses them.

### Migration plan to Lezer

1. Add `@lezer/generator` + `@lezer/lr` as `core` dev dependencies.
2. Author `packages/core/src/parser/plantuml.grammar` covering the same subset documented above. Use a "catch-all line" production for unsupported lines.
3. Add a build step that runs `lezer-generator src/parser/plantuml.grammar` and emits `plantuml.parser.js`.
4. Replace `tokenizer.ts` + the `lines/*.ts` regex matchers with a single `treeBuilder.ts` that walks the Lezer `Tree`. The diagram-type-aware semantic builder stays the same.
5. Reuse the same fixtures (`__fixtures__/{type}/sample.{puml,json}`) as the migration regression suite — no test file should need to change.

When the migration lands, this ADR is amended (status → "Superseded by ADR-0003a — Lezer grammar adopted") and `IMPLEMENTATION_PLAN.md` updates the Phase 4 checkbox annotation.

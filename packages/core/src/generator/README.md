# `@uml-drawer/core/generator`

AST → PlantUML rendering. Pair to `parser/`: feeding the output back through
`parsePlantUml` yields a `Diagram` equal to the input (modulo the determinism
provided by the caller's `idFactory`).

## Public surface

```ts
import { generatePlantUml } from "@uml-drawer/core/generator";

const text: string = generatePlantUml(diagram);
```

The generator is purely a function of the AST: no I/O, no global state, no
randomness. It does not touch `Diagram`, so it is safe to call inside React
render paths.

## Normalisation rules

The generator emits a **canonical** form, which is often _not_ byte-equal to
the original source the parser consumed. The following rules are stable:

1. **Document frame.** Output is always wrapped in `@startuml` / `@enduml`,
   one element per line, terminated by a trailing `\n`. The optional title
   shows up on its own `title …` line — never as the first-line argument of
   `@startuml`.
2. **Element order.** `nodes` are emitted in `Diagram.nodes` order; `edges`
   in `Diagram.edges` order. C4 boundaries come first (they wrap their
   children); other groups are not yet rendered (Phase 5 scope). Anything in
   `metadata.opaque` is appended verbatim _after_ the body, just before
   `@enduml`.
3. **Aliases.** Each node and group gets a single PlantUML alias.
   - When the node's `label` matches `^\w+$` and is unique in the diagram,
     the label itself becomes the alias. This keeps `class Foo` round-trips
     visually identical for the common case.
   - Otherwise the alias is `n_<sanitized-id>` — every non-word char in the
     id is replaced by `_` and the result is prefixed with `n_` so the alias
     never starts with a digit.
4. **Arrow direction.** Edge kinds are mapped to a single canonical PlantUML
   arrow (`inheritance` → `--|>`, `realization` → `..|>`, `one-to-many` →
   `||--o{`, etc.), regardless of the direction in the original source. The
   parser already accepts both directions for symmetric arrows, so this
   normalisation is lossless on round-trip.
5. **Sequence participants.** When a participant's label is not a clean
   identifier, the generator emits `participant "Label" as alias` so the
   visual label survives round-trip. Otherwise the short `participant Foo`
   form is used.
6. **C4 `Rel` technology.** The parser folds the optional fourth `Rel`
   argument into the edge's label as a `[tech]` suffix (workaround until the
   AST grows a dedicated `technology` field on edges — tracked in
   `docs/adr/0003-plantuml-subset.md`). The generator detects that suffix
   and decodes it back into a 4-arg `Rel(from, to, "label", "tech")` form.
7. **Meta comment.** When `metadata.layoutOverrides` or `Diagram.styles` is
   non-empty, a single `' @drawer:meta {…}` line is emitted right after the
   title (or right after `@startuml` when no title is set). Keys inside the
   payload are sorted alphabetically so the output is byte-stable.

## Round-trip guarantee

For every fixture in `__fixtures__/{type}/sample.puml`:

```
parsePlantUml(text, { idFactory: counter })  →  ast₁
generatePlantUml(ast₁)                       →  text′
parsePlantUml(text′, { idFactory: counter })  →  ast₂

assert(ast₁ === ast₂)                        // structural equality
```

This is enforced in `generator.test.ts`. The counter-based id factory is the
standard test double from `parser/parse.test.ts`; with a real `uuidv7`
factory the _structure_ round-trips but ids will differ between runs, which
is intentional.

## Known limitations

- **Quoted strings.** PlantUML's accepted subset for `"…"` literals does
  not allow escaped quotes. `escapeStringLiteral` produces `\"` for
  defensive safety, but if your AST contains `"` inside a label it will
  not parse back cleanly. Tracked in the same ADR as the `[tech]` suffix.
- **Class members.** `{ … }` member blocks (attributes / operations) are
  not emitted yet — they are not modelled by the parser either. Will land
  with the constraints validator (Phase 6) and the props panel (Phase 12).
- **Sequence activations / notes / alt-opt-loop.** Not modelled in the AST;
  any such constructs survive only via the `metadata.opaque` round-trip.

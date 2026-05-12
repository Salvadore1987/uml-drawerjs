# Validators & quick-fixes

Diagnostics run in four levels, each a pure function over the latest AST. Run them all at once with `runAllValidators(diagram, parserErrors)`.

| Level       | Module                                       | Examples                                                                                                                                              |
| ----------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Syntax      | `validators/syntax.ts` (parser pass-through) | `SYNTAX_MALFORMED`, `SYNTAX_UNKNOWN_REFERENCE`, `SYNTAX_META`, `SYNTAX_MISSING_MARKER`                                                                |
| Semantic    | `validators/semantic.ts`                     | `SEM_DUPLICATE_NODE_ID`, `SEM_EDGE_DANGLING_SOURCE`, `SEM_GROUP_CHILD_MISSING`, `SEM_NODE_LABEL_EMPTY`                                                |
| Constraints | `validators/constraints.ts`                  | `CONSTRAINT_NODE_KIND_NOT_ALLOWED`, `CONSTRAINT_C4_BOUNDARY_CHILD_KIND`, `CONSTRAINT_ER_CARDINALITY_*`, `CONSTRAINT_CLASS_*`, `CONSTRAINT_SEQUENCE_*` |
| Lint        | `validators/lint.ts`                         | `LINT_ORPHAN_NODE`, `LINT_DUPLICATE_LABEL`, `LINT_INHERITANCE_CYCLE`                                                                                  |

## DiagramError

```ts
interface DiagramError {
  severity: "error" | "warning" | "info";
  code: string; // SYNTAX_* / SEM_* / CONSTRAINT_* / LINT_*
  message: string;
  range?: { from: number; to: number };
  nodeId?: string;
  edgeId?: string;
  groupId?: string;
  fix?: { label: string; apply: () => void };
}
```

`range` is in the original source text. `nodeId / edgeId / groupId` point into the AST. CodeMirror lint markers, the `<PropsPanel>` problems list, and the playground HUD all consume the same shape.

## Quick-fixes

The quick-fix registry maps an error code to a builder that reads the live diagram and returns a `Command`:

| Error code                 | Quick-fix             |
| -------------------------- | --------------------- |
| `SEM_NODE_LABEL_EMPTY`     | Set placeholder label |
| `SEM_GROUP_LABEL_EMPTY`    | Set placeholder label |
| `SEM_EDGE_DANGLING_SOURCE` | Remove dangling edge  |
| `SEM_EDGE_DANGLING_TARGET` | Remove dangling edge  |
| `SEM_GROUP_CHILD_MISSING`  | Drop unknown children |
| `LINT_ORPHAN_NODE`         | Remove orphan node    |

Bind quick-fixes to a CommandBus with `attachQuickFixes(errors, diagram, dispatch)`. The CodeMirror lint extension (`@uml-drawer/codemirror-plantuml/lint`) does this for you — `actions` on each `Diagnostic` dispatch the corresponding command.

## Constraints per diagram type

- **C4** — node `kind` whitelisted (`person | person-external | system | system-external | container | container-external | component | component-external | database | queue`); boundary groups only contain C4 kinds.
- **Class** — node `kind` ∈ `class | interface | abstract-class | enum`; edge kinds whitelisted (`association`, `inheritance`, `realization`, `composition`, `aggregation`, `dependency`); classic-UML member rules: `enum` carries `enumLiterals[]` only — never `attributes` / `operations` / `generics` (`CONSTRAINT_CLASS_ENUM_*`); abstract operations only on `abstract-class` / `interface` (`CONSTRAINT_CLASS_ABSTRACT_OUTSIDE_ABSTRACT_OR_INTERFACE`); cycles in inheritance / realization flagged as `LINT_INHERITANCE_CYCLE`.
- **ER** — only `entity` nodes; cardinality required (`CONSTRAINT_ER_CARDINALITY_MISSING`); cardinality token must match `1 | 0..1 | 0..* | 1..* | * | n..m` (`CONSTRAINT_ER_CARDINALITY_INVALID`).
- **Sequence** — edges only between `actor` / `lifeline` / `lifeline-boundary` / `lifeline-control` / `lifeline-entity` / `lifeline-collections` / `database` / `queue` (`CONSTRAINT_SEQUENCE_EDGE_NON_LIFELINE`); `activate` / `deactivate` must be balanced (`CONSTRAINT_SEQUENCE_ACTIVATION_UNBALANCED`); `opt` / `loop` / `break` / `critical` / `ref` accept one operand, `alt` / `par` accept at least two (`CONSTRAINT_SEQUENCE_FRAGMENT_TOO_FEW_OPERANDS`); empty operands trigger `CONSTRAINT_SEQUENCE_FRAGMENT_EMPTY_OPERAND`; note participants must exist (`CONSTRAINT_SEQUENCE_NOTE_ORPHAN_PARTICIPANT`); orphan-node lint is suppressed (lifelines exist without messages).

The full whitelist tables live in `packages/core/src/validators/constraints.ts`.

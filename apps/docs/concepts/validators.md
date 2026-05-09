# Validators & quick-fixes

Diagnostics run in four levels, each a pure function over the latest AST. Run them all at once with `runAllValidators(diagram, parserErrors)`.

| Level       | Module                                       | Examples                                                                                               |
| ----------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Syntax      | `validators/syntax.ts` (parser pass-through) | `SYNTAX_MALFORMED`, `SYNTAX_UNKNOWN_REFERENCE`, `SYNTAX_META`, `SYNTAX_MISSING_MARKER`                 |
| Semantic    | `validators/semantic.ts`                     | `SEM_DUPLICATE_NODE_ID`, `SEM_EDGE_DANGLING_SOURCE`, `SEM_GROUP_CHILD_MISSING`, `SEM_NODE_LABEL_EMPTY` |
| Constraints | `validators/constraints.ts`                  | `CONSTRAINT_NODE_KIND_NOT_ALLOWED`, `CONSTRAINT_C4_BOUNDARY_CHILD_KIND`, `CONSTRAINT_ER_CARDINALITY_*` |
| Lint        | `validators/lint.ts`                         | `LINT_ORPHAN_NODE`, `LINT_DUPLICATE_LABEL`, `LINT_INHERITANCE_CYCLE`                                   |

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

- **C4** — node `kind` whitelisted (`person | system | system-external | container | component | database`); boundary groups only contain C4 kinds.
- **Class** — node `kind` ∈ `class | interface | abstract-class | enum`; edge kinds whitelisted (`association`, `inheritance`, `realization`, …); cycles in inheritance / realization flagged as `LINT_INHERITANCE_CYCLE`.
- **ER** — only `entity` nodes; cardinality required; cardinality token must match `1 | 0..1 | 0..* | * | n..m`.
- **Sequence** — edges only between `lifeline` / `actor`; orphan-node lint is suppressed (lifelines exist without messages).

The full whitelist tables live in `packages/core/src/validators/constraints.ts`.

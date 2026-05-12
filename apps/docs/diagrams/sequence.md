# Sequence diagrams

Time-ordered interactions between actors and lifelines. The sequence renderer ships its own deterministic synchronous layout (ELK is not used here — see [ADR-0001](https://github.com/Salvadore1987/uml-drawerjs/blob/main/docs/adr/0001-sequence-layout.md)).

UML Drawer JS supports the full canonical UML sequence-diagram notation per [ADR-0010](https://github.com/Salvadore1987/uml-drawerjs/blob/main/docs/adr/0010-sequence-uml-notation.md): specialised lifeline shapes, activations, combined fragments, notes, dividers, autonumber, self-messages, and create / destroy.

## Lifelines

| Construct            | Example                           | AST                                       |
| -------------------- | --------------------------------- | ----------------------------------------- |
| Actor                | `actor User`                      | `NodeKind: "actor"`                       |
| Generic participant  | `participant Auth`                | `NodeKind: "lifeline"`                    |
| Aliased participant  | `participant "Web App" as web`    | `node.label = "Web App"`, `alias = "web"` |
| Boundary lifeline    | `boundary "Login UI" as ui`       | `NodeKind: "lifeline-boundary"`           |
| Control lifeline     | `control LoginController as ctrl` | `NodeKind: "lifeline-control"`            |
| Entity lifeline      | `entity Session as session`       | `NodeKind: "lifeline-entity"`             |
| Collections lifeline | `collections Cache as cache`      | `NodeKind: "lifeline-collections"`        |
| Database             | `database "Postgres" as db`       | `NodeKind: "database"`                    |
| Queue                | `queue Outbox as outbox`          | `NodeKind: "queue"`                       |

## Messages

| Construct             | Example               | AST                                                        |
| --------------------- | --------------------- | ---------------------------------------------------------- |
| Sync message          | `A -> B : msg`        | `EdgeKind: "sync-call"`                                    |
| Async message         | `A ->> B : msg`       | `EdgeKind: "async-call"`                                   |
| Return                | `A --> B : ok`        | `EdgeKind: "return"`                                       |
| Create message        | `A -> B ** : create`  | `EdgeKind: "create"`                                       |
| Destroy message       | `A -> B !! : destroy` | `EdgeKind: "destroy"`                                      |
| Self-message          | `A -> A : retry`      | Normal edge, `source === target` (renderer draws loopback) |
| Activation shortcut   | `A -> B ++ : start`   | `edge.activatesTarget = true`                              |
| Deactivation shortcut | `A -> B -- : done`    | `edge.deactivatesSource = true`                            |

## Activations

```text
activate Auth
Auth -> DB : query
DB --> Auth : rows
deactivate Auth
```

Stored as `node.activations[] = [{ id, fromEdgeId, toEdgeId? }]`. The generator emits explicit `activate` / `deactivate` lines (not the `++` / `--` shortcuts) so output is unambiguous regardless of how the activation was authored. The parser accepts both forms.

## Combined fragments

```text
alt success
  A -> B : ok
else failure
  A -> B : retry
end

opt logging enabled
  A -> Logger : write
end

loop while not done
  A -> Worker : tick
end

par
  A -> Cache : warm
  A -> CDN : prime
end

ref over A, B : External authentication
```

`Diagram.fragments[]` holds every fragment flat; nesting is captured by `parentId` + `parentOperandId`. Each fragment has `operands: [{ id, guard?, edges: string[] }]`. Supported kinds: `alt`, `opt`, `loop`, `par`, `break`, `critical`, `ref`. Frames are draggable / resizable on canvas via `MoveSequenceFragmentCommand` / `ResizeSequenceFragmentCommand`; horizontal coverage can be pinned to specific participants via `coveredParticipants`.

## Notes & dividers

```text
note left of User : Entry point
note over A, B
  Multi-line
  note body
end note

== Phase 2 — Validation ==
```

Notes live on `Diagram.notes[]` (`placement: "left" | "right" | "over"`, optional `anchorEdgeId` to pin chronologically). Dividers live on `Diagram.dividers[]` with optional `afterEdgeId`.

## Autonumber

```text
autonumber 10 5 "<b>[%d]</b>"
```

Stored on `metadata.sequenceAutoNumber = { start, increment, format? }`. The renderer prefixes every message label with the formatted counter; `autonumber stop` clears the metadata.

## Validators specific to sequence

- **Edge endpoints** — both source and target must be one of `actor`, `lifeline`, `lifeline-boundary`, `lifeline-control`, `lifeline-entity`, `lifeline-collections`, `database`, `queue` (`CONSTRAINT_SEQUENCE_EDGE_NON_LIFELINE`).
- **Activation balance** — every `activate` must be paired with a `deactivate` (or stay open to the bottom of the diagram); duplicated `activate` without an intervening `deactivate` raises `CONSTRAINT_SEQUENCE_ACTIVATION_UNBALANCED`.
- **Fragment operands** — `opt` / `loop` / `break` / `critical` / `ref` must have exactly one operand; `alt` / `par` must have at least two. Violations: `CONSTRAINT_SEQUENCE_FRAGMENT_TOO_FEW_OPERANDS`. Empty operands trigger `CONSTRAINT_SEQUENCE_FRAGMENT_EMPTY_OPERAND`.
- **Note anchors** — every `note over X, Y` participant must reference an existing node (`CONSTRAINT_SEQUENCE_NOTE_ORPHAN_PARTICIPANT`); empty text triggers `CONSTRAINT_SEQUENCE_NOTE_EMPTY`.
- **Orphan-node lint suppressed** — lifelines can legitimately exist without a message, so the orphan rule (`LINT_ORPHAN_NODE`) does not fire on sequence diagrams.

## Sample

```text
@startuml
title Login Flow

actor User
boundary "Web App" as web
control API as api
entity Auth as auth

autonumber 1 1 "<b>%02d</b>"

User -> web ++ : login(email, password)
web -> api ++ : POST /sessions
api -> auth ++ : validate
alt valid credentials
  auth --> api : ok(token)
  api --> web : 201 { token }
  web --> User : Welcome
else invalid
  auth --> api : 401
  api --> web : 401
  web --> User : Try again
end
deactivate auth
deactivate api
deactivate web
@enduml
```

Open in the [Playground](/playground/) → **Sequence**.

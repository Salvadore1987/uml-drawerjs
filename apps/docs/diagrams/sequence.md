# Sequence diagrams

Time-ordered interactions between actors and lifelines. The sequence renderer ships its own deterministic synchronous layout (ELK is not used here — see [ADR-0001](https://github.com/Salvadore1987/uml-drawerjs/blob/main/docs/adr/0001-sequence-layout.md)).

## Supported PlantUML subset

| Construct     | Example                  | AST                                       |
| ------------- | ------------------------ | ----------------------------------------- |
| Actor         | `actor User`             | `NodeKind: "actor"`                       |
| Participant   | `participant Auth`       | `NodeKind: "lifeline"`                    |
| Aliased       | `participant "DB" as db` | `node.label = "DB"`, `node.id` from alias |
| Sync message  | `A -> B : msg`           | `EdgeKind: "sync-call"`                   |
| Async message | `A ->> B : msg`          | `EdgeKind: "async-call"`                  |
| Return        | `A --> B : ok`           | `EdgeKind: "return"`                      |

Activations (`activate / deactivate`), notes (`note left of …`), and combined fragments (`alt / opt / loop`) are not in this MVP — they round-trip via `metadata.opaque`.

## Validators specific to sequence

- **Edge endpoints** — both source and target must be `lifeline` or `actor` (`CONSTRAINT_SEQUENCE_EDGE_NON_LIFELINE`).
- **Orphan-node lint suppressed** — lifelines can legitimately exist without a message, so the orphan rule (`LINT_ORPHAN_NODE`) does not fire on sequence diagrams.

## Sample

```text
@startuml
title Login Flow

actor User
participant "Web App" as web
participant API as api
participant Auth as auth

User -> web : login(email, password)
web -> api : POST /sessions
api -> auth : validate
auth --> api : ok(token)
api --> web : 201 { token }
web --> User : Welcome
@enduml
```

Open in the [Playground](/playground/) → **Sequence**.

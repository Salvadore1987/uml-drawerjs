# @uml-drawer/core

Framework-agnostic core for [UML Drawer JS](../../README.md). Hosts the hexagonal architecture's inner layers: AST model, parser, generator, validators, layout, renderer, CQRS commands, history, and exporters.

> **Phase 2 status:** only the `model/` layer and folder skeletons are populated. Parser / generator / validators / etc. follow in subsequent phases per [`docs/IMPLEMENTATION_PLAN.md`](../../docs/IMPLEMENTATION_PLAN.md).

## Install

```bash
pnpm add @uml-drawer/core
```

## Public surface (Phase 2)

```ts
import { createEmptyDiagram, cloneDiagram, findNode, getEdgesOfNode } from "@uml-drawer/core";
import type { Diagram, Node, Edge, NodeKind, EdgeKind } from "@uml-drawer/core/model";

const diagram = createEmptyDiagram("class");
diagram.metadata.schemaVersion; // "0.1.0"
```

All AST type definitions live under [`./model`](./src/model). Runtime validation uses [zod](https://zod.dev/) at the API boundary; the JSON Schema for `.umljson` is exported as `diagramSchema`.

## Architecture (target)

```
src/
├── model/          # AST types, ids, immutability helpers, schema, validation
├── parser/         # Lezer-based PlantUML → AST (Phase 4)
├── generator/      # AST → PlantUML (Phase 5)
├── validators/     # syntax / semantic / constraints / lint (Phase 6)
├── layout/         # ELK adapter + custom Sequence layout (Phase 7)
├── renderer/       # mini-SVG layer (Phase 8)
├── commands/       # CQRS — every AST mutation is a command (Phase 3)
├── history/        # undo/redo stack over commands (Phase 3)
├── exporters/      # .puml, SVG, PNG, .umljson (Phase 9)
└── editor/         # createEditor() vanilla bootstrap (Phase 10)
```

## Build

```bash
pnpm --filter @uml-drawer/core build      # vite build → dist
pnpm --filter @uml-drawer/core typecheck  # tsc --noEmit
pnpm --filter @uml-drawer/core test       # vitest run
```

The package is ESM-only with `sideEffects: false` for tree-shaking.

## License

MIT

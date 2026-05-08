# UML Drawer JS

> Framework-agnostic TypeScript library for editing UML diagrams with bidirectional PlantUML synchronization.

**Status:** pre-alpha. Phase 0 (repo bootstrap) complete; library implementation pending.

See [`docs/uml-drawer.md`](./docs/uml-drawer.md) for the full specification and [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md) for the phased roadmap.

## Planned packages

| Package                           | Purpose                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `@uml-drawer/core`                | Hexagonal core: parser, AST model, generator, validators, layout, renderer, commands, history, exporters, vanilla `createEditor` |
| `@uml-drawer/react`               | Idiomatic React adapter: `<UmlEditor>` and headless sub-components                                                               |
| `@uml-drawer/codemirror-plantuml` | CodeMirror 6 language support reusing the core Lezer grammar                                                                     |
| `@uml-drawer/theme`               | Design-agnostic theming contract — `--uml-*` CSS variables with neutral light/dark defaults                                      |

`apps/playground` and `apps/docs` host the showcase and documentation site respectively. The cyber-topographic skin lives only inside `apps/playground/src/skins/cyber-topographic/` and is not published.

## Requirements

- Node.js 20 LTS (see `.nvmrc`)
- pnpm 9+

## Scripts

```bash
pnpm install           # install workspace dependencies
pnpm typecheck         # run tsc --noEmit across all packages
pnpm lint              # ESLint + Prettier check
pnpm test              # Vitest across all packages
pnpm build             # build all publishable packages
pnpm changeset         # author a changeset for a release
```

## License

[MIT](./LICENSE)

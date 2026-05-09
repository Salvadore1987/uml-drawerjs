# Migration

UML Drawer JS is pre-1.0. Until `1.0` lands, breaking changes may ship in minor versions but are always called out in the changeset summary and PR description.

## Versioning policy

- **Patch** — bug fixes, internal refactors, doc updates.
- **Minor** — new features. Pre-1.0, this is also where breaking changes land if they do not warrant a major bump on their own.
- **Major** — reserved for the `1.0` release and any subsequent post-1.0 breaking changes.

Each publishable package carries an independent version. `apps/playground` and `apps/docs` are listed under `ignore` and never publish.

## Storage migrations

`metadata.schemaVersion` lives on every `Diagram`. When the schema bumps:

1. The latest exporter stamps the new version on serialise.
2. The importer reads the version, applies any registered migration steps, then validates against the current Zod schema.

Migration steps are deliberately data-only — they never touch the renderer, parser, or generator. Round-trip a `.umljson` file through `importJson` followed by `exportJson` to upgrade in place.

## API changes since 0.0.0

| Change                  | Phase | Notes                                   |
| ----------------------- | ----- | --------------------------------------- |
| Initial publish surface | 0–13  | core, react, codemirror-plantuml, theme |

This table grows as the project ships releases.

## Breaking-change checklist

When you author a breaking change before 1.0:

1. Open a Changeset (`pnpm changeset`) with a **minor** bump and a `BREAKING:` prefix on the summary line.
2. Document the migration here under a fresh heading.
3. Update the relevant ADR if the change resolves an open question.
4. Mention the change in the PR description and link the affected phase from the implementation plan.

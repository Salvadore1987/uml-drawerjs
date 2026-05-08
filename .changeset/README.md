# Changesets

This directory holds [Changesets](https://github.com/changesets/changesets) for the monorepo.

To add a changeset describing a user-facing change:

```bash
pnpm changeset
```

Then follow the prompts. The generated `.md` file is committed alongside your PR. On release, `pnpm version-packages` consumes them and `pnpm release` publishes affected packages.

`apps/playground` and `apps/docs` are listed under `ignore` — they are not published.

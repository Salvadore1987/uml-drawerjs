/**
 * Phase 14 — bundle-size guard.
 *
 * Spec NFR: core + react + ELK ≤ 500 KB gzip. The skin sits in the
 * playground and is not part of the published bundle, so it doesn't
 * count toward this budget.
 *
 * Each entry below names a budget that CI enforces via `pnpm size`.
 * Tighten the numbers as the implementation matures — the initial
 * limits are sized to today's MVP plus a small headroom.
 *
 * Run prerequisite: `pnpm build` (the dist/ folders below must exist).
 */
module.exports = [
  {
    name: "@uml-drawer/core (full barrel without ELK)",
    path: "packages/core/dist/index.js",
    import: "*",
    limit: "40 KB",
    ignore: ["elkjs", "elkjs/lib/elk.bundled.js"],
  },
  {
    name: "@uml-drawer/core/parser",
    path: "packages/core/dist/parser/index.js",
    import: "*",
    limit: "8 KB",
  },
  {
    name: "@uml-drawer/core/renderer",
    path: "packages/core/dist/renderer/index.js",
    import: "*",
    limit: "10 KB",
  },
  {
    name: "@uml-drawer/core/layout",
    path: "packages/core/dist/layout/index.js",
    import: "*",
    limit: "3 KB",
    ignore: ["elkjs", "elkjs/lib/elk.bundled.js"],
  },
  {
    name: "@uml-drawer/react",
    path: "packages/react/dist/index.js",
    import: "*",
    limit: "10 KB",
    ignore: ["react", "react-dom", "react/jsx-runtime", "@uml-drawer/core"],
  },
  {
    name: "@uml-drawer/react styles.css",
    path: "packages/react/dist/styles.css",
    limit: "6 KB",
  },
];

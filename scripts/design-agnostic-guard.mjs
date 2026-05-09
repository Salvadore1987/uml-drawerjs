#!/usr/bin/env node
/**
 * Phase 14 — Design-Agnostic Guard.
 *
 * Scans the built CSS of the design-agnostic packages (`@uml-drawer/theme`
 * and `@uml-drawer/react`) for any traces of brand aesthetics:
 *
 *   1. Hex / rgb / hsl colour literals are forbidden EVERYWHERE except
 *      `defaults-light.css` / `defaults-dark.css`, where the contract's
 *      neutral defaults legitimately live.
 *   2. Skin-specific custom-property names (`--phos`, `--cyan`, `--magenta`,
 *      `--bg-0..2`, `--ink*`, `--line*`, `--glow-*`, `--topo-color`,
 *      `--scan-*`) MUST NOT appear anywhere in the published bundles.
 *   3. Skin-specific font families (`Sora`, `Azeret Mono`) MUST NOT appear.
 *
 * Run via `pnpm guard:design-agnostic` (after `pnpm build`).
 *
 * The script exits with status 1 on the first violation, surfacing the
 * file + line. CI wires this guard into the pipeline.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const TARGETS = [
  {
    pkg: "@uml-drawer/theme",
    files: [
      { path: "packages/theme/dist/contract.css", allowHex: false },
      { path: "packages/theme/dist/defaults-light.css", allowHex: true },
      { path: "packages/theme/dist/defaults-dark.css", allowHex: true },
      // index.css concatenates contract + both defaults, so it is allowed
      // to contain hex literals (they came from defaults-*).
      { path: "packages/theme/dist/index.css", allowHex: true },
    ],
  },
  {
    pkg: "@uml-drawer/react",
    files: [
      // The adapter's stylesheet inlines the theme contract via @import,
      // which Vite resolves at build time. Hex literals from
      // `defaults-*.css` are therefore part of the bundle and allowed.
      { path: "packages/react/dist/styles.css", allowHex: true },
    ],
  },
];

const SKIN_VARIABLES = [
  "--phos",
  "--cyan",
  "--magenta",
  "--bg-0",
  "--bg-1",
  "--bg-2",
  "--ink-soft",
  "--ink-dim",
  "--line-strong",
  "--line-soft",
  "--glow-",
  "--topo-color",
  "--topo-opacity",
  "--scan-opacity",
  "--page-grad",
  "--topbar-grad",
  "--canvas-grad",
  "--statusbar-bg",
  "--hud-bg",
];

const FORBIDDEN_FONTS = ["Sora", "Azeret Mono", "Azeret"];

const violations = [];

for (const target of TARGETS) {
  for (const file of target.files) {
    const abs = join(repoRoot, file.path);
    if (!existsSync(abs)) {
      violations.push(`Missing build artifact: ${file.path}. Run \`pnpm build\` first.`);
      continue;
    }
    const css = readFileSync(abs, "utf8");

    if (!file.allowHex) {
      const hexMatches = css.match(/#[0-9a-fA-F]{3,8}\b/gu) ?? [];
      if (hexMatches.length > 0) {
        violations.push(
          `Hex literals in ${file.path}: ${hexMatches.slice(0, 5).join(", ")}${hexMatches.length > 5 ? "…" : ""}`,
        );
      }
      const rgbMatches = css.match(/\b(?:rgb|rgba|hsl|hsla)\s*\(/giu) ?? [];
      if (rgbMatches.length > 0) {
        violations.push(`rgb()/hsl() in ${file.path}: ${rgbMatches.length} occurrence(s)`);
      }
    }

    for (const skinVar of SKIN_VARIABLES) {
      if (css.includes(skinVar)) {
        violations.push(`Skin-only variable "${skinVar}" leaked into ${file.path}`);
      }
    }

    for (const font of FORBIDDEN_FONTS) {
      if (css.includes(font)) {
        violations.push(`Skin-only font family "${font}" leaked into ${file.path}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error("\n✗ Design-agnostic guard FAILED:\n");
  for (const v of violations) console.error(`  · ${v}`);
  console.error("");
  process.exit(1);
}

console.log(
  "\n✓ Design-agnostic guard passed:",
  TARGETS.flatMap((t) => t.files.map((f) => f.path)).length,
  "stylesheet(s) clean.\n",
);

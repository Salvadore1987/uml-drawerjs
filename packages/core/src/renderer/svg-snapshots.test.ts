import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { exportSvg } from "../exporters/svg.js";
import { buildThemeStyleBlock } from "../exporters/svg.js";
import { layoutGrid } from "../layout/fallback.js";
import type { DiagramType } from "../model/types.js";
import { parseDiagramOrThrow } from "../model/validation.js";

/**
 * Phase 14 — AST → SVG snapshot baseline.
 *
 * For every supported diagram type, deserialize the canonical fixture,
 * lay it out with the deterministic grid algorithm, and serialize via
 * `exportSvg` under both neutral light and dark theme blocks. The
 * snapshots are stored next to the fixtures so a renderer regression
 * shows up as a clean diff in code review.
 *
 * The grid layout (rather than ELK) is used so the SVG geometry is
 * deterministic across machines — ELK's layered algorithm has minor
 * platform-dependent rounding that would make the snapshots brittle.
 */
const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "../../__fixtures__");
const snapshotRoot = resolve(here, "../../__fixtures__/__svg_snapshots__");

const FIXTURES: ReadonlyArray<{ type: DiagramType; folder: string }> = [
  { type: "c4-context", folder: "c4-context" },
  { type: "c4-container", folder: "c4-container" },
  { type: "c4-component", folder: "c4-component" },
  { type: "class", folder: "class" },
  { type: "er", folder: "er" },
  { type: "sequence", folder: "sequence" },
];

const NEUTRAL_TOKENS_DARK: Record<string, string> = {
  "--uml-bg": "#0f172a",
  "--uml-bg-elevated": "#1e293b",
  "--uml-text": "#f1f5f9",
  "--uml-text-muted": "#94a3b8",
  "--uml-border": "#334155",
  "--uml-accent": "#60a5fa",
  "--uml-node-bg": "#1e293b",
  "--uml-node-text": "#f1f5f9",
  "--uml-node-border": "#475569",
  "--uml-edge-stroke": "#94a3b8",
  "--uml-edge-arrow": "#94a3b8",
  "--uml-edge-label-bg": "#1e293b",
  "--uml-edge-label-text": "#cbd5e1",
};

const NEUTRAL_TOKENS_LIGHT: Record<string, string> = {
  "--uml-bg": "#f8fafc",
  "--uml-bg-elevated": "#ffffff",
  "--uml-text": "#0f172a",
  "--uml-text-muted": "#475569",
  "--uml-border": "#cbd5e1",
  "--uml-accent": "#2563eb",
  "--uml-node-bg": "#ffffff",
  "--uml-node-text": "#0f172a",
  "--uml-node-border": "#cbd5e1",
  "--uml-edge-stroke": "#64748b",
  "--uml-edge-arrow": "#64748b",
  "--uml-edge-label-bg": "#f1f5f9",
  "--uml-edge-label-text": "#475569",
};

if (!existsSync(snapshotRoot)) mkdirSync(snapshotRoot, { recursive: true });

describe("renderer — AST → SVG snapshots", () => {
  for (const fixture of FIXTURES) {
    for (const theme of ["dark", "light"] as const) {
      it(`${fixture.type} · ${theme} theme matches snapshot`, () => {
        // Arrange
        const jsonPath = resolve(fixtureRoot, fixture.folder, "sample.json");
        const diagram = parseDiagramOrThrow(JSON.parse(readFileSync(jsonPath, "utf-8")));
        const tokens = theme === "dark" ? NEUTRAL_TOKENS_DARK : NEUTRAL_TOKENS_LIGHT;
        const layout = layoutGrid(diagram, { nodeWidth: 200 });

        // Act
        const svg = exportSvg(diagram, {
          coordinates: layout.coordinates,
          themeStyleBlock: buildThemeStyleBlock(tokens),
          includeXmlDeclaration: false,
        });

        // Assert — compare against on-disk baseline. The first run writes
        // the file; subsequent runs assert byte-equality. Update with
        // `UPDATE_SVG_SNAPSHOTS=1 pnpm test`.
        const snapshotPath = resolve(snapshotRoot, `${fixture.folder}.${theme}.svg`);
        if (process.env["UPDATE_SVG_SNAPSHOTS"] || !existsSync(snapshotPath)) {
          writeFileSync(snapshotPath, svg);
          return;
        }
        const expected = readFileSync(snapshotPath, "utf-8");
        expect(svg).toBe(expected);
      });
    }
  }

  it("does not embed any non-contract colour literal in the body", () => {
    // Arrange
    const jsonPath = resolve(fixtureRoot, "class", "sample.json");
    const diagram = parseDiagramOrThrow(JSON.parse(readFileSync(jsonPath, "utf-8")));

    // Act — render WITHOUT a themeStyleBlock so the output references
    // raw `var(--uml-*)` tokens. This is the design-agnostic path.
    const svg = exportSvg(diagram);

    // Strip the `<svg ...>` opening tag (which carries diagram-type data
    // attributes that may include colour-named tokens in the future).
    const body = svg.replace(/^<svg[^>]*>/u, "");

    // Assert
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(body).not.toMatch(/\brgb\(/iu);
    expect(body).not.toMatch(/\bhsl\(/iu);
  });
});

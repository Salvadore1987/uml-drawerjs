import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const stylesheet = readFileSync(join(here, "styles.css"), "utf8");

/**
 * Design-agnostic guard. The adapter stylesheet must:
 *
 *   - never hardcode hex/rgb/hsl colours (everything goes through `--uml-*`);
 *   - never reference skin-only CSS variables (`--phos`, `--cyan`, `--bg-0`,
 *     `--ink`, `--magenta`, `--topo-color`, `--scanline-*`, `--glow-*`);
 *   - never mention `Sora` / `Azeret Mono` font families.
 *
 * CI re-runs this against the *built* CSS (Phase 14). The unit-level
 * version here defends the source from regressions during edits.
 */
describe("styles.css — design-agnostic guard", () => {
  it("contains no hex colour literals", () => {
    const matches = stylesheet.match(/#[0-9a-fA-F]{3,8}\b/gu) ?? [];
    expect(matches, `Hex literals found: ${matches.join(", ")}`).toEqual([]);
  });

  it("contains no rgb/hsl colour literals", () => {
    const matches = stylesheet.match(/\b(?:rgb|rgba|hsl|hsla)\s*\(/giu) ?? [];
    expect(matches).toEqual([]);
  });

  it("contains no skin-only CSS variable names", () => {
    const skinVars = [
      "--phos",
      "--cyan",
      "--magenta",
      "--bg-0",
      "--bg-1",
      "--bg-2",
      "--ink",
      "--ink-strong",
      "--ink-soft",
      "--line",
      "--line-strong",
      "--line-soft",
      "--glow-",
      "--topo-color",
      "--scanline",
    ];
    for (const variable of skinVars) {
      expect(
        stylesheet.includes(variable),
        `Skin-only token leaked into adapter CSS: ${variable}`,
      ).toBe(false);
    }
  });

  it("contains no skin-only font families", () => {
    expect(stylesheet).not.toMatch(/Sora/u);
    expect(stylesheet).not.toMatch(/Azeret Mono/u);
  });

  it("references only `--uml-*` custom properties via var()", () => {
    const matches = stylesheet.match(/var\((--[a-z0-9-]+)/gu) ?? [];
    for (const match of matches) {
      expect(match.startsWith("var(--uml-"), `Unexpected token: ${match}`).toBe(true);
    }
  });
});

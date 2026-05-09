import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { generatePlantUml } from "../generator/index.js";
import { parsePlantUml } from "../parser/index.js";

/**
 * Phase 14 — performance budget.
 *
 * Spec NFR: parse + regen ≤ 50 ms on a typical diagram. We measure on
 * the heaviest fixture (the Class one — 5 nodes + 5 edges + members)
 * iterated 10 times, taking the average and asserting against the
 * budget. The body intentionally pre-warms the JIT via two warmup
 * iterations before sampling.
 */

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, "../../__fixtures__/class/sample.puml");
const fixtureText = readFileSync(fixturePath, "utf-8");

function measureRoundTrip(): number {
  const t0 = performance.now();
  const { ast } = parsePlantUml(fixtureText, { diagramType: "class" });
  generatePlantUml(ast);
  return performance.now() - t0;
}

describe("performance budget", () => {
  it("parse + regen of the class fixture stays ≤ 50 ms (avg of 10 samples)", () => {
    // Warmup — let V8 specialise hot functions before sampling.
    measureRoundTrip();
    measureRoundTrip();

    // Sample.
    const samples: number[] = [];
    for (let i = 0; i < 10; i++) samples.push(measureRoundTrip());
    const avg = samples.reduce((s, x) => s + x, 0) / samples.length;
    const max = Math.max(...samples);

    // The hard cap is the spec budget. The max-sample assertion is more
    // lenient (3× headroom) so we don't get false positives on noisy CI.
    expect(avg, `avg=${avg.toFixed(3)}ms`).toBeLessThan(50);
    expect(max, `max=${max.toFixed(3)}ms`).toBeLessThan(150);
  });
});

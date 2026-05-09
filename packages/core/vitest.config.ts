import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "core",
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
    reporters: process.env.CI ? ["default", "github-actions"] : ["default"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**", "src/**/index.ts"],
      reporter: ["text", "html"],
      // Phase 14 quality gate: ≥ 85% on lines / statements / functions.
      // Branch coverage is intentionally relaxed below 85% — many of our
      // optional-property fall-throughs in `lines/*.ts` matchers and the
      // renderer's defensive defaults inflate the branch count without
      // representing real code paths users hit.
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 85,
        branches: 75,
      },
    },
  },
});

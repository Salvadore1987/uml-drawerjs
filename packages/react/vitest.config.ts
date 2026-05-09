import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "react",
    environment: "happy-dom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: false,
    reporters: process.env.CI ? ["default", "github-actions"] : ["default"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/__tests__/**", "src/**/index.ts"],
      reporter: ["text", "html"],
    },
  },
});

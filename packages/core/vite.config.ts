import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    target: "es2022",
    sourcemap: true,
    minify: false,
    lib: {
      entry: {
        index: "src/index.ts",
        "model/index": "src/model/index.ts",
        "commands/index": "src/commands/index.ts",
        "history/index": "src/history/index.ts",
        "parser/index": "src/parser/index.ts",
        "generator/index": "src/generator/index.ts",
        "validators/index": "src/validators/index.ts",
        "layout/index": "src/layout/index.ts",
        "renderer/index": "src/renderer/index.ts",
        "exporters/index": "src/exporters/index.ts",
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: [/^node:/, "zod", /^elkjs(\/.*)?$/],
      output: {
        preserveModules: false,
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
  plugins: [
    dts({
      tsconfigPath: "./tsconfig.build.json",
      entryRoot: "src",
      outDir: "dist",
      rollupTypes: false,
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**"],
    }),
  ],
});

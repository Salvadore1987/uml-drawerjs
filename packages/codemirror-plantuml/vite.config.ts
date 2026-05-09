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
        language: "src/language.ts",
        highlight: "src/highlight.ts",
        lint: "src/lint.ts",
        autocomplete: "src/autocomplete.ts",
        snippets: "src/snippets.ts",
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: [/^node:/, /^@codemirror\//, /^@lezer\//, /^@uml-drawer\/core(\/.*)?$/],
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

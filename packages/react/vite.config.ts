import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    target: "es2022",
    sourcemap: true,
    minify: false,
    cssCodeSplit: false,
    lib: {
      entry: {
        index: "src/index.ts",
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: [
        /^node:/,
        /^@uml-drawer\/core(\/.*)?$/,
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
      output: {
        preserveModules: false,
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: (asset) => {
          if (asset.name === "style.css") return "styles.css";
          return "assets/[name][extname]";
        },
      },
    },
  },
  plugins: [
    dts({
      tsconfigPath: "./tsconfig.build.json",
      entryRoot: "src",
      outDir: "dist",
      rollupTypes: false,
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/__tests__/**"],
    }),
  ],
});

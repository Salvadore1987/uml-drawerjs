import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `BASE_PATH` is set by the GitHub Pages deploy workflow so the
// playground can be served from `/uml-drawerjs/playground/`. When
// developing locally or when the env var is absent it defaults to
// `/`, which keeps `pnpm dev` working without ceremony.
const basePath = process.env["BASE_PATH"] ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
});

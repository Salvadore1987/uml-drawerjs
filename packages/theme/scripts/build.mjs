import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const src = resolve(root, "src");
const dist = resolve(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const entries = readdirSync(src);
for (const entry of entries) {
  const srcPath = join(src, entry);
  const destPath = join(dist, entry);
  const stat = statSync(srcPath);
  if (stat.isFile()) {
    cpSync(srcPath, destPath);
  }
}

const built = readdirSync(dist);
console.log(`[@uml-drawer/theme] Built ${built.length} file(s) → ${dist}`);
for (const file of built) {
  console.log(`  • ${file}`);
}

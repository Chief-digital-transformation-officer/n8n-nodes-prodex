import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const siteRoot = join(root, "..");
const outDir = join(siteRoot, "out");
const landingRoot = join(siteRoot, "..");

if (!existsSync(outDir)) {
  console.error("Missing out/ directory. Run next build first.");
  process.exit(1);
}

const legacyDir = join(landingRoot, "_legacy");
if (!existsSync(legacyDir)) mkdirSync(legacyDir, { recursive: true });

for (const entry of ["index.html", "_next", "404.html"]) {
  const src = join(outDir, entry);
  const dest = join(landingRoot, entry);
  if (!existsSync(src)) continue;
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  cpSync(src, dest, { recursive: true });
}

console.log("Exported static landing to", landingRoot);

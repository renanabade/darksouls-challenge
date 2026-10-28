/**
 * Removes TypeScript sources from the static export. Turbopack bundles the worker (`new Worker(new URL(
 * "./worker.ts", import.meta.url))`) and also emits the raw file as an asset that nothing loads, which
 * the site would then serve (issue 64).
 */
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { stdout } from "node:process";
import { fileURLToPath, URL } from "node:url";

const media = fileURLToPath(new URL("../out/_next/static/media/", import.meta.url));
let dropped = 0;
for (const name of readdirSync(media).filter((n) => /\.(m|c)?tsx?$/.test(n))) {
  rmSync(join(media, name));
  dropped++;
}
stdout.write(`dropped ${String(dropped)} TypeScript source(s) from the export
`);

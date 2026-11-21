/**
 * Copies the committed concept media into local storage under the same keys the
 * seed records, so a fresh server — or a serverless build, where storage starts
 * empty on every deploy — has every image the catalogue points at, whether or not
 * the database was seeded in this build. Local storage driver only.
 *
 *   npm run media:sync
 */
import "./_env";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ARTWORKS, OUTFITS, PRODUCTS } from "./data/drop01";

if ((process.env.STORAGE_DRIVER ?? "local") !== "local") {
  console.log("media:sync: storage driver is not local, nothing to copy.");
  process.exit(0);
}

const root = resolve(process.env.STORAGE_LOCAL_DIR ?? "./storage");
let copied = 0;
function put(from: string, key: string) {
  if (!existsSync(from)) return;
  const to = join(root, key);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  copied++;
}

for (const a of ARTWORKS) put(`assets/print-files/${a.code}.v1.svg`, `print-files/${a.code}/v1.svg`);
for (const p of PRODUCTS) {
  for (const v of p.variants) {
    const dir = `assets/concept/${v.code}`;
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (f.endsWith(".webp")) put(join(dir, f), `products/${p.slug}/${v.code}/${f}`);
  }
}
for (const o of OUTFITS) put(`assets/concept/outfits/${o.slug}.webp`, `outfits/${o.slug}.webp`);

console.log(`media:sync: ${copied} files in ${root}`);

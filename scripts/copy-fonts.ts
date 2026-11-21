// Copies the open-licensed web fonts from @fontsource packages into src/app/fonts
// so next/font/local can self-host them (no third-party font CDN at runtime).
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const files: [string, string][] = [
  ["@fontsource-variable/big-shoulders/files/big-shoulders-latin-wght-normal.woff2", "big-shoulders-wght.woff2"],
  ["@fontsource-variable/archivo/files/archivo-latin-wght-normal.woff2", "archivo-wght.woff2"],
  ["@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2", "ibm-plex-mono-400.woff2"],
  ["@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2", "ibm-plex-mono-500.woff2"],
  ["@fontsource/big-shoulders-stencil-display/files/big-shoulders-stencil-display-latin-800-normal.woff2", "big-shoulders-stencil-800.woff2"],
];
mkdirSync("src/app/fonts", { recursive: true });
for (const [src, dest] of files) copyFileSync(`node_modules/${src}`, `src/app/fonts/${dest}`);
const licences = ["@fontsource-variable/big-shoulders", "@fontsource-variable/archivo", "@fontsource/ibm-plex-mono", "@fontsource/big-shoulders-stencil-display"]
  .map((p) => `===== ${p} =====\n${readFileSync(`node_modules/${p}/LICENSE`, "utf8")}`)
  .join("\n\n");
writeFileSync("src/app/fonts/LICENSES.txt", licences);
console.log("fonts copied");

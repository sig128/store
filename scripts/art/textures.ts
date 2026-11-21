/** Seamless UI textures (tileable): film grain and concrete. `npx tsx scripts/art/textures.ts` */
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { Resvg } from "@resvg/resvg-js";

export async function buildTextures() {
  mkdirSync("public/textures", { recursive: true });
  const grain = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><filter id="g" x="0" y="0" width="256" height="256" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="2" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.4 -0.62"/></filter><rect width="256" height="256" filter="url(#g)"/></svg>`;
  await sharp(Buffer.from(new Resvg(grain).render().asPng())).png({ compressionLevel: 9 }).toFile("public/textures/grain.png");
  const S = 512;
  const cif = `filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB" x="0" y="0" width="${S}" height="${S}"`;
  const concrete = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><defs>
<filter id="stain" ${cif}><feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="4" seed="7" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer></filter>
<filter id="agg" ${cif}><feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="8" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer></filter>
</defs><rect width="${S}" height="${S}" fill="#808080"/><rect width="${S}" height="${S}" filter="url(#stain)" opacity="0.6"/><rect width="${S}" height="${S}" filter="url(#agg)" opacity="0.45" style="mix-blend-mode:overlay"/></svg>`;
  await sharp(Buffer.from(new Resvg(concrete).render().asPng())).webp({ quality: 72 }).toFile("public/textures/concrete.webp");
}

if (process.argv[1]?.endsWith("textures.ts")) {
  buildTextures().then(() => console.log("textures built"));
}

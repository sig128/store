/**
 * Builds every generated visual asset:
 *   assets/print-files/*.svg        clean vector print masters (one per artwork code)
 *   assets/concept/<variant>/*.webp concept renders (front, back, unlit hero view, print detail)
 *   assets/concept/outfits/*.webp   styled flat-lays for "Build the fit" + hotspots.json
 *   public/scenes/*.webp            hero illustration (desktop + mobile crop)
 *   public/textures/*               UI grain + concrete tiles
 *   public/og/*.jpg                 social cards
 *   assets/manifest.json            asset manifest: provenance, rights, licences, versions
 *
 * Run: npm run art:build   (deterministic; re-run after changing brand config)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { Resvg } from "@resvg/resvg-js";
import { brand } from "../../src/config/brand";
import { ARTWORKS, LOCKER_TAG_TEMPLATE, OUTFITS, PRODUCTS } from "../data/drop01";
import { artFor, placed } from "./artwork";
import { CANVAS, GARMENTS } from "./garments";
import { FONT_FILES, fontVersion, type FontKey } from "./lib/fonts";
import * as P from "./prints";
import { concreteFloor, heroScene, HERO, socialCard } from "./scenes";
import { garmentSvg, renderPng, type PlacedPrint } from "./render";
import { buildTextures } from "./textures";

const out = (p: string) => {
  mkdirSync(dirname(p), { recursive: true });
  return p;
};

const manifest: {
  generatedAt: string;
  brand: string;
  notes: string[];
  fonts: unknown[];
  printFiles: unknown[];
  conceptRenders: unknown[];
  scenes: unknown[];
  excluded: unknown[];
  personalizationTemplates: unknown[];
} = {
  generatedAt: new Date().toISOString(),
  brand: brand.name,
  notes: [
    "All artwork in this repository was drawn programmatically for this project (scripts/art). No third-party images, photographs or game assets are used.",
    "Concept renders are illustrations of intended garments. They are NOT photographs of produced stock and are labelled 'Concept render' wherever shown.",
    "Print files are design masters. Before production they need designer review, colour separation and supplier approval (status: concept).",
    "3D Rack maps (public/3d) are baked by scripts/art/garment3d.ts from the same garment drawings: concept geometry for the real-time Rack, not scans of produced stock. Listed in public/3d/manifest.json.",
  ],
  fonts: [],
  printFiles: [],
  conceptRenders: [],
  scenes: [],
  excluded: [
    {
      item: "Vice City banner (referenced in the brief)",
      status: "Not included. Not supplied to this build; commercial rights unconfirmed. Used only as a written mood reference.",
    },
    {
      item: "vendettasociety.shop",
      status: "Studied for UX patterns only (hero product, lookbook hotspots, size access, personalisation). No layout, photography, product names, assets or copy copied.",
    },
    {
      item: "Game trademarks, logos and fonts (e.g. GTA / Vice City wordmarks, 'Pricedown'-style lettering)",
      status: "Deliberately not used.",
    },
  ],
  personalizationTemplates: [],
};

/* ───────────── fonts ───────────── */
for (const [key, f] of Object.entries(FONT_FILES)) {
  manifest.fonts.push({
    key,
    name: f.name,
    license: f.license,
    source: `npm @fontsource (${f.file.split("/")[1]})`,
    version: fontVersion(key as FontKey),
    usage: "Outlined into print artwork (no font embedding in print files).",
  });
}
manifest.fonts.push(
  { name: "Big Shoulders (variable)", license: "SIL OFL 1.1", usage: "Website display type", source: "@fontsource-variable/big-shoulders" },
  { name: "Archivo (variable)", license: "SIL OFL 1.1", usage: "Website UI/shopping type", source: "@fontsource-variable/archivo" },
  { name: "IBM Plex Mono", license: "SIL OFL 1.1", usage: "Website measurement numerals", source: "@fontsource/ibm-plex-mono" },
  { name: "Big Shoulders Stencil Display 800", license: "SIL OFL 1.1", usage: "Locker Tag personalisation (preview + production)", source: "@fontsource/big-shoulders-stencil-display" },
);

/* ───────────── artwork ───────────── */
for (const def of ARTWORKS) {
  const art = artFor(def.code);
  const file = `assets/print-files/${def.code}.v1.svg`;
  // Masters: transparent background, ink-only. Knock-outs use the intended garment colour.
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!-- ${brand.name} — ${def.title}. Artwork code ${def.code}, version 1. Original artwork created for this project. -->
<!-- Inks: ${art.inks.join(", ")}. Knock-out colour (garment): ${def.ground}. Status: concept — requires production review. -->
<svg xmlns="http://www.w3.org/2000/svg" width="${art.w}" height="${art.h}" viewBox="0 0 ${art.w} ${art.h}"><defs>${art.defs ?? ""}</defs>${art.body}</svg>
`;
  writeFileSync(out(file), svg);
  manifest.printFiles.push({
    code: def.code,
    version: 1,
    family: def.family,
    title: def.title,
    file,
    inks: art.inks,
    knockOutColour: def.ground,
    rights: "original_owned — drawn for this project; fonts used are open-licensed and outlined",
    status: "concept",
  });
}
console.log(`print files: ${ARTWORKS.length}`);

/* ───────────── concept renders ───────────── */
interface Rendered {
  file: string;
  kind: string;
  width: number;
  height: number;
}
const variantMedia: Record<string, Rendered[]> = {};
const pngCache = new Map<string, Buffer>();

async function writeWebp(png: Buffer, file: string, quality = 84): Promise<{ width: number; height: number }> {
  const info = await sharp(png).webp({ quality, alphaQuality: 90, effort: 5 }).toFile(out(file));
  return { width: info.width, height: info.height };
}

for (const product of PRODUCTS) {
  for (const v of product.variants) {
    const list: Rendered[] = [];
    for (const view of ["front", "back"] as const) {
      const svg = garmentSvg({
        category: product.category,
        view,
        color: v.render.color,
        trim: v.render.trim,
        wash: v.render.wash,
        prints: placed(v.prints, view),
        state: "lit",
        seed: v.code.length * 7 + view.length,
      });
      const png = renderPng(svg, CANVAS.w);
      pngCache.set(`${v.code}:${view}`, png);
      const file = `assets/concept/${v.code}/${view}.webp`;
      const dims = await writeWebp(png, file);
      list.push({ file, kind: view, ...dims });
      if (view === product.heroView) {
        // Unlit counterpart for the rack light sweep: same garment, no print, before the light reaches it.
        const dark = garmentSvg({
          category: product.category,
          view,
          color: v.render.color,
          trim: v.render.trim,
          wash: v.render.wash,
          prints: [],
          state: "dark",
          seed: v.code.length * 7 + view.length,
        });
        const dfile = `assets/concept/${v.code}/${view}_unlit.webp`;
        const ddims = await writeWebp(renderPng(dark, CANVAS.w), dfile, 80);
        list.push({ file: dfile, kind: `${view}_unlit`, ...ddims });
        // Print detail: crop the main print area at high resolution.
        const main = v.prints.find((p) => p.view === view) ?? v.prints[0];
        if (main) {
          const area = GARMENTS[product.category][main.view].areas[main.area];
          if (area) {
            const pad = Math.max(area.w, area.h) * 0.12;
            const side = Math.round(Math.max(area.w, area.h) + pad * 2);
            const left = Math.max(0, Math.round(area.x + area.w / 2 - side / 2));
            const top = Math.max(0, Math.round(area.y + area.h / 2 - side / 2));
            const detailSvg = garmentSvg({
              category: product.category,
              view: main.view,
              color: v.render.color,
              trim: v.render.trim,
              wash: v.render.wash,
              prints: placed(v.prints, main.view),
              state: "lit",
              seed: v.code.length * 7 + main.view.length,
              shadow: false,
            });
            const big = renderPng(detailSvg, CANVAS.w * 2);
            const crop = { left: left * 2, top: top * 2, width: Math.min(side * 2, CANVAS.w * 2 - left * 2), height: Math.min(side * 2, CANVAS.h * 2 - top * 2) };
            const dpng = await sharp(big).extract(crop).resize({ width: 1400, height: 1400, fit: "cover" }).png().toBuffer();
            const pfile = `assets/concept/${v.code}/print_detail.webp`;
            const flat = await sharp(dpng).flatten({ background: v.render.color }).png().toBuffer();
            const pdims = await writeWebp(flat, pfile, 86);
            list.push({ file: pfile, kind: "print_detail", ...pdims });
          }
        }
      }
    }
    variantMedia[v.code] = list;
    for (const r of list) {
      manifest.conceptRenders.push({
        variant: v.code,
        product: product.slug,
        kind: r.kind,
        file: r.file,
        source: "concept_render",
        note: "Illustrated render. Not a photograph of produced stock.",
      });
    }
    console.log(`rendered ${v.code}`);
  }
}

/* ───────────── outfits (flat-lays) ───────────── */
const OUT_W = 1800;
const OUT_H = 1250;
const layouts: Record<string, { x: number; y: number; w: number; rot: number }[]> = {
  "training-0113": [
    { x: 70, y: 40, w: 920, rot: -3 },
    { x: 960, y: 10, w: 620, rot: 5 },
    { x: 1010, y: 560, w: 720, rot: -4 },
  ],
  "closing-warm-up": [
    { x: 40, y: 30, w: 960, rot: 2 },
    { x: 930, y: 0, w: 640, rot: -4 },
    { x: 1150, y: 560, w: 600, rot: 6 },
    { x: 870, y: 610, w: 470, rot: -7 },
  ],
};
const hotspots: Record<string, { product: string; variant: string; x: number; y: number }[]> = {};
const floorPng = Buffer.from(new Resvg(concreteFloor(OUT_W, OUT_H, 5)).render().asPng());

for (const outfit of OUTFITS) {
  const layout = layouts[outfit.slug]!;
  const comps: OverlayOptions[] = [];
  const spots: (typeof hotspots)[string] = [];
  // draw in reverse so the first (statement) piece sits on top
  const order = outfit.items.map((it, i) => ({ it, i })).reverse();
  for (const { it, i } of order) {
    const l = layout[i]!;
    const product = PRODUCTS.find((p) => p.slug === it.product)!;
    const png = pngCache.get(`${it.variant}:${it.view}`)!;
    const scaled = await sharp(png).resize({ width: l.w }).toBuffer();
    const rotated = await sharp(scaled).rotate(l.rot, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const meta = await sharp(rotated).metadata();
    const left = Math.round(l.x - ((meta.width ?? l.w) - l.w) / 2);
    const top = Math.round(l.y - ((meta.height ?? 0) - (l.w * 1.25)) / 2);
    comps.push({ input: rotated, left, top });
    // hotspot on the garment's chest/upper body (35% down the canvas height)
    const hx = l.x + l.w / 2;
    const hy = l.y + l.w * 1.25 * (product.category === "shorts" ? 0.42 : 0.38);
    spots[i] = { product: it.product, variant: it.variant, x: Math.round((hx / OUT_W) * 10000), y: Math.round((hy / OUT_H) * 10000) };
  }
  const composed = await sharp(floorPng).composite(comps).png().toBuffer();
  const file = `assets/concept/outfits/${outfit.slug}.webp`;
  await writeWebp(composed, file, 82);
  hotspots[outfit.slug] = spots;
  manifest.conceptRenders.push({ outfit: outfit.slug, kind: "lookbook", file, source: "concept_render", note: "Styled flat-lay composed from concept renders." });
  console.log(`outfit ${outfit.slug}`);
}
writeFileSync(out("assets/concept/outfits/hotspots.json"), JSON.stringify(hotspots, null, 2));

/* ───────────── hero scene + textures ───────────── */
const poster = P.nightGarageRear(P.INKS_ON_DARK("#1f201e"), "NG-POSTER");
const heroDesktop = Buffer.from(new Resvg(heroScene(poster), { fitTo: { mode: "width", value: HERO.w } }).render().asPng());
await sharp(heroDesktop).webp({ quality: 74, effort: 6 }).toFile(out("public/scenes/hero-desktop.webp"));
const heroMobile = Buffer.from(
  new Resvg(heroScene(poster, { x: 1085, y: 0, w: 900, h: 1350 }), { fitTo: { mode: "width", value: 1200 } }).render().asPng(),
);
await sharp(heroMobile).webp({ quality: 72, effort: 6 }).toFile(out("public/scenes/hero-mobile.webp"));
// tiny blurred placeholders (inlined by the page as background while the image decodes)
const heroBlur = await sharp(heroDesktop).resize(32).webp({ quality: 40 }).toBuffer();
writeFileSync(out("src/app/(store)/_scenes/hero-blur.ts"), `// generated by scripts/art/build.ts\nexport const HERO_BLUR = "data:image/webp;base64,${heroBlur.toString("base64")}";\n`);
manifest.scenes.push(
  { file: "public/scenes/hero-desktop.webp", note: "Original illustration: coastal gym at 1:13 a.m. Concept art." },
  { file: "public/scenes/hero-mobile.webp", note: "Mobile crop of the same illustration." },
);

await buildTextures();

/* ───────────── social cards ───────────── */
for (const product of PRODUCTS) {
  const v = product.variants[0]!;
  const png = pngCache.get(`${v.code}:${product.heroView}`)!;
  const svg = socialCard({ productName: product.name, category: product.categoryLabel, garmentPngBase64: png.toString("base64"), ratio: CANVAS.w / CANVAS.h });
  const card = Buffer.from(new Resvg(svg).render().asPng());
  await sharp(card).jpeg({ quality: 82, mozjpeg: true }).toFile(out(`public/og/${product.slug}.jpg`));
}
{
  const svg = socialCard({
    productName: brand.heroHeadline.split(".")[0] ?? "LAST SET",
    category: brand.dropName,
    garmentPngBase64: pngCache.get("LS-WBLK:back")!.toString("base64"),
    ratio: CANVAS.w / CANVAS.h,
  });
  await sharp(Buffer.from(new Resvg(svg).render().asPng())).jpeg({ quality: 82, mozjpeg: true }).toFile(out("public/og/default.jpg"));
}

/* ───────────── personalisation template + manifest ───────────── */
const lt = GARMENTS.singlet.back.areas.locker_tag!;
manifest.personalizationTemplates.push({
  code: LOCKER_TAG_TEMPLATE.code,
  version: LOCKER_TAG_TEMPLATE.version,
  font: { name: FONT_FILES.stencil800.name, version: fontVersion("stencil800"), license: FONT_FILES.stencil800.license },
  areaOnRenderFraction: { x: lt.x / CANVAS.w, y: lt.y / CANVAS.h, w: lt.w / CANVAS.w, h: lt.h / CANVAS.h },
  areaMm: LOCKER_TAG_TEMPLATE.areaMm,
  status: "draft — print area in mm must be confirmed by the supplier before enabling in production",
});
writeFileSync(out("assets/concept/variant-media.json"), JSON.stringify(variantMedia, null, 2));
writeFileSync(out("assets/manifest.json"), JSON.stringify(manifest, null, 2));
console.log("art build complete");

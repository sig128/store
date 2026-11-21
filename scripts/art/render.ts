/**
 * Garment renderer: silhouette + construction + print + fabric texture + one
 * consistent overhead light. Every garment in the store is rendered through this
 * so lighting, crop, texture and colour handling stay identical.
 */
import { Resvg } from "@resvg/resvg-js";
import { CANVAS, GARMENTS, type Box, type GarmentView } from "./garments";
import type { PrintArt } from "./prints";
import { fitTransform } from "./lib/svg";
import type { ProductCategory } from "../../src/lib/types";

export interface PlacedPrint {
  art: PrintArt;
  area: string;
  method?: "print" | "embroidery";
  /** optional override box (fractions of the named area) */
  inset?: number;
}

export interface RenderOpts {
  category: ProductCategory;
  view: "front" | "back";
  color: string;
  trim?: string;
  /** 0..1 how strongly garment-dyed/washed the fabric looks */
  wash?: number;
  prints: PlacedPrint[];
  /** lit = studio light with prints; dark = same garment before the light reaches it;
   *  albedo = flat fabric colour + prints + construction, no baked light (for 3D materials) */
  state: "lit" | "dark" | "albedo";
  seed?: number;
  shadow?: boolean;
}

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
/** shade -1..1: mix toward black or white */
export function shade(hex: string, s: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (s >= 0) return rgbToHex([r + (255 - r) * s, g + (255 - g) * s, b + (255 - b) * s]);
  return rgbToHex([r * (1 + s), g * (1 + s), b * (1 + s)]);
}
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function garmentSvg(o: RenderOpts): string {
  const g = GARMENTS[o.category];
  const v: GarmentView = g[o.view];
  const { w, h } = CANVAS;
  const seed = o.seed ?? 7;
  const isLight = luminance(o.color) > 0.45;
  const wash = o.wash ?? 0.5;
  const trim = o.trim ?? o.color;

  const defs: string[] = [];
  const body: string[] = [];
  const full = `x="0" y="0" width="${w}" height="${h}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"`;

  defs.push(`<clipPath id="body"><path d="${v.silhouette}"/></clipPath>`);
  defs.push(`<filter id="fx-shadow" ${full}><feGaussianBlur stdDeviation="22"/></filter>`);
  defs.push(`<filter id="fx-contact" ${full}><feGaussianBlur stdDeviation="6"/></filter>`);
  for (const b of [6, 8, 10, 12, 14, 16, 18, 20, 26, 30, 34, 55, 60, 70]) {
    defs.push(`<filter id="fx-b${b}" ${full}><feGaussianBlur stdDeviation="${b}"/></filter>`);
  }
  // Wash mottling: large soft patches
  defs.push(
    `<filter id="fx-mottle" ${full}><feTurbulence type="fractalNoise" baseFrequency="0.0042" numOctaves="4" seed="${seed}"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="1.5" intercept="-0.3"/><feFuncG type="linear" slope="1.5" intercept="-0.3"/><feFuncB type="linear" slope="1.5" intercept="-0.3"/><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer></filter>`,
  );
  // Knit / fleece / woven grain
  const grainFreq = g.fabric === "fleece" ? "1.1 0.9" : g.fabric === "woven" ? "1.4 1.4" : "0.95 0.38";
  defs.push(
    `<filter id="fx-grain" ${full}><feTurbulence type="fractalNoise" baseFrequency="${grainFreq}" numOctaves="2" seed="${seed + 3}"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer></filter>`,
  );
  // Ink on fabric: slight warp + tiny wear speckle
  defs.push(
    `<filter id="fx-ink" ${full}><feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="2" seed="${seed + 9}" result="warp"/><feDisplacementMap in="SourceGraphic" in2="warp" scale="7" xChannelSelector="R" yChannelSelector="G" result="d"/><feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="${seed + 4}" result="sp"/><feColorMatrix in="sp" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  12 0 0 0 -2.4" result="spa"/><feComposite in="d" in2="spa" operator="in"/></filter>`,
  );
  // Embroidery: thread streaks + raised shadow
  defs.push(
    `<filter id="fx-emb" ${full}><feOffset in="SourceAlpha" dx="0" dy="3" result="o"/><feGaussianBlur in="o" stdDeviation="2.5" result="ob"/><feFlood flood-color="#000" flood-opacity="0.6"/><feComposite in2="ob" operator="in" result="shadow"/><feTurbulence type="fractalNoise" baseFrequency="0.9 0.05" numOctaves="1" seed="${seed + 2}" result="t"/><feColorMatrix in="t" type="saturate" values="0" result="tg"/><feBlend in="tg" in2="SourceGraphic" mode="overlay" result="st"/><feComposite in="st" in2="SourceAlpha" operator="in" result="stc"/><feMerge><feMergeNode in="shadow"/><feMergeNode in="stc"/></feMerge></filter>`,
  );
  // Overhead light
  defs.push(
    `<radialGradient id="g-light" gradientUnits="userSpaceOnUse" cx="600" cy="330" r="1080"><stop offset="0" stop-color="#fff" stop-opacity="${isLight ? 0.08 : 0.11}"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${isLight ? 0.3 : 0.42}"/></radialGradient>`,
  );
  defs.push(
    `<linearGradient id="g-sheen" gradientUnits="userSpaceOnUse" x1="300" y1="250" x2="900" y2="1250"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.38" stop-color="#fff" stop-opacity="0.07"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="0.7" stop-color="#fff" stop-opacity="0.04"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`,
  );

  // 1. Drop shadow + contact shadow (the garment lies on a surface)
  const albedo = o.state === "albedo";
  if (o.shadow !== false && !albedo) {
    const shapes = [...v.behind.map((b) => b.d), v.silhouette].join("");
    body.push(`<path d="${shapes}" fill="#000" opacity="0.55" filter="url(#fx-shadow)" transform="translate(0 26)"/>`);
    body.push(`<path d="${shapes}" fill="#000" opacity="0.5" filter="url(#fx-contact)" transform="translate(0 6)"/>`);
  }

  // 2. Layers behind the body (hood)
  for (const b of v.behind) {
    const c = shade(b.trim ? trim : o.color, b.shade);
    body.push(`<path d="${b.d}" fill="${c}"/>`);
  }
  if (v.behind.length) {
    // light texture on the hood too
    body.push(`<g opacity="${0.35 + wash * 0.25}" style="mix-blend-mode:soft-light"><rect width="${w}" height="${h}" filter="url(#fx-mottle)" clip-path="url(#hoodclip)"/></g>`);
    defs.push(`<clipPath id="hoodclip"><path d="${v.behind.map((b) => b.d).join("")}"/></clipPath>`);
  }

  // 3. Body
  const inner: string[] = [];
  inner.push(`<rect width="${w}" height="${h}" fill="${o.color}"/>`);
  for (const p of v.panels) inner.push(`<path d="${p.d}" fill="${shade(p.trim ? trim : o.color, p.shade)}"/>`);
  for (const r of v.ribs) {
    const base = shade(r.trim ? trim : o.color, r.shade);
    inner.push(`<path d="${r.d}" fill="none" stroke="${base}" stroke-width="${r.width}" stroke-linejoin="round"/>`);
    inner.push(
      `<path d="${r.d}" fill="none" stroke="${shade(base, isLight || luminance(base) > 0.45 ? -0.18 : 0.14)}" stroke-width="${r.width}" stroke-dasharray="2.4 3.2" opacity="0.55"/>`,
    );
  }

  // 4. Prints
  if (o.state === "lit" || albedo) {
    for (const pp of o.prints) {
      const box: Box | undefined = v.areas[pp.area];
      if (!box) continue;
      const inset = pp.inset ?? 0;
      const dst = { x: box.x + box.w * inset, y: box.y + box.h * inset, w: box.w * (1 - 2 * inset), h: box.h * (1 - 2 * inset) };
      if (pp.art.defs) defs.push(pp.art.defs);
      const t = fitTransform({ w: pp.art.w, h: pp.art.h }, dst);
      const filter = pp.method === "embroidery" ? "fx-emb" : "fx-ink";
      inner.push(`<g filter="url(#${filter})" opacity="${pp.method === "embroidery" ? 1 : 0.95}"><g transform="${t}">${pp.art.body}</g></g>`);
    }
  }

  // 5. Fabric texture over everything (prints included, so ink sits in the cloth)
  inner.push(`<rect width="${w}" height="${h}" filter="url(#fx-mottle)" opacity="${(0.12 + wash * 0.36).toFixed(2)}" style="mix-blend-mode:soft-light"/>`);
  inner.push(`<rect width="${w}" height="${h}" filter="url(#fx-grain)" opacity="${g.fabric === "woven" ? 0.14 : 0.24}" style="mix-blend-mode:soft-light"/>`);
  if (g.fabric === "woven") inner.push(`<rect width="${w}" height="${h}" fill="url(#g-sheen)"/>`);

  // 6. Stitching
  const thread = shade(o.color, isLight ? -0.22 : 0.2);
  for (const s of v.stitches) {
    inner.push(`<path d="${s}" fill="none" stroke="#000" stroke-width="2.2" stroke-dasharray="7 5" opacity="0.28" transform="translate(0 1.4)"/>`);
    inner.push(`<path d="${s}" fill="none" stroke="${thread}" stroke-width="2" stroke-dasharray="7 5" opacity="0.6"/>`);
  }

  // 7. Folds (geometry carries them in 3D)
  for (const f of albedo ? [] : v.folds) {
    const col = f.kind === "shadow" ? "#000" : "#fff";
    const op = isLight ? f.o * (f.kind === "highlight" ? 0.6 : 0.5) : f.o;
    const blur = [6, 8, 10, 12, 14, 16, 18, 20, 26, 30, 34, 55, 60, 70].reduce((a, b) => (Math.abs(b - f.blur) < Math.abs(a - f.blur) ? b : a));
    inner.push(`<path d="${f.d}" fill="none" stroke="${col}" stroke-width="${f.w}" stroke-linecap="round" opacity="${op}" filter="url(#fx-b${blur})"/>`);
  }

  // 8. Hardware (cords, zips)
  const hw = v.hardware({ base: o.color, trim, dark: shade(o.color, -0.45), light: isLight ? shade(o.color, -0.3) : shade("#e9e2d4", -0.1) });
  if (hw) inner.push(hw);

  // 9. Edge volume + overhead light (real lights do this in 3D)
  if (!albedo) {
    inner.push(`<path d="${v.silhouette}" fill="none" stroke="#000" stroke-width="70" opacity="${isLight ? 0.22 : 0.4}" filter="url(#fx-b26)"/>`);
    inner.push(`<rect width="${w}" height="${h}" fill="url(#g-light)"/>`);
  }

  // 10. Unlit state: the same garment before the light reaches it
  if (o.state === "dark") {
    inner.push(`<rect width="${w}" height="${h}" fill="#06090b" opacity="${isLight ? 0.72 : 0.6}"/>`);
  }

  body.push(`<g clip-path="url(#body)">${inner.join("")}</g>`);
  if (o.state === "dark" && v.behind.length) {
    body.push(`<path d="${v.behind.map((b) => b.d).join("")}" fill="#06090b" opacity="0.6"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs.join("")}</defs>${body.join("")}</svg>`;
}

/**
 * Data maps for the 3D garments, drawn on the same canvas as the renders:
 *  mask     – silhouette (+ hood) in white
 *  folds    – fold valleys (dark) and ridges (light) on mid grey, for geometry
 *  detail   – small relief for the normal map: ribs, stitches, ink, hardware, knit grain
 *  material – R unused (white), G roughness, B metalness
 */
export function garmentMapSvg(o: { category: ProductCategory; view: "front" | "back"; prints: PlacedPrint[]; seed?: number }, kind: "mask" | "folds" | "detail" | "material"): string {
  const g = GARMENTS[o.category];
  const v: GarmentView = g[o.view];
  const { w, h } = CANVAS;
  const seed = o.seed ?? 7;
  const full = `x="0" y="0" width="${w}" height="${h}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"`;
  const shapes = [...v.behind.map((b) => b.d), v.silhouette].join("");
  const defs: string[] = [`<clipPath id="all"><path d="${shapes}"/></clipPath>`, `<filter id="flat-w" ${full}><feFlood flood-color="#fff"/><feComposite in2="SourceAlpha" operator="in"/></filter>`];
  const body: string[] = [];
  const prints = (flood: string) =>
    o.prints
      .map((pp) => {
        const box = v.areas[pp.area];
        if (!box) return "";
        if (pp.art.defs) defs.push(pp.art.defs);
        const t = fitTransform({ w: pp.art.w, h: pp.art.h }, box);
        return `<g filter="url(#flat-${flood})"><g transform="${t}">${pp.art.body}</g></g>`;
      })
      .join("");
  const hardware = v.hardware({ base: "#fff", trim: "#fff", dark: "#fff", light: "#fff" });
  const metalHardware = o.category === "jacket";

  if (kind === "mask") {
    body.push(`<path d="${shapes}" fill="#fff"/>`);
  } else if (kind === "folds") {
    defs.push(`<filter id="fb" ${full}><feGaussianBlur stdDeviation="1"/></filter>`);
    for (const b of [6, 8, 10, 12, 14, 16, 18, 20, 26, 30, 34, 55, 60, 70]) defs.push(`<filter id="fx-b${b}" ${full}><feGaussianBlur stdDeviation="${b}"/></filter>`);
    const inner = [`<rect width="${w}" height="${h}" fill="#808080"/>`];
    for (const f of v.folds) {
      const blur = [6, 8, 10, 12, 14, 16, 18, 20, 26, 30, 34, 55, 60, 70].reduce((a, b) => (Math.abs(b - f.blur) < Math.abs(a - f.blur) ? b : a));
      inner.push(`<path d="${f.d}" fill="none" stroke="${f.kind === "shadow" ? "#000" : "#fff"}" stroke-width="${f.w * 1.15}" stroke-linecap="round" opacity="${Math.min(1, f.o * 1.6)}" filter="url(#fx-b${blur})"/>`);
    }
    body.push(`<rect width="${w}" height="${h}" fill="#808080"/><g clip-path="url(#all)">${inner.join("")}</g>`);
  } else if (kind === "detail") {
    // 128 = flat. Lighter = raised. Values are tuned in canvas px by the 3D builder.
    const grainFreq = g.fabric === "fleece" ? "0.55 0.5" : g.fabric === "woven" ? "0.9 0.9" : "0.42 0.16";
    defs.push(
      `<filter id="grain" ${full}><feTurbulence type="fractalNoise" baseFrequency="${grainFreq}" numOctaves="2" seed="${seed + 3}"/><feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1"/></filter>`,
      `<filter id="soft" ${full}><feGaussianBlur stdDeviation="1.2"/></filter>`,
      `<filter id="soft3" ${full}><feGaussianBlur stdDeviation="3"/></filter>`,
    );
    const inner: string[] = [`<rect width="${w}" height="${h}" fill="#808080"/>`];
    inner.push(`<rect width="${w}" height="${h}" filter="url(#grain)" opacity="0.32" style="mix-blend-mode:overlay"/>`);
    for (const p of v.panels) inner.push(`<path d="${p.d}" fill="none" stroke="#9a9a9a" stroke-width="6" filter="url(#soft3)"/>`);
    for (const r of v.ribs) {
      inner.push(`<path d="${r.d}" fill="none" stroke="#a8a8a8" stroke-width="${r.width}" stroke-linejoin="round" filter="url(#soft)"/>`);
      inner.push(`<path d="${r.d}" fill="none" stroke="#c8c8c8" stroke-width="${r.width * 0.92}" stroke-dasharray="2.4 3.2" opacity="0.7"/>`);
    }
    inner.push(`<g opacity="0.55" filter="url(#soft)">${prints("w")}</g>`);
    for (const st of v.stitches) inner.push(`<path d="${st}" fill="none" stroke="#2a2a2a" stroke-width="2.6" stroke-dasharray="7 5" opacity="0.9"/>`);
    if (hardware) inner.push(`<g opacity="0.9" filter="url(#soft)">${hardware}</g>`);
    body.push(`<rect width="${w}" height="${h}" fill="#808080"/><g clip-path="url(#all)">${inner.join("")}</g>`);
  } else {
    const rough = g.fabric === "woven" ? 0.6 : g.fabric === "fleece" ? 0.96 : g.fabric === "mesh" ? 0.86 : 0.9;
    const c = (r: number, m = 0) => `rgb(255,${Math.round(r * 255)},${Math.round(m * 255)})`;
    defs.push(`<filter id="flat-ink" ${full}><feFlood flood-color="${c(0.5)}"/><feComposite in2="SourceAlpha" operator="in"/></filter>`);
    defs.push(`<filter id="flat-metal" ${full}><feFlood flood-color="${metalHardware ? c(0.32, 1) : c(0.8)}"/><feComposite in2="SourceAlpha" operator="in"/></filter>`);
    const inner: string[] = [`<rect width="${w}" height="${h}" fill="${c(rough)}"/>`];
    for (const r of v.ribs) inner.push(`<path d="${r.d}" fill="none" stroke="${c(Math.min(1, rough + 0.04))}" stroke-width="${r.width}"/>`);
    inner.push(prints("ink"));
    for (const st of v.stitches) inner.push(`<path d="${st}" fill="none" stroke="${c(0.72)}" stroke-width="2" stroke-dasharray="7 5"/>`);
    if (hardware) inner.push(`<g filter="url(#flat-metal)">${hardware}</g>`);
    body.push(`<rect width="${w}" height="${h}" fill="${c(rough)}"/><g clip-path="url(#all)">${inner.join("")}</g>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs.join("")}</defs>${body.join("")}</svg>`;
}

export function renderPng(svg: string, width: number = CANVAS.w): Buffer {
  const r = new Resvg(svg, { fitTo: { mode: "width", value: width }, background: "rgba(0,0,0,0)" });
  return Buffer.from(r.render().asPng());
}

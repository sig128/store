/**
 * 3D garment maps for the Rack: turns each flat garment drawing into a closed,
 * "ghost mannequin" volume that real lights can shade.
 *
 * Per variant and view (front/back):
 *   public/3d/<VARIANT>/<view>-albedo[-sm].webp   unlit fabric colour + prints (RGBA, alpha = silhouette)
 *   public/3d/<VARIANT>/<view>-normal[-sm].webp   tangent-space relief: ribs, stitches, ink, knit grain
 *   public/3d/<VARIANT>/<view>-orm[-sm].webp      R ambient occlusion, G roughness, B metalness
 *   public/3d/<VARIANT>/<view>-height.bin         Uint16 LE height field (GRID_W × GRID_H), 1/32 canvas px
 *   public/3d/manifest.json
 *
 * Geometry: the silhouette is "inflated" by solving ∇²P = −1 inside it; sqrt(2P)
 * approximates the local radius, so sleeves become tubes and the torso a soft
 * ellipse. Seams (sides, shoulders) close where front meets back. Hems, cuffs,
 * necklines and armholes are left open (Neumann boundary) so you see inside.
 *
 * Run: npm run art:3d
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import sharp from "sharp";
import { Resvg } from "@resvg/resvg-js";
import { PRODUCTS } from "../data/drop01";
import { CANVAS, GARMENTS } from "./garments";
import { garmentMapSvg, garmentSvg } from "./render";
import { placed } from "./artwork";
import type { ProductCategory } from "../../src/lib/types";

const GRID_W = 240; // solver grid = canvas / 5
const GRID_H = 300;
const CELL = CANVAS.w / GRID_W; // canvas px per cell
const TEX_W = 1024;
const TEX_H = 1280;
const TEXEL = CANVAS.w / TEX_W; // canvas px per texel
const HEIGHT_SCALE = 32; // stored units per canvas px
/** Real-world size of the drawing canvas: 1200 px ≈ 0.75 m. */
const METERS_PER_PX = 0.75 / CANVAS.w;

const out = (p: string) => {
  mkdirSync(dirname(p), { recursive: true });
  return p;
};

type Pt = [number, number];

/* ───────────── open (unsewn) edges per garment, right half in canvas px; mirrored automatically ───────────── */
function cubic(p0: Pt, c1: Pt, c2: Pt, p3: Pt, n = 24): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, d = t ** 3;
    pts.push([a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1]]);
  }
  return pts;
}
const line = (a: Pt, b: Pt): Pt[] => [a, b];
/** A band around a polyline, trimmed at both ends so corners stay sewn. */
function band(pts: Pt[], half: number, trim = 0.04): Pt[] {
  const n = pts.length;
  const i0 = Math.floor(trim * (n - 1));
  const i1 = Math.ceil((1 - trim) * (n - 1));
  const sel = pts.slice(i0, i1 + 1);
  if (sel.length < 2) sel.push(pts[n - 1]!);
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < sel.length; i++) {
    const a = sel[Math.max(0, i - 1)]!;
    const b = sel[Math.min(sel.length - 1, i + 1)]!;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const p = sel[i]!;
    left.push([p[0] + nx * half, p[1] + ny * half]);
    right.push([p[0] - nx * half, p[1] - ny * half]);
  }
  return [...left, ...right.reverse()];
}

function openZones(category: ProductCategory, view: "front" | "back"): Pt[][] {
  const back = view === "back";
  const B = 26;
  switch (category) {
    case "tee": {
      const ny = back ? 262 : 318;
      return [
        band(cubic([600, ny], [668, ny], [712, ny - 26], [722, 236]), B, 0),
        band(line([1112, 428], [1046, 602]), B),
        band(cubic([888, 1240], [800, 1252], [700, 1256], [600, 1256]), B, 0),
      ];
    }
    case "stringer": {
      const neck = back ? cubic([600, 470], [640, 456], [686, 330], [690, 232]) : cubic([600, 545], [655, 545], [688, 420], [690, 232]);
      const arm = back
        ? [...cubic([744, 228], [742, 330], [702, 420], [664, 524]), ...cubic([664, 524], [690, 690], [764, 800], [850, 838])]
        : cubic([744, 228], [750, 420], [800, 740], [850, 838]);
      return [band(neck, B, 0), band(arm, B, 0.03), band(cubic([860, 1290], [780, 1302], [690, 1306], [600, 1306]), B, 0)];
    }
    case "singlet": {
      const ny = back ? 318 : 430;
      const neck = back ? cubic([600, ny], [652, 318], [694, 290], [700, 232]) : cubic([600, ny], [652, 430], [694, 352], [700, 232]);
      return [band(neck, B, 0), band(cubic([796, 232], [800, 420], [826, 600], [884, 652]), B, 0.03), band(cubic([874, 1310], [780, 1322], [690, 1326], [600, 1326]), B, 0)];
    }
    case "hoodie":
      return [band(cubic([1098, 1150], [1060, 1160], [1030, 1162], [1004, 1158]), B, 0.06), band(cubic([884, 1262], [800, 1270], [700, 1272], [600, 1272]), B, 0)];
    case "jacket":
      return [
        band(cubic([600, 246], [650, 244], [700, 240], [724, 238]), B, 0),
        band(cubic([1094, 1160], [1058, 1170], [1026, 1172], [1000, 1168]), B, 0.06),
        band(cubic([886, 1240], [800, 1248], [700, 1250], [600, 1250]), B, 0),
      ];
    case "shorts":
      return [band(line([600, 330], [902, 330]), B, 0), band(cubic([858, 1062], [780, 1076], [690, 1084], [632, 1088]), B, 0.05)];
    default:
      return [];
  }
}

const mirror = (poly: Pt[]): Pt[] => poly.map(([x, y]) => [CANVAS.w - x, y]);
const zonesSvg = (zones: Pt[][]) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.w}" height="${CANVAS.h}" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}">${zones
    .flatMap((z) => [z, mirror(z)])
    .map((z) => `<path d="M${z.map((p) => p.map((v) => v.toFixed(1)).join(" ")).join("L")}Z" fill="#fff"/>`)
    .join("")}</svg>`;

/* ───────────── raster helpers ───────────── */
async function rasterGray(svg: string, w: number, h: number, channel: "alpha" | "luma"): Promise<Float32Array> {
  const png = Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: w }, background: channel === "alpha" ? "rgba(0,0,0,0)" : "#808080" }).render().asPng());
  const { data, info } = await sharp(png).resize(w, h, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const outArr = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * info.channels;
    outArr[i] = channel === "alpha" ? data[o + 3]! / 255 : (0.299 * data[o]! + 0.587 * data[o + 1]! + 0.114 * data[o + 2]!) / 255;
  }
  return outArr;
}

function blur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  // separable box blur, 3 passes ≈ gaussian
  let a = Float32Array.from(src);
  let b = new Float32Array(src.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))]!;
      for (let x = 0; x < w; x++) {
        b[y * w + x] = acc / (2 * r + 1);
        acc += a[y * w + Math.min(w - 1, x + r + 1)]! - a[y * w + Math.max(0, x - r)]!;
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x]!;
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / (2 * r + 1);
        acc += b[Math.min(h - 1, y + r + 1) * w + x]! - b[Math.max(0, y - r) * w + x]!;
      }
    }
  }
  return a;
}

/** Smooth value noise, deterministic. */
function noise2(w: number, h: number, cells: number, seed: number): Float32Array {
  const gw = cells + 2, gh = Math.ceil((cells * h) / w) + 2;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 233280 + 49297) % 233280) / 233280) * 2 - 1;
  const g = Array.from({ length: gw * gh }, rnd);
  const outArr = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * cells, fy = (y / w) * cells;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const v00 = g[iy * gw + ix]!, v10 = g[iy * gw + ix + 1]!, v01 = g[(iy + 1) * gw + ix]!, v11 = g[(iy + 1) * gw + ix + 1]!;
      outArr[y * w + x] = (v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy;
    }
  return outArr;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ───────────── inflation ───────────── */
const DEPTH: Record<ProductCategory, number> = { tee: 190, stringer: 170, singlet: 175, hoodie: 230, shorts: 165, jacket: 215 };

function inflate(mask: Float32Array, zones: Float32Array, category: ProductCategory): { height: Float32Array; inside: Uint8Array; radius: Float32Array } {
  const N = GRID_W * GRID_H;
  const inside = new Uint8Array(N);
  for (let i = 0; i < N; i++) inside[i] = mask[i]! > 0.5 ? 1 : 0;
  const open = new Uint8Array(N);
  for (let i = 0; i < N; i++) open[i] = zones[i]! > 0.5 ? 1 : 0;
  const P = new Float32Array(N);
  const omega = 1.93;
  for (let it = 0; it < 2600; it++) {
    for (let y = 1; y < GRID_H - 1; y++) {
      for (let x = 1; x < GRID_W - 1; x++) {
        const i = y * GRID_W + x;
        if (!inside[i]) continue;
        const p = P[i]!;
        let sum = 0;
        for (const j of [i - 1, i + 1, i - GRID_W, i + GRID_W]) sum += inside[j] ? P[j]! : open[j] ? p : 0;
        P[i] = (1 - omega) * p + (omega * (sum + 1)) / 4;
      }
    }
  }
  const Hmax = DEPTH[category];
  const radius = new Float32Array(N);
  const height = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (!inside[i]) continue;
    const r = Math.sqrt(2 * P[i]!) * CELL; // ≈ local half-width in canvas px
    radius[i] = r;
    height[i] = Hmax * Math.tanh(r / Hmax);
  }
  return { height, inside, radius };
}

/** Outside cells next to an open edge take the edge height, so the cut lands on the surface, not on the floor plane. */
function extendOpenEdges(height: Float32Array, inside: Uint8Array, zones: Float32Array, steps = 4) {
  let frontier = new Set<number>();
  const set = new Uint8Array(inside);
  for (let s = 0; s < steps; s++) {
    frontier = new Set();
    for (let y = 1; y < GRID_H - 1; y++)
      for (let x = 1; x < GRID_W - 1; x++) {
        const i = y * GRID_W + x;
        if (set[i] || zones[i]! < 0.5) continue;
        let acc = 0, n = 0;
        for (const j of [i - 1, i + 1, i - GRID_W, i + GRID_W]) if (set[j]) (acc += height[j]!), n++;
        if (n) {
          height[i] = acc / n;
          frontier.add(i);
        }
      }
    for (const i of frontier) set[i] = 1;
  }
}

/* ───────────── normal map from a detail height field ───────────── */
function normalMap(hgt: Float32Array, w: number, h: number, strength: number, alpha: Float32Array): Buffer {
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const l = hgt[y * w + Math.max(0, x - 1)]!, r = hgt[y * w + Math.min(w - 1, x + 1)]!;
      const u = hgt[Math.max(0, y - 1) * w + x]!, d = hgt[Math.min(h - 1, y + 1) * w + x]!;
      // heights in canvas px; texel spacing TEXEL canvas px. Image rows grow downward, UV v grows upward.
      let nx = (-(r - l) / (2 * TEXEL)) * strength;
      let ny = ((d - u) / (2 * TEXEL)) * strength;
      const a = alpha[i]!;
      nx *= a;
      ny *= a;
      const len = Math.hypot(nx, ny, 1);
      buf[i * 3] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      buf[i * 3 + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      buf[i * 3 + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
    }
  return buf;
}

/* ───────────── build ───────────── */
interface ViewMaps {
  albedo: string;
  albedoSm: string;
  normal: string;
  normalSm: string;
  orm: string;
  ormSm: string;
  height: string;
}
const manifest: {
  generatedAt: string;
  grid: { w: number; h: number; heightScale: number };
  metersPerPx: number;
  canvas: { w: number; h: number };
  note: string;
  variants: Record<string, { product: string; category: ProductCategory; fabric: string; color: string; trim: string | null; heroView: "front" | "back"; views: Record<"front" | "back", ViewMaps> }>;
} = {
  generatedAt: new Date().toISOString(),
  grid: { w: GRID_W, h: GRID_H, heightScale: HEIGHT_SCALE },
  metersPerPx: METERS_PER_PX,
  canvas: { w: CANVAS.w, h: CANVAS.h },
  note: "Concept geometry generated from the 2D garment drawings (scripts/art/garment3d.ts). Not a scan of produced stock.",
  variants: {},
};

async function webp(raw: Buffer, w: number, h: number, channels: 3 | 4, file: string, quality: number, sm = false) {
  const img = sharp(raw, { raw: { width: w, height: h, channels } });
  const pipeline = sm ? img.resize(Math.round(w / 2), Math.round(h / 2), { kernel: "lanczos3" }) : img;
  await pipeline.webp({ quality, alphaQuality: 95, effort: 5, smartSubsample: true }).toFile(out(file));
}

const only = process.argv.slice(2);
for (const product of PRODUCTS) {
  const v = product.variants[0]!;
  if (only.length && !only.includes(v.code)) continue;
  const g = GARMENTS[product.category];
  const views = {} as Record<"front" | "back", ViewMaps>;
  for (const view of ["front", "back"] as const) {
    const seed = v.code.length * 7 + view.length;
    const prints = placed(v.prints, view);
    const base = `public/3d/${v.code}/${view}`;

    // 1. Albedo (unlit)
    const albedoPng = Buffer.from(
      new Resvg(garmentSvg({ category: product.category, view, color: v.render.color, trim: v.render.trim, wash: v.render.wash, prints, state: "albedo", seed, shadow: false }), {
        fitTo: { mode: "width", value: TEX_W },
        background: "rgba(0,0,0,0)",
      })
        .render()
        .asPng(),
    );
    const albedoRaw = await sharp(albedoPng).resize(TEX_W, TEX_H, { fit: "fill" }).ensureAlpha().raw().toBuffer();
    await webp(albedoRaw, TEX_W, TEX_H, 4, `${base}-albedo.webp`, 90);
    await webp(albedoRaw, TEX_W, TEX_H, 4, `${base}-albedo-sm.webp`, 84, true);

    // 2. Inflate the silhouette
    const mask = await rasterGray(garmentMapSvg({ category: product.category, view, prints }, "mask"), GRID_W, GRID_H, "alpha");
    const zones = await rasterGray(zonesSvg(openZones(product.category, view)), GRID_W, GRID_H, "alpha");
    const { height, inside, radius } = inflate(mask, zones, product.category);

    // 3. Folds + drape noise, faded out near the edges so the silhouette stays clean
    const folds = await rasterGray(garmentMapSvg({ category: product.category, view, prints }, "folds"), GRID_W, GRID_H, "luma");
    const drape = noise2(GRID_W, GRID_H, 7, seed);
    const drape2 = noise2(GRID_W, GRID_H, 15, seed + 11);
    for (let i = 0; i < height.length; i++) {
      if (!inside[i]) continue;
      const edge = smoothstep(14, 70, radius[i]!);
      height[i] = Math.max(0, height[i]! + edge * ((folds[i]! - 0.5) * 2 * 16 + drape[i]! * 7 + drape2[i]! * 2.5));
    }
    // Hood opening reads as a hollow on the front.
    if (product.category === "hoodie" && view === "front") {
      const hollow = await rasterGray(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.w}" height="${CANVAS.h}" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}"><path d="${g.front.behind[1]?.d ?? ""}" fill="#fff"/></svg>`,
        GRID_W,
        GRID_H,
        "alpha",
      );
      const hb = blur(hollow, GRID_W, GRID_H, 3);
      for (let i = 0; i < height.length; i++) height[i] = height[i]! * (1 - 0.85 * hb[i]!);
    }
    extendOpenEdges(height, inside, zones);
    const smooth = blur(height, GRID_W, GRID_H, 1);
    const u16 = new Uint16Array(GRID_W * GRID_H);
    for (let i = 0; i < u16.length; i++) u16[i] = Math.min(65535, Math.round((inside[i] || zones[i]! > 0.5 ? smooth[i]! : 0) * HEIGHT_SCALE));
    writeFileSync(out(`${base}-height.bin`), Buffer.from(u16.buffer));

    // 4. Normal map from small relief
    const detail = await rasterGray(garmentMapSvg({ category: product.category, view, prints, seed }, "detail"), TEX_W, TEX_H, "luma");
    const alpha = new Float32Array(TEX_W * TEX_H);
    for (let i = 0; i < alpha.length; i++) alpha[i] = albedoRaw[i * 4 + 3]! / 255;
    const detailPx = new Float32Array(detail.length);
    for (let i = 0; i < detail.length; i++) detailPx[i] = (detail[i]! - 0.5) * 2 * 2.2; // ±2.2 canvas px
    const nrm = normalMap(blur(detailPx, TEX_W, TEX_H, 1), TEX_W, TEX_H, 1.6, alpha);
    await webp(nrm, TEX_W, TEX_H, 3, `${base}-normal.webp`, 92);
    await webp(nrm, TEX_W, TEX_H, 3, `${base}-normal-sm.webp`, 88, true);

    // 5. ORM: AO from the height field (valleys + seams), roughness + metalness from the material map
    const cav = blur(smooth, GRID_W, GRID_H, 4);
    const aoGrid = Buffer.alloc(GRID_W * GRID_H);
    for (let i = 0; i < aoGrid.length; i++) {
      const cavity = Math.max(0, cav[i]! - smooth[i]!);
      const seam = inside[i] ? smoothstep(0, 26, radius[i]!) : 1;
      aoGrid[i] = Math.round(255 * Math.max(0.5, Math.min(1, (1 - cavity / 24) * (0.7 + 0.3 * seam))));
    }
    const aoTex = await sharp(aoGrid, { raw: { width: GRID_W, height: GRID_H, channels: 1 } }).resize(TEX_W, TEX_H, { kernel: "cubic" }).raw().toBuffer();
    const matPng = Buffer.from(new Resvg(garmentMapSvg({ category: product.category, view, prints }, "material"), { fitTo: { mode: "width", value: TEX_W } }).render().asPng());
    const mat = await sharp(matPng).resize(TEX_W, TEX_H, { fit: "fill" }).removeAlpha().raw().toBuffer();
    const orm = Buffer.alloc(TEX_W * TEX_H * 3);
    for (let i = 0; i < TEX_W * TEX_H; i++) {
      orm[i * 3] = aoTex[i]!;
      orm[i * 3 + 1] = mat[i * 3 + 1]!;
      orm[i * 3 + 2] = mat[i * 3 + 2]!;
    }
    await webp(orm, TEX_W, TEX_H, 3, `${base}-orm.webp`, 90);
    await webp(orm, TEX_W, TEX_H, 3, `${base}-orm-sm.webp`, 86, true);

    const url = (s: string) => `/3d/${v.code}/${view}-${s}`;
    views[view] = {
      albedo: url("albedo.webp"),
      albedoSm: url("albedo-sm.webp"),
      normal: url("normal.webp"),
      normalSm: url("normal-sm.webp"),
      orm: url("orm.webp"),
      ormSm: url("orm-sm.webp"),
      height: url("height.bin"),
    };
  }
  manifest.variants[v.code] = {
    product: product.slug,
    category: product.category,
    fabric: GARMENTS[product.category].fabric,
    color: v.render.color,
    trim: v.render.trim ?? null,
    heroView: product.heroView,
    views,
  };
  console.log(`3d ${v.code}`);
}
if (!only.length) writeFileSync(out("public/3d/manifest.json"), JSON.stringify(manifest, null, 2));
else {
  // partial run: merge into the existing manifest
  const { readFileSync, existsSync } = await import("node:fs");
  const prev = existsSync("public/3d/manifest.json") ? JSON.parse(readFileSync("public/3d/manifest.json", "utf8")) : { variants: {} };
  writeFileSync(out("public/3d/manifest.json"), JSON.stringify({ ...manifest, variants: { ...prev.variants, ...manifest.variants } }, null, 2));
}
console.log("3d maps complete");

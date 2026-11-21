/**
 * Original print artwork for Drop 01. Three families:
 *   NIGHT GARAGE   — illustrated poster scene (roll-up door, iron, palms, streetlight)
 *   LAST REP CLUB  — vintage athletic-club crest and varsity lettering
 *   COASTAL SHIFT  — striped sunset, palms, script lettering
 * Each function returns a self-contained SVG fragment in its own coordinate box,
 * drawn with a limited ink set (screen-print friendly).
 */
import { brand } from "../../src/config/brand";
import { arcTextPath, archTextPath, fitSize, measure, textPath } from "./lib/fonts";
import { circle, halftone, palm, rect, ring, rng, star } from "./lib/svg";

export interface Inks {
  /** main light ink */
  bone: string;
  coral: string;
  sodium: string;
  teal: string;
  /** colour of the garment (for knock-outs) */
  ground: string;
}

export const INKS_ON_DARK = (ground: string): Inks => ({
  bone: "#ebe3d2",
  coral: "#ee7c5e",
  sodium: "#f1a65b",
  teal: "#5fa59c",
  ground,
});

export const INKS_ON_LIGHT = (ground: string): Inks => ({
  bone: "#2a2a28",
  coral: "#d6654a",
  sodium: "#c98238",
  teal: "#1f4d4a",
  ground,
});

export interface PrintArt {
  code: string;
  title: string;
  family: "night_garage" | "last_rep_club" | "coastal_shift";
  w: number;
  h: number;
  body: string;
  defs?: string;
  inks: string[];
}

let uid = 0;
const id = (p: string) => `${p}${++uid}`;

/* ─────────────────────────────── NIGHT GARAGE ─────────────────────────────── */

/** The garage scene, drawn into a w×h box with its own clip. */
function garageScene(ink: Inks, w: number, h: number, seed = 13): { body: string; defs: string } {
  const rand = rng(seed);
  const clip = id("ngclip");
  const horizon = h * 0.7;
  const parts: string[] = [];

  // Stars (sparse)
  let stars = "";
  for (let i = 0; i < 26; i++) {
    const x = rand() * w;
    const y = rand() * horizon * 0.45;
    stars += circle(x, y, 1.2 + rand() * 2.2);
  }
  parts.push(`<path d="${stars}" fill="${ink.bone}" opacity="0.85"/>`);
  // Moon — a thin crescent made with a knock-out
  const mx = w * 0.79;
  const my = h * 0.15;
  parts.push(`<path d="${circle(mx, my, w * 0.055)}" fill="${ink.bone}"/>`);
  parts.push(`<path d="${circle(mx + w * 0.022, my - w * 0.012, w * 0.05)}" fill="${ink.ground}"/>`);

  // Far palms behind the building (teal)
  parts.push(`<path d="${palm({ x: w * 0.12, y: horizon, h: h * 0.62, lean: w * 0.05, seed: seed + 1 })}" fill="${ink.teal}"/>`);
  parts.push(`<path d="${palm({ x: w * 0.27, y: horizon, h: h * 0.48, lean: -w * 0.04, seed: seed + 2, fronds: 8 })}" fill="${ink.teal}" opacity="0.9"/>`);

  // Building: flat roof block with parapet and sign box
  const bx = w * 0.2;
  const bw = w * 0.62;
  const by = horizon - h * 0.42;
  parts.push(`<path d="${rect(bx, by, bw, horizon - by)}" fill="${ink.bone}"/>`);
  // facade knock-out lines (panel seams)
  let seams = "";
  for (let i = 1; i < 6; i++) seams += rect(bx, by + ((horizon - by) * i) / 6, bw, 2.5);
  parts.push(`<path d="${seams}" fill="${ink.ground}" opacity="0.35"/>`);
  // parapet
  parts.push(`<path d="${rect(bx - 8, by - 14, bw + 16, 14)}" fill="${ink.bone}"/>`);
  // Roof sign box with knocked-out lettering "IRON 24H"
  const sw = bw * 0.46;
  const sx = bx + (bw - sw) / 2;
  const sy = by - h * 0.13;
  parts.push(`<path d="${rect(sx + sw * 0.18, sy + h * 0.1, 6, h * 0.04)}${rect(sx + sw * 0.82 - 6, sy + h * 0.1, 6, h * 0.04)}" fill="${ink.bone}"/>`);
  parts.push(`<path d="${rect(sx, sy, sw, h * 0.1)}" fill="${ink.coral}"/>`);
  const signSize = fitSize("IRON · OPEN LATE", { font: "shoulders900", tracking: 0.06 }, sw * 0.84);
  parts.push(
    `<path d="${textPath("IRON · OPEN LATE", { font: "shoulders900", size: signSize, x: sx + sw / 2, y: sy + h * 0.05 + signSize * 0.34, align: "center", tracking: 0.06 }).d}" fill="${ink.ground}"/>`,
  );

  // Roll-up door opening (half raised) with warm interior light
  const dw = bw * 0.62;
  const dx = bx + (bw - dw) / 2;
  const dTop = by + (horizon - by) * 0.22;
  const doorBottomOfSlats = dTop + (horizon - dTop) * 0.36; // door raised: slats cover top 36%
  parts.push(`<path d="${rect(dx, dTop, dw, horizon - dTop)}" fill="${ink.sodium}"/>`);
  // interior: barbell on rack (ground-coloured silhouette)
  const rackY = horizon - (horizon - doorBottomOfSlats) * 0.62;
  const rx1 = dx + dw * 0.18;
  const rx2 = dx + dw * 0.82;
  let rack = rect(rx1 - 5, rackY - 10, 10, horizon - rackY + 10) + rect(rx2 - 5, rackY - 10, 10, horizon - rackY + 10);
  rack += rect(dx + dw * 0.06, rackY - 4, dw * 0.88, 8); // bar
  for (const px of [dx + dw * 0.1, dx + dw * 0.14, dx + dw * 0.86, dx + dw * 0.9]) {
    const ph = (px < dx + dw / 2 ? (px === dx + dw * 0.1 ? 1 : 0.8) : px === dx + dw * 0.9 ? 1 : 0.8) * (h * 0.09);
    rack += rect(px - 7, rackY - ph / 2, 14, ph);
  }
  // bench
  rack += rect(dx + dw * 0.32, horizon - h * 0.045, dw * 0.36, h * 0.018) + rect(dx + dw * 0.36, horizon - h * 0.03, 8, h * 0.03) + rect(dx + dw * 0.62, horizon - h * 0.03, 8, h * 0.03);
  parts.push(`<path d="${rack}" fill="${ink.ground}"/>`);
  // door slats (bone with ground gaps)
  parts.push(`<path d="${rect(dx, dTop, dw, doorBottomOfSlats - dTop)}" fill="${ink.bone}"/>`);
  let slats = "";
  const nSlats = 7;
  for (let i = 1; i <= nSlats; i++) slats += rect(dx, dTop + ((doorBottomOfSlats - dTop) * i) / (nSlats + 0.2), dw, 3);
  parts.push(`<path d="${slats}" fill="${ink.ground}" opacity="0.7"/>`);
  parts.push(`<path d="${rect(dx - 10, dTop - 10, dw + 20, 10)}${rect(dx - 10, dTop, 10, horizon - dTop)}${rect(dx + dw, dTop, 10, horizon - dTop)}" fill="${ink.teal}"/>`);

  // Light spill on wet ground: halftone fan from the door
  const spill = halftone({
    x: 0,
    y: horizon,
    w,
    h: h - horizon,
    step: w * 0.016,
    angle: 45,
    intensity: (x, y) => {
      const t = (y - horizon) / (h - horizon);
      const half = dw / 2 + t * w * 0.42;
      const dxn = Math.abs(x - (dx + dw / 2)) / half;
      return (1 - Math.min(1, dxn)) * (1 - t * 0.85) * 1.15;
    },
  });
  parts.push(`<path d="${spill}" fill="${ink.sodium}"/>`);
  // Puddle reflections (broken horizontal strokes)
  let refl = "";
  for (let i = 0; i < 16; i++) {
    const y = horizon + 10 + rand() * (h - horizon - 20);
    const x = rand() * w;
    const len = 20 + rand() * w * 0.18;
    refl += rect(x, y, len, 3 + rand() * 3);
  }
  parts.push(`<path d="${refl}" fill="${ink.bone}" opacity="0.8"/>`);

  // Streetlight on the right with coral glow halftone
  const lx = w * 0.9;
  const ly = h * 0.24;
  const glow = halftone({
    x: lx - w * 0.25,
    y: ly - w * 0.2,
    w: w * 0.4,
    h: w * 0.4,
    step: w * 0.014,
    angle: 15,
    intensity: (x, y) => 1.1 - Math.hypot(x - (lx - w * 0.04), y - (ly + 6)) / (w * 0.19),
  });
  parts.push(`<path d="${glow}" fill="${ink.coral}"/>`);
  parts.push(
    `<path d="M${lx + 6} ${horizon}L${lx + 6} ${ly + 14}C${lx + 6} ${ly - 20} ${lx - 10} ${ly - 26} ${lx - w * 0.06} ${ly - 18}L${lx - w * 0.06} ${ly - 8}C${lx - 6} ${ly - 14} ${lx - 4} ${ly - 8} ${lx - 4} ${ly + 14}L${lx - 4} ${horizon}Z" fill="${ink.bone}"/>`,
  );
  parts.push(`<path d="${rect(lx - w * 0.085, ly - 10, w * 0.05, 12)}" fill="${ink.sodium}"/>`);

  // Foreground palm hugging the left edge (teal) and kerb line
  parts.push(`<path d="${palm({ x: -w * 0.02, y: h * 1.02, h: h * 0.66, lean: w * 0.07, seed: seed + 5, fronds: 9 })}" fill="${ink.teal}"/>`);
  parts.push(`<path d="${rect(0, horizon, w, 5)}" fill="${ink.bone}"/>`);

  return {
    defs: `<clipPath id="${clip}"><rect width="${w}" height="${h}" rx="0"/></clipPath>`,
    body: `<g clip-path="url(#${clip})">${parts.join("")}</g>`,
  };
}

export function nightGarageRear(ink: Inks, code: string): PrintArt {
  const W = 1000;
  const H = 1260;
  const parts: string[] = [];
  const defs: string[] = [];

  // Top line: brand, tracked, with rules
  const top = brand.name.toUpperCase();
  const topSize = 36;
  const topW = measure(top, { font: "shoulders700", size: topSize, tracking: 0.32 });
  parts.push(`<path d="${textPath(top, { font: "shoulders700", size: topSize, x: W / 2, y: 58, align: "center", tracking: 0.32 }).d}" fill="${ink.bone}"/>`);
  parts.push(`<path d="${rect(70, 44, (W - topW) / 2 - 100, 3)}${rect(W / 2 + topW / 2 + 30, 44, (W - topW) / 2 - 100, 3)}" fill="${ink.bone}"/>`);

  // Arch-topped window containing the scene
  const ax = 110;
  const aw = W - 220;
  const ay = 100;
  const ah = 720;
  const archClip = id("arch");
  const r = aw / 2;
  const archD = `M${ax} ${ay + ah}L${ax} ${ay + r}A${r} ${r} 0 0 1 ${ax + aw} ${ay + r}L${ax + aw} ${ay + ah}Z`;
  defs.push(`<clipPath id="${archClip}"><path d="${archD}"/></clipPath>`);
  const scene = garageScene(ink, aw, ah, 21);
  defs.push(scene.defs);
  parts.push(`<g clip-path="url(#${archClip})"><g transform="translate(${ax} ${ay})">${scene.body}</g></g>`);
  parts.push(`<path d="${archD}" fill="none" stroke="${ink.bone}" stroke-width="10"/>`);
  parts.push(`<path d="M${ax - 18} ${ay + ah}L${ax - 18} ${ay + r}A${r + 18} ${r + 18} 0 0 1 ${ax + aw + 18} ${ay + r}L${ax + aw + 18} ${ay + ah}" fill="none" stroke="${ink.bone}" stroke-width="3"/>`);

  // Title
  const title = "NIGHT GARAGE";
  const tSize = fitSize(title, { font: "anton", tracking: 0.01 }, W - 120);
  const titleY = ay + ah + 30 + tSize * 0.78;
  parts.push(`<path d="${textPath(title, { font: "anton", size: tSize, x: W / 2 + 6, y: titleY + 6, align: "center", tracking: 0.01 }).d}" fill="${ink.coral}"/>`);
  parts.push(`<path d="${textPath(title, { font: "anton", size: tSize, x: W / 2, y: titleY, align: "center", tracking: 0.01 }).d}" fill="${ink.bone}"/>`);

  // Sub line
  const sub = "IRON  ·  SALT AIR  ·  OPEN LATE";
  parts.push(`<path d="${textPath(sub, { font: "shoulders700", size: 40, x: W / 2, y: titleY + 64, align: "center", tracking: 0.22 }).d}" fill="${ink.bone}"/>`);

  // Footer badges
  const fy = titleY + 132;
  parts.push(`<path d="${rect(70, fy - 34, 220, 48)}" fill="none" stroke="${ink.bone}" stroke-width="3"/>`);
  parts.push(`<path d="${textPath("EST. 01:13", { font: "mono600", size: 26, x: 180, y: fy, align: "center", tracking: 0.06 }).d}" fill="${ink.bone}"/>`);
  parts.push(`<path d="${star(W / 2, fy - 10, 20, 8)}" fill="${ink.coral}"/>`);
  parts.push(`<path d="${rect(W - 290, fy - 34, 220, 48)}" fill="${ink.bone}"/>`);
  parts.push(`<path d="${textPath(brand.dropCode, { font: "mono600", size: 26, x: W - 180, y: fy, align: "center", tracking: 0.06 }).d}" fill="${ink.ground}"/>`);

  return {
    code,
    title: "Night Garage — rear print",
    family: "night_garage",
    w: W,
    h: H,
    body: parts.join(""),
    defs: defs.join(""),
    inks: [ink.bone, ink.coral, ink.sodium, ink.teal],
  };
}

/** Jacket back panel: the scene in a rectangular frame with stencil header. */
export function nightGaragePanel(ink: Inks, code: string): PrintArt {
  const W = 900;
  const H = 1180;
  const parts: string[] = [];
  const defs: string[] = [];
  parts.push(`<path d="${rect(0, 0, W, H)}" fill="none" stroke="${ink.bone}" stroke-width="12"/>`);
  parts.push(`<path d="${rect(22, 22, W - 44, H - 44)}" fill="none" stroke="${ink.bone}" stroke-width="3"/>`);
  // Header
  const head = "NIGHT GARAGE";
  const hs = fitSize(head, { font: "stencil800", tracking: 0.04 }, W - 120);
  parts.push(`<path d="${textPath(head, { font: "stencil800", size: hs, x: W / 2, y: 60 + hs * 0.74, align: "center", tracking: 0.04 }).d}" fill="${ink.bone}"/>`);
  const sceneY = 70 + hs * 0.82 + 24;
  const sceneH = H - sceneY - 170;
  const clip = id("panel");
  defs.push(`<clipPath id="${clip}"><rect x="50" y="${sceneY}" width="${W - 100}" height="${sceneH}"/></clipPath>`);
  const scene = garageScene(ink, W - 100, sceneH, 33);
  defs.push(scene.defs);
  parts.push(`<g clip-path="url(#${clip})"><g transform="translate(50 ${sceneY})">${scene.body}</g></g>`);
  parts.push(`<path d="${rect(50, sceneY, W - 100, sceneH)}" fill="none" stroke="${ink.bone}" stroke-width="5"/>`);
  // Footer: clock + line
  const fy = sceneY + sceneH + 92;
  parts.push(`<path d="${ring(130, fy - 18, 46, 7)}" fill="${ink.coral}"/>`);
  parts.push(`<path d="M130 ${fy - 18}L130 ${fy - 52}M130 ${fy - 18}L106 ${fy - 2}" stroke="${ink.coral}" stroke-width="8" stroke-linecap="round" fill="none"/>`);
  parts.push(`<path d="${textPath("CLOSING TIME IS A SUGGESTION", { font: "shoulders700", size: 42, x: 205, y: fy - 4, tracking: 0.12 }).d}" fill="${ink.bone}"/>`);
  parts.push(`<path d="${textPath(`${brand.name.toUpperCase()} · ${brand.dropCode}`, { font: "mono600", size: 22, x: 207, y: fy + 34, tracking: 0.1 }).d}" fill="${ink.bone}" opacity="0.9"/>`);
  return { code, title: "Night Garage — jacket back panel", family: "night_garage", w: W, h: H, body: parts.join(""), defs: defs.join(""), inks: [ink.bone, ink.coral, ink.sodium, ink.teal] };
}

/** Small chest stamp in the style of an old gym sign. */
export function chestStamp(ink: Inks, code: string): PrintArt {
  const W = 420;
  const H = 260;
  const p: string[] = [];
  p.push(`<path d="${rect(4, 4, W - 8, H - 8)}" fill="none" stroke="${ink.bone}" stroke-width="8"/>`);
  p.push(`<path d="${rect(20, 20, W - 40, H - 40)}" fill="none" stroke="${ink.bone}" stroke-width="2.5"/>`);
  const name = brand.shortName.toUpperCase();
  const s1 = fitSize(name, { font: "shoulders900", tracking: 0.02 }, W - 80);
  p.push(`<path d="${textPath(name, { font: "shoulders900", size: s1, x: W / 2, y: 40 + s1 * 0.78, align: "center", tracking: 0.02 }).d}" fill="${ink.bone}"/>`);
  p.push(`<path d="${textPath("ATHLETICS", { font: "shoulders700", size: 40, x: W / 2, y: 40 + s1 * 0.78 + 50, align: "center", tracking: 0.5 }).d}" fill="${ink.bone}"/>`);
  p.push(`<path d="${rect(40, H - 58, W - 80, 2.5)}" fill="${ink.bone}"/>`);
  p.push(`<path d="${textPath("NO. 01 — 01:13 AM", { font: "mono600", size: 24, x: W / 2, y: H - 30, align: "center", tracking: 0.05 }).d}" fill="${ink.bone}"/>`);
  return { code, title: "After Hours chest stamp", family: "night_garage", w: W, h: H, body: p.join(""), inks: [ink.bone] };
}

/* ─────────────────────────────── LAST REP CLUB ─────────────────────────────── */

function crest(ink: Inks, cx: number, cy: number, R: number, opts: { accent: boolean }): string {
  const p: string[] = [];
  p.push(`<path d="${ring(cx, cy, R, R * 0.035)}" fill="${ink.bone}"/>`);
  p.push(`<path d="${ring(cx, cy, R * 0.93, R * 0.012)}" fill="${ink.bone}"/>`);
  p.push(`<path d="${ring(cx, cy, R * 0.63, R * 0.02)}" fill="${ink.bone}"/>`);
  // arc lettering
  p.push(`<path d="${arcTextPath("LAST REP CLUB", { font: "graduate", size: R * 0.2, cx, cy, r: R * 0.71, tracking: 0.08, side: "top" })}" fill="${ink.bone}"/>`);
  p.push(`<path d="${arcTextPath("ATHLETIC DEPT.", { font: "graduate", size: R * 0.15, cx, cy, r: R * 0.83, tracking: 0.1, side: "bottom" })}" fill="${ink.bone}"/>`);
  // side stars
  for (const a of [-1, 1]) {
    const ang = ((90 * a + (a > 0 ? 0 : 0)) * Math.PI) / 180;
    p.push(`<path d="${star(cx + Math.sin(ang) * R * 0.78, cy - Math.cos(ang) * R * 0.78 + R * 0.02, R * 0.06, R * 0.025)}" fill="${opts.accent ? ink.coral : ink.bone}"/>`);
  }
  // centre: dumbbell over "13"
  const db = R * 0.36;
  const by = cy - R * 0.17;
  let d = rect(cx - db, by - R * 0.025, db * 2, R * 0.05);
  for (const s of [-1, 1]) {
    d += rect(cx + s * db * 0.72 - R * 0.035, by - R * 0.11, R * 0.07, R * 0.22);
    d += rect(cx + s * db * 0.92 - R * 0.025, by - R * 0.08, R * 0.05, R * 0.16);
  }
  p.push(`<path d="${d}" fill="${ink.bone}"/>`);
  const n = "13";
  const ns = R * 0.52;
  p.push(`<path d="${textPath(n, { font: "graduate", size: ns, x: cx + 5, y: cy + R * 0.3 + 5, align: "center" }).d}" fill="${opts.accent ? ink.coral : ink.ground}"/>`);
  p.push(`<path d="${textPath(n, { font: "graduate", size: ns, x: cx, y: cy + R * 0.3, align: "center" }).d}" fill="${ink.bone}"/>`);
  return p.join("");
}

export function lastRepBack(ink: Inks, code: string): PrintArt {
  const W = 900;
  const H = 980;
  const p: string[] = [];
  // Arched varsity "LAST REP"
  const word = "LAST REP";
  const size = fitSize(word, { font: "graduate", tracking: 0.04 }, W - 90);
  p.push(`<path d="${archTextPath(word, { font: "graduate", size, x: W / 2 + 7, y: size * 0.95 + 7 + 40, align: "center", tracking: 0.04, arch: 46 })}" fill="${ink.coral}"/>`);
  p.push(`<path d="${archTextPath(word, { font: "graduate", size, x: W / 2, y: size * 0.95 + 40, align: "center", tracking: 0.04, arch: 46 })}" fill="${ink.bone}"/>`);
  // Crest
  const R = 270;
  const cy = size * 0.95 + 60 + R + 14;
  p.push(crest(ink, W / 2, cy, R, { accent: true }));
  // Ribbon banner "MEMBERS ONLY"
  const by = cy + R - 10;
  const bw = 560;
  const bh = 84;
  const bx = (W - bw) / 2;
  const tail = `M${bx - 70} ${by + 22}L${bx + 10} ${by + 22}L${bx + 10} ${by + bh + 22}L${bx - 70} ${by + bh + 22}L${bx - 40} ${by + 22 + bh / 2}Z` + `M${bx + bw + 70} ${by + 22}L${bx + bw - 10} ${by + 22}L${bx + bw - 10} ${by + bh + 22}L${bx + bw + 70} ${by + bh + 22}L${bx + bw + 40} ${by + 22 + bh / 2}Z`;
  p.push(`<path d="${tail}" fill="${ink.coral}"/>`);
  p.push(`<path d="${rect(bx, by, bw, bh)}" fill="${ink.bone}"/>`);
  p.push(`<path d="${textPath("MEMBERS ONLY", { font: "shoulders900", size: 62, x: W / 2, y: by + bh / 2 + 22, align: "center", tracking: 0.14 }).d}" fill="${ink.ground}"/>`);
  return { code, title: "Last Rep Club — back graphic", family: "last_rep_club", w: W, h: H, body: p.join(""), inks: [ink.bone, ink.coral] };
}

export function lastRepSide(ink: Inks, code: string): PrintArt {
  const W = 220;
  const H = 640;
  const p: string[] = [];
  const R = 96;
  p.push(crest(ink, W / 2, R + 6, R, { accent: false }));
  // vertical lettering reading upward
  const label = "LAST REP CLUB";
  const s = fitSize(label, { font: "shoulders900", tracking: 0.12 }, H - (2 * R + 40));
  const t = textPath(label, { font: "shoulders900", size: s, x: 0, y: 0, align: "center", tracking: 0.12 });
  const midY = 2 * R + 30 + (H - 2 * R - 30) / 2;
  p.push(`<path d="${t.d}" fill="${ink.bone}" transform="translate(${W / 2 + s * 0.36} ${midY}) rotate(-90)"/>`);
  return { code, title: "Last Rep Club — side mark", family: "last_rep_club", w: W, h: H, body: p.join(""), inks: [ink.bone] };
}

/* ─────────────────────────────── COASTAL SHIFT ─────────────────────────────── */

function sunset(ink: Inks, cx: number, cy: number, R: number, opts: { palms: boolean; seed: number }): { body: string; defs: string } {
  const clip = id("sun");
  const mask = id("sunm");
  const p: string[] = [];
  // Stripe gaps: thicker toward the bottom
  let gaps = "";
  const n = 7;
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / (n + 1);
    const y = cy - R * 0.15 + t * R * 1.15;
    const gh = 4 + t * R * 0.075;
    gaps += rect(cx - R - 2, y, 2 * R + 4, gh);
  }
  const palms = opts.palms
    ? palm({ x: cx - R * 0.72, y: cy + R * 1.05, h: R * 1.55, lean: R * 0.12, seed: opts.seed, fronds: 9 }) +
      palm({ x: cx + R * 0.86, y: cy + R * 1.05, h: R * 1.2, lean: -R * 0.1, seed: opts.seed + 3, fronds: 8 })
    : "";
  const defs =
    `<clipPath id="${clip}"><path d="${circle(cx, cy, R)}"/></clipPath>` +
    `<mask id="${mask}" maskUnits="userSpaceOnUse" x="${cx - R * 2}" y="${cy - R * 2}" width="${R * 4}" height="${R * 4}"><rect x="${cx - R * 2}" y="${cy - R * 2}" width="${R * 4}" height="${R * 4}" fill="white"/><path d="${gaps}" fill="black"/>${palms ? `<path d="${palms}" fill="black"/>` : ""}</mask>`;
  // Upper half sodium, lower half coral (two inks), horizon at cy + R*0.2
  p.push(
    `<g mask="url(#${mask})"><g clip-path="url(#${clip})"><rect x="${cx - R}" y="${cy - R}" width="${2 * R}" height="${R * 1.05}" fill="${ink.sodium}"/><rect x="${cx - R}" y="${cy + R * 0.05}" width="${2 * R}" height="${R * 0.95}" fill="${ink.coral}"/></g></g>`,
  );
  if (palms) p.push(`<path d="${palms}" fill="${ink.teal}" opacity="0"/>`);
  return { body: p.join(""), defs };
}

export function coastalRear(ink: Inks, code: string): PrintArt {
  const W = 1000;
  const H = 1120;
  const p: string[] = [];
  const defs: string[] = [];
  const R = 320;
  const cx = W / 2;
  const cy = 60 + R;
  const s = sunset(ink, cx, cy, R, { palms: true, seed: 41 });
  defs.push(s.defs);
  p.push(s.body);
  // Ocean lines under the sun
  const rand = rng(77);
  let sea = "";
  const seaTop = cy + R + 8;
  for (let i = 0; i < 9; i++) {
    const y = seaTop + i * 15;
    const len = (W * 0.8 - i * 26) * (0.86 + rand() * 0.14);
    sea += rect(cx - len / 2, y, len, 5 - i * 0.25);
  }
  p.push(`<path d="${sea}" fill="${ink.teal}"/>`);
  // Sun reflection: broken coral dashes centred
  let refl = "";
  for (let i = 0; i < 7; i++) {
    const y = seaTop + 6 + i * 15;
    const len = 120 - i * 12;
    refl += rect(cx - len / 2 + (rand() - 0.5) * 30, y, len, 4);
  }
  p.push(`<path d="${refl}" fill="${ink.coral}"/>`);
  // Script title with offset shadow
  const title = "Coastal Shift";
  const ts = fitSize(title, { font: "yellowtail" }, W - 70);
  const ty = seaTop + 150 + ts * 0.42;
  p.push(`<path d="${textPath(title, { font: "yellowtail", size: ts, x: W / 2 + 9, y: ty + 9, align: "center" }).d}" fill="${ink.coral}" transform="rotate(-6 ${W / 2} ${ty})"/>`);
  p.push(`<path d="${textPath(title, { font: "yellowtail", size: ts, x: W / 2, y: ty, align: "center" }).d}" fill="${ink.bone}" transform="rotate(-6 ${W / 2} ${ty})"/>`);
  // Small caps
  const capsY = ty + 140;
  p.push(`<path d="${textPath("NIGHT TRAINING DIVISION", { font: "shoulders700", size: 46, x: W / 2, y: capsY, align: "center", tracking: 0.3 }).d}" fill="${ink.bone}"/>`);
  p.push(`<path d="${rect(W / 2 - 220, capsY + 26, 440, 3)}" fill="${ink.bone}"/>`);
  p.push(`<path d="${textPath(`${brand.name.toUpperCase()} · ${brand.dropCode}`, { font: "mono600", size: 22, x: W / 2, y: capsY + 66, align: "center", tracking: 0.12 }).d}" fill="${ink.bone}"/>`);
  return { code, title: "Coastal Shift — rear print", family: "coastal_shift", w: W, h: H, body: p.join(""), defs: defs.join(""), inks: [ink.bone, ink.coral, ink.sodium, ink.teal] };
}

export function coastalChest(ink: Inks, code: string): PrintArt {
  const W = 520;
  const H = 360;
  const p: string[] = [];
  const defs: string[] = [];
  const R = 92;
  const s = sunset(ink, W / 2, 20 + R, R, { palms: false, seed: 5 });
  defs.push(s.defs);
  p.push(s.body);
  const title = "Coastal Shift";
  const ts = fitSize(title, { font: "yellowtail" }, W - 40);
  const ty = 20 + R * 2 + ts * 0.18;
  p.push(`<path d="${textPath(title, { font: "yellowtail", size: ts, x: W / 2 + 5, y: ty + 5, align: "center" }).d}" fill="${ink.coral}" transform="rotate(-6 ${W / 2} ${ty})"/>`);
  p.push(`<path d="${textPath(title, { font: "yellowtail", size: ts, x: W / 2, y: ty, align: "center" }).d}" fill="${ink.bone}" transform="rotate(-6 ${W / 2} ${ty})"/>`);
  p.push(`<path d="${textPath("NIGHT TRAINING DIV.", { font: "shoulders700", size: 26, x: W / 2, y: H - 10, align: "center", tracking: 0.3 }).d}" fill="${ink.bone}"/>`);
  return { code, title: "Coastal Shift — chest", family: "coastal_shift", w: W, h: H, body: p.join(""), defs: defs.join(""), inks: [ink.bone, ink.coral, ink.sodium] };
}

/* ─────────────────────────────── Brand marks ─────────────────────────────── */

/** Compact monogram badge used for the hoodie front (decoration method pending approval). */
export function monogram(ink: Inks, code: string): PrintArt {
  const W = 300;
  const H = 250;
  const p: string[] = [];
  p.push(`<rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="28" fill="none" stroke="${ink.bone}" stroke-width="10"/>`);
  const mono = brand.monogram.slice(0, 2);
  const s = 150;
  p.push(`<path d="${textPath(mono, { font: "shoulders900", size: s, x: W / 2, y: 40 + s * 0.74, align: "center", tracking: -0.01 }).d}" fill="${ink.bone}"/>`);
  p.push(`<path d="${textPath("ATHLETICS", { font: "shoulders700", size: 30, x: W / 2, y: H - 34, align: "center", tracking: 0.42 }).d}" fill="${ink.bone}"/>`);
  return { code, title: "After Hours monogram", family: "night_garage", w: W, h: H, body: p.join(""), inks: [ink.bone] };
}

/**
 * Original scene illustrations for the storefront (concept art, not photography):
 *  - heroScene: a coastal gym at 1:13 a.m. — concrete block, roll-up door left
 *    open with warm light, fluorescent strip over the steel door, a pasted
 *    training poster, sodium streetlight, palms, wet asphalt.
 *  - concreteFloor: the floor used under flat-lay outfit compositions.
 */
import { brand } from "../../src/config/brand";
import { textPath } from "./lib/fonts";
import { circle, palm, rect, rng } from "./lib/svg";
import type { PrintArt } from "./prints";

export const HERO = { w: 2400, h: 1350 } as const;

export function heroScene(poster: PrintArt, crop?: { x: number; y: number; w: number; h: number }): string {
  const { w: W, h: H } = HERO;
  const horizon = 930;
  const rand = rng(1313);
  const defs: string[] = [];
  const L: string[] = [];
  const cif = `color-interpolation-filters="sRGB"`;

  defs.push(`<linearGradient id="sky" x1="0" y1="0" x2="0" y2="${horizon}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#050708"/><stop offset="0.62" stop-color="#0b1113"/><stop offset="1" stop-color="#16201f"/></linearGradient>`);
  defs.push(`<linearGradient id="haze" x1="0" y1="${horizon - 260}" x2="0" y2="${horizon + 40}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#3e5754" stop-opacity="0"/><stop offset="1" stop-color="#3e5754" stop-opacity="0.22"/></linearGradient>`);
  defs.push(`<radialGradient id="sodium" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffcf94" stop-opacity="0.95"/><stop offset="0.18" stop-color="#f0a55c" stop-opacity="0.5"/><stop offset="1" stop-color="#f0a55c" stop-opacity="0"/></radialGradient>`);
  defs.push(`<radialGradient id="fluoro" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#f3f8f4" stop-opacity="0.9"/><stop offset="0.22" stop-color="#cfe3df" stop-opacity="0.32"/><stop offset="1" stop-color="#cfe3df" stop-opacity="0"/></radialGradient>`);
  defs.push(`<linearGradient id="doorlight" x1="0" y1="740" x2="0" y2="${horizon}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffd59c"/><stop offset="0.55" stop-color="#f4a95e"/><stop offset="1" stop-color="#c8743a"/></linearGradient>`);
  defs.push(`<linearGradient id="spill" x1="0" y1="${horizon}" x2="0" y2="${H}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f0a55c" stop-opacity="0.55"/><stop offset="1" stop-color="#f0a55c" stop-opacity="0"/></linearGradient>`);
  defs.push(`<linearGradient id="cone" x1="0" y1="560" x2="0" y2="${horizon}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#e8f2ef" stop-opacity="0.28"/><stop offset="1" stop-color="#e8f2ef" stop-opacity="0"/></linearGradient>`);
  defs.push(`<linearGradient id="streetcone" x1="0" y1="330" x2="0" y2="${horizon + 60}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f0a55c" stop-opacity="0.22"/><stop offset="1" stop-color="#f0a55c" stop-opacity="0"/></linearGradient>`);
  defs.push(`<radialGradient id="vignette" cx="0.55" cy="0.48" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.65"/></radialGradient>`);
  defs.push(`<linearGradient id="leftshade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.55"/><stop offset="0.45" stop-color="#000" stop-opacity="0.12"/><stop offset="0.6" stop-color="#000" stop-opacity="0"/></linearGradient>`);
  defs.push(`<filter id="blur4" ${cif}><feGaussianBlur stdDeviation="4"/></filter>`);
  defs.push(`<filter id="blur12" ${cif} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12"/></filter>`);
  defs.push(`<filter id="blur30" ${cif} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="30"/></filter>`);
  defs.push(`<filter id="streak" ${cif} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="10 34"/></filter>`);
  defs.push(`<filter id="concrete" x="0" y="0" width="${W}" height="${H}" filterUnits="userSpaceOnUse" ${cif}><feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="4" seed="4"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer></filter>`);
  defs.push(`<filter id="grain" x="0" y="0" width="${W}" height="${H}" filterUnits="userSpaceOnUse" ${cif}><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="9"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer></filter>`);
  defs.push(`<filter id="paint" x="0" y="0" width="${W}" height="${H}" filterUnits="userSpaceOnUse" ${cif}><feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="2" seed="21" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  4 0 0 0 -1.25" result="a"/><feComposite in="SourceGraphic" in2="a" operator="in"/></filter>`);
  defs.push(`<clipPath id="facadeclip"><path d="${rect(1060, 420, W - 1060, horizon - 420)}"/></clipPath>`);

  // Sky, stars, haze
  L.push(`<rect width="${W}" height="${horizon + 2}" fill="url(#sky)"/>`);
  let stars = "";
  for (let i = 0; i < 90; i++) stars += circle(rand() * W, rand() * horizon * 0.55, 0.8 + rand() * 1.6);
  L.push(`<path d="${stars}" fill="#dfe9e6" opacity="0.55"/>`);
  // Distant palms and a far roofline
  L.push(`<path d="${rect(0, horizon - 70, 1100, 70)}${rect(80, horizon - 120, 260, 50)}${rect(520, horizon - 96, 300, 30)}" fill="#0b1112"/>`);
  for (const [x, h, lean, seed] of [
    [180, 560, 30, 3],
    [330, 470, -24, 5],
    [610, 620, 40, 8],
    [2060, 760, -36, 11],
    [2250, 690, 30, 17],
  ] as const) {
    L.push(`<path d="${palm({ x, y: horizon - 30, h, lean, seed, fronds: 10 })}" fill="#0c1716"/>`);
  }
  L.push(`<rect width="${W}" height="${horizon}" fill="url(#haze)"/>`);
  // Power line
  L.push(`<path d="M0 262C500 330 900 330 1400 285S2100 250 2400 300" stroke="#1d2626" stroke-width="3" fill="none"/>`);
  L.push(`<path d="M0 292C520 360 920 352 1400 312S2100 282 2400 330" stroke="#1d2626" stroke-width="2" fill="none"/>`);

  // Streetlight glow behind everything near it
  L.push(`<ellipse cx="900" cy="350" rx="420" ry="420" fill="url(#sodium)" opacity="0.65"/>`);
  L.push(`<path d="M900 340L1100 340L1240 ${horizon + 60}L760 ${horizon + 60}Z" fill="url(#streetcone)" filter="url(#blur30)"/>`);

  // Building
  L.push(`<path d="${rect(1060, 420, W - 1060, horizon - 420)}" fill="#151615"/>`);
  L.push(`<path d="${rect(1046, 398, W - 1046, 26)}" fill="#1f201f"/>`);
  L.push(`<g clip-path="url(#facadeclip)"><rect width="${W}" height="${H}" fill="#151615"/><rect width="${W}" height="${H}" filter="url(#concrete)" opacity="0.7" style="mix-blend-mode:overlay"/><ellipse cx="1335" cy="700" rx="330" ry="260" fill="url(#fluoro)" opacity="0.35"/><ellipse cx="2020" cy="760" rx="520" ry="300" fill="url(#sodium)" opacity="0.28"/><ellipse cx="1000" cy="420" rx="300" ry="260" fill="url(#sodium)" opacity="0.18"/></g>`);
  let joints = "";
  for (let x = 1240; x < W; x += 230) joints += rect(x, 424, 3, horizon - 424);
  joints += rect(1060, 660, W - 1060, 3);
  L.push(`<path d="${joints}" fill="#0f100f" opacity="0.8"/>`);
  // stains under the parapet
  for (let i = 0; i < 14; i++) {
    const x = 1080 + rand() * (W - 1100);
    L.push(`<path d="${rect(x, 424, 6 + rand() * 18, 60 + rand() * 180)}" fill="#0c0d0c" opacity="${0.25 + rand() * 0.25}" filter="url(#blur4)"/>`);
  }

  // Painted wall sign
  const sign = textPath("OPEN LATE", { font: "stencil800", size: 128, x: 1110, y: 590, tracking: 0.08 });
  L.push(`<path d="${sign.d}" fill="#cbc2ae" opacity="0.36" filter="url(#paint)"/>`);
  const sign2 = textPath("IRON · CHALK · NO MIRRORS", { font: "shoulders700", size: 34, x: 1114, y: 640, tracking: 0.24 });
  L.push(`<path d="${sign2.d}" fill="#cbc2ae" opacity="0.3" filter="url(#paint)"/>`);

  // Entrance door with fluorescent strip
  L.push(`<path d="M1170 600L1490 600L1660 ${horizon}L1000 ${horizon}Z" fill="url(#cone)"/>`);
  L.push(`<path d="${rect(1250, 700, 170, horizon - 700)}" fill="#202322"/>`);
  L.push(`<path d="${rect(1262, 712, 146, horizon - 712)}" fill="#272b2a"/>`);
  L.push(`<path d="${rect(1300, 742, 70, 92)}" fill="#a9c3bd" opacity="0.5"/>`);
  L.push(`<path d="${rect(1386, 812, 10, 30)}" fill="#9aa09d"/>`);
  L.push(`<ellipse cx="1335" cy="676" rx="190" ry="70" fill="url(#fluoro)"/>`);
  L.push(`<path d="${rect(1220, 666, 230, 16)}" fill="#3a3d3c"/>`);
  L.push(`<path d="${rect(1230, 680, 210, 8)}" fill="#f5fbf7"/>`);
  L.push(`<path d="${rect(1230, 676, 210, 16)}" fill="#f5fbf7" opacity="0.6" filter="url(#blur12)"/>`);

  // Pasted training poster (the Night Garage print, weathered)
  const pw = 170;
  const ph = (pw * poster.h) / poster.w;
  defs.push(poster.defs ?? "");
  L.push(
    `<g transform="translate(1500 712) rotate(-2.5)"><path d="${rect(-8, -8, pw + 16, ph + 16)}" fill="#cfc6b2" opacity="0.88"/><path d="${rect(0, 0, pw, ph)}" fill="#1f201e"/><g transform="scale(${pw / poster.w})">${poster.body}</g><path d="${rect(-8, -8, pw + 16, ph + 16)}" fill="#000" opacity="0.25"/></g>`,
  );

  // Roll-up door, half raised, warm interior
  const dx = 1760;
  const dw = 520;
  const dTop = 560;
  const slatBottom = 742;
  L.push(`<path d="${rect(dx, slatBottom, dw, horizon - slatBottom)}" fill="url(#doorlight)"/>`);
  // interior silhouettes
  const sil = "#3a2312";
  let inside = "";
  inside += rect(dx + 90, 790, 12, horizon - 790) + rect(dx + 300, 790, 12, horizon - 790); // rack uprights
  inside += rect(dx + 40, 846, 330, 9); // bar
  inside += rect(dx + 52, 812, 22, 78) + rect(dx + 76, 820, 14, 62) + rect(dx + 330, 820, 14, 62) + rect(dx + 344, 812, 22, 78);
  inside += rect(dx + 420, 760, 4, 60) + rect(dx + 400, 818, 46, 112); // heavy bag
  inside += rect(dx + 150, horizon - 40, 140, 16) + rect(dx + 166, horizon - 24, 10, 24) + rect(dx + 262, horizon - 24, 10, 24); // bench
  for (let i = 0; i < 4; i++) inside += circle(dx + 470, horizon - 18 - i * 12, 26 - i * 3); // plate stack
  L.push(`<path d="${inside}" fill="${sil}"/>`);
  L.push(`<path d="${rect(dx + 30, slatBottom + 14, dw - 60, 5)}" fill="#fff6e6" opacity="0.9"/>`);
  L.push(`<path d="${rect(dx, dTop, dw, slatBottom - dTop)}" fill="#2a2b29"/>`);
  let slats = "";
  for (let y = dTop + 22; y < slatBottom; y += 22) slats += rect(dx, y, dw, 3);
  L.push(`<path d="${slats}" fill="#131413"/>`);
  L.push(`<path d="${rect(dx, slatBottom - 8, dw, 8)}" fill="#3a3b38"/>`);
  L.push(`<path d="${rect(dx - 18, dTop - 14, dw + 36, 14)}${rect(dx - 18, dTop, 18, horizon - dTop)}${rect(dx + dw, dTop, 18, horizon - dTop)}" fill="#2d302f"/>`);
  L.push(`<path d="${rect(dx, slatBottom, dw, 40)}" fill="#ffd9a6" opacity="0.35" filter="url(#blur12)"/>`);

  // Ground
  L.push(`<path d="${rect(0, horizon, W, H - horizon)}" fill="#0b0c0c"/>`);
  L.push(`<path d="${rect(0, horizon, W, 34)}" fill="#151716"/>`);
  L.push(`<path d="${rect(0, horizon + 34, W, 5)}" fill="#202322"/>`);
  L.push(`<path d="M${dx + 10} ${horizon}L${dx + dw - 10} ${horizon}L${dx + dw + 180} ${H}L${dx - 240} ${H}Z" fill="url(#spill)" opacity="0.5" filter="url(#blur30)"/>`);
  // Wet reflections: blurred vertical streaks broken by ripples
  const refl: string[] = [];
  refl.push(`<path d="${rect(dx + 40, horizon + 40, dw - 80, 360)}" fill="#f0a55c" opacity="0.42" filter="url(#streak)"/>`);
  refl.push(`<path d="${rect(1240, horizon + 40, 190, 240)}" fill="#e6f1ee" opacity="0.3" filter="url(#streak)"/>`);
  refl.push(`<path d="${rect(870, horizon + 50, 60, 300)}" fill="#f0a55c" opacity="0.32" filter="url(#streak)"/>`);
  let ripples = "";
  for (let i = 0; i < 40; i++) {
    const y = horizon + 48 + rand() * (H - horizon - 60);
    ripples += rect(800 + rand() * 1600, y, 60 + rand() * 260, 2 + rand() * 3);
  }
  L.push(`<g>${refl.join("")}<path d="${ripples}" fill="#0b0c0c" opacity="0.85"/></g>`);
  // Puddle highlights
  let glints = "";
  for (let i = 0; i < 26; i++) glints += rect(900 + rand() * 1500, horizon + 60 + rand() * 300, 20 + rand() * 90, 2);
  L.push(`<path d="${glints}" fill="#f6c58f" opacity="0.35"/>`);

  // Streetlight pole and head
  L.push(`<path d="M886 ${horizon + 40}L886 360C886 318 900 300 940 300L1000 300L1000 312L944 312C912 312 900 326 900 360L900 ${horizon + 40}Z" fill="#161817"/>`);
  L.push(`<path d="M972 312L1030 312L1020 330L982 330Z" fill="#2a2b29"/>`);
  L.push(`<ellipse cx="1001" cy="332" rx="34" ry="8" fill="#ffe2b5"/>`);
  L.push(`<ellipse cx="1001" cy="340" rx="90" ry="50" fill="#f0a55c" opacity="0.5" filter="url(#blur30)"/>`);


  // Atmosphere: left shade for headline legibility, grain, vignette
  L.push(`<rect width="${W}" height="${H}" fill="url(#leftshade)"/>`);
  L.push(`<rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.22" style="mix-blend-mode:soft-light"/>`);
  L.push(`<rect width="${W}" height="${H}" fill="url(#vignette)"/>`);

  const vb = crop ? `${crop.x} ${crop.y} ${crop.w} ${crop.h}` : `0 0 ${W} ${H}`;
  const ow = crop ? crop.w : W;
  const oh = crop ? crop.h : H;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ow}" height="${oh}" viewBox="${vb}"><defs>${defs.join("")}</defs>${L.join("")}</svg>`;
}

/** Concrete floor for flat-lays, with an overhead light pool. */
export function concreteFloor(w: number, h: number, seed = 3): string {
  const cif = `color-interpolation-filters="sRGB"`;
  const rand = rng(seed);
  let joints = "";
  joints += rect(0, h * 0.62, w, 3);
  joints += rect(w * 0.71, 0, 3, h);
  let pits = "";
  for (let i = 0; i < 160; i++) pits += circle(rand() * w, rand() * h, 0.8 + rand() * 2.2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>
<filter id="stain" x="0" y="0" width="${w}" height="${h}" filterUnits="userSpaceOnUse" ${cif}><feTurbulence type="fractalNoise" baseFrequency="0.0035" numOctaves="4" seed="${seed}"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer></filter>
<filter id="agg" x="0" y="0" width="${w}" height="${h}" filterUnits="userSpaceOnUse" ${cif}><feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="3" seed="${seed + 1}"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer></filter>
<radialGradient id="pool" cx="0.5" cy="0.42" r="0.72"><stop offset="0" stop-color="#fff" stop-opacity="0.1"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.02"/><stop offset="1" stop-color="#000" stop-opacity="0.6"/></radialGradient>
</defs>
<rect width="${w}" height="${h}" fill="#1d1e1d"/>
<rect width="${w}" height="${h}" filter="url(#stain)" opacity="0.55" style="mix-blend-mode:soft-light"/>
<rect width="${w}" height="${h}" filter="url(#agg)" opacity="0.4" style="mix-blend-mode:soft-light"/>
<path d="${pits}" fill="#0d0e0d" opacity="0.6"/>
<path d="${joints}" fill="#0c0d0c" opacity="0.9"/>
<rect width="${w}" height="${h}" fill="url(#pool)"/>
</svg>`;
}

/** Social card: product render on the right, name + brand on the left. */
export function socialCard(o: { productName: string; category: string; garmentPngBase64: string; ratio: number }): string {
  const W = 1200;
  const H = 630;
  const imgH = 600;
  const imgW = imgH * o.ratio;
  const name = textPath(o.productName, { font: "anton", size: 120, x: 70, y: 330 });
  const cat = textPath(o.category.toUpperCase(), { font: "shoulders700", size: 34, x: 74, y: 392, tracking: 0.16 });
  const b = textPath(brand.name.toUpperCase(), { font: "shoulders900", size: 30, x: 74, y: 96, tracking: 0.3 });
  const d = textPath(`${brand.dropName.toUpperCase()}`, { font: "mono600", size: 22, x: 74, y: 560, tracking: 0.08 });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><radialGradient id="spot" cx="0.72" cy="0.45" r="0.55"><stop offset="0" stop-color="#3a3a36"/><stop offset="1" stop-color="#0d0d0c"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#spot)"/>
<rect x="0" y="0" width="${W}" height="8" fill="#f3f6ef" opacity="0.85"/>
<image href="data:image/png;base64,${o.garmentPngBase64}" x="${W - imgW - 30}" y="${(H - imgH) / 2 + 10}" width="${imgW}" height="${imgH}"/>
<path d="${b.d}" fill="#ece5d8"/><path d="${name.d}" fill="#ece5d8"/><path d="${cat.d}" fill="#b8b1a4"/><path d="${d.d}" fill="#ee7c5e"/>
</svg>`;
}

/** Small geometry + SVG helpers for the art pipeline. */

export type Pt = [number, number];
export type Seg =
  | { t: "L"; to: Pt }
  | { t: "Q"; c: Pt; to: Pt }
  | { t: "C"; c1: Pt; c2: Pt; to: Pt };

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (p: Pt) => `${r2(p[0])} ${r2(p[1])}`;

function segToD(s: Seg): string {
  if (s.t === "L") return `L${fmt(s.to)}`;
  if (s.t === "Q") return `Q${fmt(s.c)} ${fmt(s.to)}`;
  return `C${fmt(s.c1)} ${fmt(s.c2)} ${fmt(s.to)}`;
}

/**
 * Build a closed, perfectly symmetric path from its right half. `start` and the
 * last segment's end must lie on the mirror axis (x = cx).
 */
export function mirrorPath(start: Pt, half: Seg[], cx = 600): string {
  const m = (p: Pt): Pt => [2 * cx - p[0], p[1]];
  let d = `M${fmt(start)}`;
  for (const s of half) d += segToD(s);
  // walk back along the mirrored half
  const pts: Pt[] = [start, ...half.map((s) => s.to)];
  for (let i = half.length - 1; i >= 0; i--) {
    const s = half[i]!;
    const from = pts[i]!; // segment start (becomes the reversed end)
    if (s.t === "L") d += `L${fmt(m(from))}`;
    else if (s.t === "Q") d += `Q${fmt(m(s.c))} ${fmt(m(from))}`;
    else d += `C${fmt(m(s.c2))} ${fmt(m(s.c1))} ${fmt(m(from))}`;
  }
  return d + "Z";
}

/** Open path (not closed) from a start point and segments. */
export function openPath(start: Pt, segs: Seg[]): string {
  return `M${fmt(start)}` + segs.map(segToD).join("");
}

/** Mirror an open path's points horizontally (for symmetric details). */
export function mirrorSegs(start: Pt, segs: Seg[], cx = 600): { start: Pt; segs: Seg[] } {
  const m = (p: Pt): Pt => [2 * cx - p[0], p[1]];
  return {
    start: m(start),
    segs: segs.map((s) =>
      s.t === "L" ? { t: "L", to: m(s.to) } : s.t === "Q" ? { t: "Q", c: m(s.c), to: m(s.to) } : { t: "C", c1: m(s.c1), c2: m(s.c2), to: m(s.to) },
    ),
  };
}

export function circle(cx: number, cy: number, r: number): string {
  return `M${r2(cx - r)} ${r2(cy)}a${r2(r)} ${r2(r)} 0 1 0 ${r2(2 * r)} 0a${r2(r)} ${r2(r)} 0 1 0 ${r2(-2 * r)} 0Z`;
}

export function ring(cx: number, cy: number, r: number, w: number): string {
  // outer clockwise, inner counter-clockwise → evenodd-free hole
  const ro = r + w / 2;
  const ri = r - w / 2;
  return (
    `M${r2(cx - ro)} ${r2(cy)}a${r2(ro)} ${r2(ro)} 0 1 0 ${r2(2 * ro)} 0a${r2(ro)} ${r2(ro)} 0 1 0 ${r2(-2 * ro)} 0Z` +
    `M${r2(cx - ri)} ${r2(cy)}a${r2(ri)} ${r2(ri)} 0 1 1 ${r2(2 * ri)} 0a${r2(ri)} ${r2(ri)} 0 1 1 ${r2(-2 * ri)} 0Z`
  );
}

export function rect(x: number, y: number, w: number, h: number): string {
  return `M${r2(x)} ${r2(y)}h${r2(w)}v${r2(h)}h${r2(-w)}Z`;
}

export function star(cx: number, cy: number, ro: number, ri: number, n = 5, rot = -90): string {
  let d = "";
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    d += `${i === 0 ? "M" : "L"}${r2(cx + r * Math.cos(a))} ${r2(cy + r * Math.sin(a))}`;
  }
  return d + "Z";
}

/** Deterministic PRNG so renders are reproducible. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Halftone dots: one path containing a circle per grid cell, radius driven by
 * `intensity(x, y)` in 0..1. Rotated grid like a real screen.
 */
export function halftone(o: {
  x: number;
  y: number;
  w: number;
  h: number;
  step: number;
  angle?: number;
  maxR?: number;
  intensity: (x: number, y: number) => number;
}): string {
  const ang = ((o.angle ?? 22.5) * Math.PI) / 180;
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const maxR = o.maxR ?? o.step * 0.55;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const reach = Math.hypot(o.w, o.h) / 2 + o.step;
  let d = "";
  for (let u = -reach; u <= reach; u += o.step) {
    for (let v = -reach; v <= reach; v += o.step) {
      const px = cx + u * cos - v * sin;
      const py = cy + u * sin + v * cos;
      if (px < o.x || px > o.x + o.w || py < o.y || py > o.y + o.h) continue;
      const i = Math.max(0, Math.min(1, o.intensity(px, py)));
      if (i < 0.04) continue;
      d += circle(px, py, maxR * Math.sqrt(i));
    }
  }
  return d;
}

/** A palm tree silhouette: curved tapering trunk + feathered fronds. */
export function palm(o: { x: number; y: number; h: number; lean: number; seed: number; fronds?: number }): string {
  const rand = rng(o.seed);
  const topX = o.x + o.lean;
  const topY = o.y - o.h;
  const bw = o.h * 0.045; // base half-width
  const tw = o.h * 0.022; // top half-width
  // trunk with a gentle S-curve
  const c1: Pt = [o.x + o.lean * 0.05, o.y - o.h * 0.4];
  const c2: Pt = [topX - o.lean * 0.35, topY + o.h * 0.25];
  let d =
    `M${r2(o.x - bw)} ${r2(o.y)}` +
    `C${r2(c1[0] - bw)} ${r2(c1[1])} ${r2(c2[0] - tw)} ${r2(c2[1])} ${r2(topX - tw)} ${r2(topY)}` +
    `L${r2(topX + tw)} ${r2(topY)}` +
    `C${r2(c2[0] + tw)} ${r2(c2[1])} ${r2(c1[0] + bw)} ${r2(c1[1])} ${r2(o.x + bw)} ${r2(o.y)}Z`;
  // trunk rings (notches) as thin gaps would need evenodd; keep silhouette clean.
  const n = o.fronds ?? 9;
  for (let i = 0; i < n; i++) {
    const base = -170 + (i * 160) / (n - 1) + (rand() - 0.5) * 14; // degrees, -170..-10 (upward fan)
    const len = o.h * (0.42 + rand() * 0.18);
    const droop = 0.55 + rand() * 0.35;
    d += frond(topX, topY, base, len, droop, rand);
  }
  // a couple of drooping lower fronds
  d += frond(topX, topY, 15 + rand() * 10, o.h * 0.36, 0.9, rand);
  d += frond(topX, topY, 165 - rand() * 10, o.h * 0.36, 0.9, rand);
  return d;
}

function frond(x: number, y: number, angleDeg: number, len: number, droop: number, rand: () => number): string {
  // Spine is a quadratic curve that bends downward (gravity) proportional to droop.
  const a = (angleDeg * Math.PI) / 180;
  const ex = x + Math.cos(a) * len;
  const ey = y + Math.sin(a) * len + len * droop * 0.55;
  const cx = x + Math.cos(a) * len * 0.55;
  const cy = y + Math.sin(a) * len * 0.55 - len * 0.05;
  const steps = 14;
  const upper: Pt[] = [];
  const lower: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * ex;
    const py = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * cy + t * t * ey;
    // tangent
    const tx = 2 * (1 - t) * (cx - x) + 2 * t * (ex - cx);
    const ty = 2 * (1 - t) * (cy - y) + 2 * t * (ey - cy);
    const l = Math.hypot(tx, ty) || 1;
    const nx = -ty / l;
    const ny = tx / l;
    const width = len * 0.07 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.6;
    // serrated lower edge = leaflets
    const serr = i % 2 === 0 ? 1 : 0.25 + rand() * 0.2;
    upper.push([px + nx * width * 0.55, py + ny * width * 0.55]);
    lower.push([px - nx * width * 1.6 * serr, py - ny * width * 1.6 * serr]);
  }
  let d = `M${r2(x)} ${r2(y)}`;
  for (const p of upper) d += `L${r2(p[0])} ${r2(p[1])}`;
  for (let i = lower.length - 1; i >= 0; i--) d += `L${r2(lower[i]![0])} ${r2(lower[i]![1])}`;
  return d + "Z";
}

export function svgDoc(w: number, h: number, body: string, defs = ""): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`;
}

/** Map a box into another box (uniform scale, centred). */
export function fitTransform(
  src: { w: number; h: number },
  dst: { x: number; y: number; w: number; h: number },
): string {
  const s = Math.min(dst.w / src.w, dst.h / src.h);
  const tx = dst.x + (dst.w - src.w * s) / 2;
  const ty = dst.y + (dst.h - src.h * s) / 2;
  return `translate(${r2(tx)} ${r2(ty)}) scale(${r2(s * 10000) / 10000})`;
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

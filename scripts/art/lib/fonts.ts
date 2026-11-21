/**
 * Text → outline helpers for the art pipeline. Every font used here is SIL Open
 * Font License (or Apache 2.0) and is outlined into the artwork, so print files do
 * not depend on installed fonts. Licences are recorded in assets/manifest.json.
 */
import opentype, { type Font } from "opentype.js";
import { readFileSync } from "node:fs";

export const FONT_FILES = {
  anton: {
    file: "node_modules/@fontsource/anton/files/anton-latin-400-normal.woff",
    name: "Anton",
    license: "SIL OFL 1.1",
  },
  shoulders900: {
    file: "node_modules/@fontsource/big-shoulders-display/files/big-shoulders-display-latin-900-normal.woff",
    name: "Big Shoulders Display Black",
    license: "SIL OFL 1.1",
  },
  shoulders700: {
    file: "node_modules/@fontsource/big-shoulders-display/files/big-shoulders-display-latin-700-normal.woff",
    name: "Big Shoulders Display Bold",
    license: "SIL OFL 1.1",
  },
  shoulders500: {
    file: "node_modules/@fontsource/big-shoulders-display/files/big-shoulders-display-latin-500-normal.woff",
    name: "Big Shoulders Display Medium",
    license: "SIL OFL 1.1",
  },
  stencil800: {
    file: "node_modules/@fontsource/big-shoulders-stencil-display/files/big-shoulders-stencil-display-latin-800-normal.woff",
    name: "Big Shoulders Stencil Display ExtraBold",
    license: "SIL OFL 1.1",
  },
  graduate: {
    file: "node_modules/@fontsource/graduate/files/graduate-latin-400-normal.woff",
    name: "Graduate",
    license: "SIL OFL 1.1",
  },
  yellowtail: {
    file: "node_modules/@fontsource/yellowtail/files/yellowtail-latin-400-normal.woff",
    name: "Yellowtail",
    license: "Apache License 2.0",
  },
  mono600: {
    file: "node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff",
    name: "IBM Plex Mono SemiBold",
    license: "SIL OFL 1.1",
  },
} as const;

export type FontKey = keyof typeof FONT_FILES;

const cache = new Map<FontKey, Font>();

export function font(key: FontKey): Font {
  let f = cache.get(key);
  if (!f) {
    const buf = readFileSync(FONT_FILES[key].file);
    f = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    cache.set(key, f);
  }
  return f;
}

export function fontVersion(key: FontKey): string {
  const f = font(key);
  const rev = (f.tables as { head?: { fontRevision?: number } }).head?.fontRevision;
  return rev ? rev.toFixed(3) : "unknown";
}

export interface TextOpts {
  font: FontKey;
  size: number;
  x: number;
  y: number; // baseline
  align?: "left" | "center" | "right";
  tracking?: number; // em units, e.g. 0.05
  /** Horizontally scale glyphs (condense/expand) around the anchor. */
  scaleX?: number;
}

interface Placed {
  d: string;
  width: number;
}

function layout(str: string, o: TextOpts): { glyphs: { ch: string; x: number; adv: number }[]; width: number } {
  const f = font(o.font);
  const scale = o.size / f.unitsPerEm;
  const tracking = (o.tracking ?? 0) * o.size;
  const glyphs: { ch: string; x: number; adv: number }[] = [];
  let x = 0;
  const chars = [...str];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const g = f.charToGlyph(ch);
    const adv = (g.advanceWidth ?? 0) * scale;
    glyphs.push({ ch, x, adv });
    x += adv;
    const next = chars[i + 1];
    if (next) {
      x += f.getKerningValue(g, f.charToGlyph(next)) * scale;
      x += tracking;
    }
  }
  return { glyphs, width: x };
}

/** Outline a single line of text. Returns path data and the advance width. */
export function textPath(str: string, o: TextOpts): Placed {
  const f = font(o.font);
  const { glyphs, width } = layout(str, o);
  const sx = o.scaleX ?? 1;
  const totalW = width * sx;
  const start = o.align === "center" ? o.x - totalW / 2 : o.align === "right" ? o.x - totalW : o.x;
  const parts: string[] = [];
  for (const g of glyphs) {
    const p = f.charToGlyph(g.ch).getPath(0, 0, o.size);
    parts.push(transformPath(p.commands, (px, py) => [start + (g.x + px) * sx, o.y + py]));
  }
  return { d: parts.join(""), width: totalW };
}

export function measure(str: string, o: Omit<TextOpts, "x" | "y">): number {
  return layout(str, { ...o, x: 0, y: 0 }).width * (o.scaleX ?? 1);
}

/** Fit text into a given width by computing the font size. */
export function fitSize(str: string, o: Omit<TextOpts, "x" | "y" | "size">, width: number): number {
  const w = measure(str, { ...o, size: 100 });
  return (100 * width) / w;
}

export interface ArcOpts {
  font: FontKey;
  size: number;
  cx: number;
  cy: number;
  r: number; // radius of the baseline
  /** Angle (degrees, 0 = top, clockwise positive) of the text centre. */
  angle?: number;
  tracking?: number;
  /** "top": reads clockwise along the top. "bottom": reads left→right along the bottom. */
  side?: "top" | "bottom";
}

/** Text on a circular arc, centred on `angle`. */
export function arcTextPath(str: string, o: ArcOpts): string {
  const f = font(o.font);
  const { glyphs, width } = layout(str, { font: o.font, size: o.size, x: 0, y: 0, tracking: o.tracking });
  const side = o.side ?? "top";
  const centerAngle = ((o.angle ?? (side === "top" ? 0 : 180)) * Math.PI) / 180;
  const parts: string[] = [];
  for (const g of glyphs) {
    const mid = g.x + g.adv / 2 - width / 2; // arc-length offset of glyph centre
    if (side === "top") {
      const theta = centerAngle + mid / o.r; // clockwise from top
      const gx = o.cx + o.r * Math.sin(theta);
      const gy = o.cy - o.r * Math.cos(theta);
      const p = f.charToGlyph(g.ch).getPath(-g.adv / 2, 0, o.size);
      parts.push(
        transformPath(p.commands, (px, py) => {
          const rx = px * Math.cos(theta) - py * Math.sin(theta);
          const ry = px * Math.sin(theta) + py * Math.cos(theta);
          return [gx + rx, gy + ry];
        }),
      );
    } else {
      // Bottom arc reads left→right: glyphs are upright relative to the outside of the circle bottom.
      const theta = centerAngle - mid / o.r; // counter-clockwise as we move right
      const gx = o.cx + o.r * Math.sin(theta);
      const gy = o.cy - o.r * Math.cos(theta);
      const rot = theta - Math.PI; // glyph up-vector points to centre
      const p = f.charToGlyph(g.ch).getPath(-g.adv / 2, 0, o.size);
      // baseline sits on the circle; glyph ascends toward the centre
      parts.push(
        transformPath(p.commands, (px, py) => {
          const rx = px * Math.cos(rot) - py * Math.sin(rot);
          const ry = px * Math.sin(rot) + py * Math.cos(rot);
          return [gx + rx, gy + ry];
        }),
      );
    }
  }
  return parts.join("");
}

/** Text whose baseline follows a gentle arch (used for arched varsity lettering). */
export function archTextPath(
  str: string,
  o: TextOpts & { arch: number /* px rise at the centre */ },
): string {
  const f = font(o.font);
  const { glyphs, width } = layout(str, o);
  const start = o.x - width / 2;
  const parts: string[] = [];
  for (const g of glyphs) {
    const cxg = g.x + g.adv / 2 - width / 2; // -w/2..w/2
    const t = cxg / (width / 2); // -1..1
    const lift = o.arch * (1 - t * t);
    const slope = (-2 * o.arch * t) / (width / 2); // dy/dx of the arch
    const ang = Math.atan(-slope) * -1;
    const p = f.charToGlyph(g.ch).getPath(-g.adv / 2, 0, o.size);
    const gx = start + g.x + g.adv / 2;
    const gy = o.y - lift;
    parts.push(
      transformPath(p.commands, (px, py) => {
        const rx = px * Math.cos(ang) - py * Math.sin(ang);
        const ry = px * Math.sin(ang) + py * Math.cos(ang);
        return [gx + rx, gy + ry];
      }),
    );
  }
  return parts.join("");
}

type Cmd = opentype.PathCommand;

function transformPath(cmds: Cmd[], fn: (x: number, y: number) => [number, number]): string {
  const r = (n: number) => Math.round(n * 100) / 100;
  let out = "";
  for (const c of cmds) {
    switch (c.type) {
      case "M": {
        const [x, y] = fn(c.x, c.y);
        out += `M${r(x)} ${r(y)}`;
        break;
      }
      case "L": {
        const [x, y] = fn(c.x, c.y);
        out += `L${r(x)} ${r(y)}`;
        break;
      }
      case "Q": {
        const [x1, y1] = fn(c.x1, c.y1);
        const [x, y] = fn(c.x, c.y);
        out += `Q${r(x1)} ${r(y1)} ${r(x)} ${r(y)}`;
        break;
      }
      case "C": {
        const [x1, y1] = fn(c.x1, c.y1);
        const [x2, y2] = fn(c.x2, c.y2);
        const [x, y] = fn(c.x, c.y);
        out += `C${r(x1)} ${r(y1)} ${r(x2)} ${r(y2)} ${r(x)} ${r(y)}`;
        break;
      }
      case "Z":
        out += "Z";
        break;
    }
  }
  return out;
}

"use client";

import * as THREE from "three";

/**
 * Loads the generated 3D garment maps (public/3d, built by `npm run art:3d`) and
 * turns each view's height field into a displaced, closed half-shell. Front and
 * back halves meet at the sewn edges; hems, cuffs and necklines stay open.
 */
export interface Manifest {
  grid: { w: number; h: number; heightScale: number };
  metersPerPx: number;
  canvas: { w: number; h: number };
  variants: Record<
    string,
    {
      product: string;
      category: string;
      fabric: "jersey" | "fleece" | "woven" | "mesh";
      color: string;
      trim: string | null;
      heroView: "front" | "back";
      views: Record<"front" | "back", { albedo: string; albedoSm: string; normal: string; normalSm: string; orm: string; ormSm: string; height: string }>;
    }
  >;
}

export type Quality = "high" | "low";

export interface HalfAssets {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshPhysicalMaterial;
}
export interface GarmentAssets {
  variant: string;
  heroView: "front" | "back";
  front: HalfAssets;
  back: HalfAssets;
  width: number;
  height: number;
  /** shared uniforms (time) for the cloth flutter */
  uniforms: { uTime: { value: number }; uFlutter: { value: number } };
}

let manifestPromise: Promise<Manifest> | null = null;
export function loadManifest(): Promise<Manifest> {
  manifestPromise ??= fetch("/3d/manifest.json").then((r) => {
    if (!r.ok) throw new Error("3D manifest missing");
    return r.json() as Promise<Manifest>;
  });
  return manifestPromise;
}

const loader = typeof window !== "undefined" ? new THREE.TextureLoader() : null;
function tex(url: string, srgb: boolean, maxAniso: number): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    loader!.load(
      url,
      (t) => {
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = maxAniso;
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        resolve(t);
      },
      undefined,
      reject,
    );
  });
}

async function heights(url: string): Promise<Uint16Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`height map ${url}`);
  return new Uint16Array(await r.arrayBuffer());
}

function sample(h: Uint16Array, gw: number, gh: number, gx: number, gy: number): number {
  const x0 = Math.max(0, Math.min(gw - 1, Math.floor(gx)));
  const y0 = Math.max(0, Math.min(gh - 1, Math.floor(gy)));
  const x1 = Math.min(gw - 1, x0 + 1);
  const y1 = Math.min(gh - 1, y0 + 1);
  const tx = gx - x0;
  const ty = gy - y0;
  const a = h[y0 * gw + x0]! * (1 - tx) + h[y0 * gw + x1]! * tx;
  const b = h[y1 * gw + x0]! * (1 - tx) + h[y1 * gw + x1]! * tx;
  return a * (1 - ty) + b * ty;
}

function halfGeometry(m: Manifest, h: Uint16Array, segX: number, segY: number): THREE.BufferGeometry {
  const W = m.canvas.w * m.metersPerPx;
  const H = m.canvas.h * m.metersPerPx;
  const geo = new THREE.PlaneGeometry(W, H, segX, segY);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const k = m.metersPerPx / m.grid.heightScale;
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    const z = sample(h, m.grid.w, m.grid.h, u * (m.grid.w - 1), (1 - v) * (m.grid.h - 1)) * k;
    pos.setZ(i, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function sheenFor(color: string, fabric: string): THREE.Color {
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h, hsl.s * 0.6, Math.min(0.75, hsl.l + (fabric === "woven" ? 0.12 : 0.16)));
}

function material(
  maps: { albedo: THREE.Texture; normal: THREE.Texture; orm: THREE.Texture },
  v: Manifest["variants"][string],
  uniforms: GarmentAssets["uniforms"],
): THREE.MeshPhysicalMaterial {
  const woven = v.fabric === "woven";
  const mat = new THREE.MeshPhysicalMaterial({
    map: maps.albedo,
    normalMap: maps.normal,
    normalScale: new THREE.Vector2(1.15, 1.15),
    aoMap: maps.orm,
    aoMapIntensity: 1,
    roughnessMap: maps.orm,
    metalnessMap: maps.orm,
    roughness: 1,
    metalness: 1,
    sheen: woven ? 0.25 : 0.45,
    sheenRoughness: woven ? 0.35 : 0.5,
    sheenColor: sheenFor(v.color, v.fabric),
    clearcoat: woven ? 0.18 : 0,
    clearcoatRoughness: 0.55,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    envMapIntensity: 0.4,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uFlutter = uniforms.uFlutter;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uFlutter;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        // cloth flutter: hems and sleeves move a little, as if lifted by warm air
        float lowW = 1.0 - smoothstep(-0.42, -0.05, position.y);
        float sideW = smoothstep(0.2, 0.36, abs(position.x));
        float w = clamp(lowW + sideW * 0.7, 0.0, 1.0);
        float f = sin(uTime * 2.1 + position.y * 11.0 + position.x * 6.0) * 0.6 + sin(uTime * 3.3 - position.x * 13.0) * 0.4;
        transformed += objectNormal * f * w * uFlutter;`,
      );
    // Inside of the garment (seen through the neck and hem) is darker.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      if (!gl_FrontFacing) diffuseColor.rgb *= 0.32;`,
    );
  };
  mat.customProgramCacheKey = () => "aha-garment";
  return mat;
}

const cache = new Map<string, Promise<GarmentAssets>>();

export function loadGarment(variant: string, quality: Quality, maxAniso: number): Promise<GarmentAssets> {
  const key = `${variant}:${quality}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const m = await loadManifest();
      const v = m.variants[variant];
      if (!v) throw new Error(`No 3D maps for ${variant}`);
      const sm = quality === "low";
      const segX = sm ? 110 : 176;
      const segY = Math.round((segX * m.canvas.h) / m.canvas.w);
      const uniforms = { uTime: { value: 0 }, uFlutter: { value: 0.0035 } };
      const half = async (view: "front" | "back"): Promise<HalfAssets> => {
        const f = v.views[view];
        const [albedo, normal, orm, h] = await Promise.all([
          tex(sm ? f.albedoSm : f.albedo, true, maxAniso),
          tex(sm ? f.normalSm : f.normal, false, maxAniso),
          tex(sm ? f.ormSm : f.orm, false, maxAniso),
          heights(f.height),
        ]);
        const geometry = halfGeometry(m, h, segX, segY);
        if (view === "back") geometry.rotateY(Math.PI);
        return { geometry, material: material({ albedo, normal, orm }, v, uniforms) };
      };
      const [front, back] = await Promise.all([half("front"), half("back")]);
      return { variant, heroView: v.heroView, front, back, width: m.canvas.w * m.metersPerPx, height: m.canvas.h * m.metersPerPx, uniforms };
    })();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

export function webgl2Available(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2"));
  } catch {
    return false;
  }
}

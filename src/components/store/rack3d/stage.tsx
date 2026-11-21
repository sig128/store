"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { loadGarment, type GarmentAssets, type Quality } from "./assets";

RectAreaLightUniformsLib.init();

/**
 * The Rack in 3D: one floating garment under a thin linear LED, in a dark room
 * with a polished concrete floor. Scroll picks the garment and turns it; the LED
 * cuts out between pieces and strikes back on for the next one.
 */
export interface RackStageState {
  active: number;
  /** 0..1 progress through the active piece's scroll segment */
  t: number;
}

export interface RackStageProps {
  items: { variant: string }[];
  stateRef: RefObject<RackStageState>;
  quality: Quality;
  reducedMotion: boolean;
  running: boolean;
  onReady?: () => void;
}

/* Scene layout (metres). Floor y = 0, wall behind, LED above and slightly in front. */
const GARMENT_Y = 0.84;
const LED_POS = new THREE.Vector3(0, 1.36, 0.24);
const LED_AIM = new THREE.Vector3(0, 0.66, -0.1);
const LED_LEN = 0.92;
const WALL_Z = -1.45;
const CAM_BASE = new THREE.Vector3(0, 1.0, 2.25);
const CAM_LOOK = new THREE.Vector3(0, 0.75, 0);
const TUNE: Record<string, number> = { main: 250, up: 55, bounce: 3.5, emissive: 9, kicker: 30, bloom: 0.55, wide: 0.08, fill: 0.02, haze: 0.06, streak: 0.28, radius: 0.42, threshold: 7, pool: 0.14, wash: 0.045 };
const OFF = new Set<string>();
if (typeof window !== "undefined") {
  const q = new URLSearchParams(window.location.search);
  for (const k of Object.keys(TUNE)) if (q.has(k)) TUNE[k] = Number(q.get(k));
  for (const k of (q.get("off") ?? "").split(",")) if (k) OFF.add(k);
}

declare global {
  interface Window {
    /** Deterministic clock for frame-by-frame capture (seconds). */
    __ahaTime?: number;
    /** Frames rendered (capture tooling waits on this). */
    __ahaFrames?: number;
    /** Set before load by the video capture tool: render only when it calls __ahaAdvance. */
    __ahaCapture?: boolean;
    __ahaAdvance?: (time: number) => void;
    /** Garments loaded so far (capture tooling waits for all of them). */
    __ahaLoaded?: number;
  }
}
const CAPTURE = typeof window !== "undefined" && window.__ahaCapture === true;
const clockOf = (s: { clock: THREE.Clock }) => (typeof window !== "undefined" && typeof window.__ahaTime === "number" ? window.__ahaTime : s.clock.elapsedTime);
const damp = THREE.MathUtils.damp;

/** LED driver strike: a couple of fast pulses, then full output. */
function strike(e: number): number {
  if (e < 0.05) return 0;
  if (e < 0.085) return 1;
  if (e < 0.16) return 0.06;
  if (e < 0.2) return 0.85;
  if (e < 0.27) return 0.18;
  if (e < 0.55) return 0.55 + ((e - 0.27) / 0.28) * 0.45;
  return 1;
}

interface Shared {
  level: number;
  shown: number;
  /** clock time the current piece appeared */
  spawn: number;
}

/* ───────────── LED fixture ───────────── */
function LedFixture({ shared }: { shared: RefObject<Shared> }) {
  const main = useRef<THREE.RectAreaLight>(null);
  const up = useRef<THREE.RectAreaLight>(null);
  const diffuser = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(TUNE.emissive!, TUNE.emissive!, TUNE.emissive! * 1.04), toneMapped: false }), []);
  const housing = useMemo(() => new THREE.MeshStandardMaterial({ color: "#2b2d30", metalness: 0.85, roughness: 0.38 }), []);
  const cable = useMemo(() => new THREE.MeshStandardMaterial({ color: "#6d7075", metalness: 0.9, roughness: 0.3 }), []);
  const cord = useMemo(() => new THREE.MeshStandardMaterial({ color: "#111", metalness: 0, roughness: 0.6 }), []);

  useLayoutEffect(() => {
    main.current?.lookAt(LED_AIM);
    up.current?.lookAt(new THREE.Vector3(0, 3.2, WALL_Z));
  }, []);

  useFrame(() => {
    const l = shared.current!.level;
    if (main.current) main.current.intensity = TUNE.main! * l;
    if (up.current) up.current.intensity = TUNE.up! * l;
    diffuser.color.setRGB(TUNE.emissive! * l + 0.015, TUNE.emissive! * l + 0.015, TUNE.emissive! * 1.04 * l + 0.017);
  });

  const cableLen = 4.2 - LED_POS.y;
  return (
    <group>
      <rectAreaLight ref={main} position={LED_POS} width={LED_LEN - 0.02} height={0.026} color="#eef4ff" intensity={0} />
      <rectAreaLight ref={up} position={[LED_POS.x, LED_POS.y + 0.03, LED_POS.z - 0.02]} width={LED_LEN - 0.02} height={0.03} color="#e6eeff" intensity={0} />
      {/* fixture: aluminium channel with a frosted LED tube clipped underneath (visible from any angle) */}
      <group position={LED_POS}>
        <mesh material={housing} position={[0, 0.016, 0]}>
          <boxGeometry args={[LED_LEN + 0.03, 0.014, 0.03]} />
        </mesh>
        <mesh material={diffuser} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.0062, 0.0062, LED_LEN, 20, 1, true]} />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s}>
            {/* end caps and clips */}
            <mesh material={housing} position={[s * (LED_LEN / 2 + 0.006), 0, 0]} rotation-z={Math.PI / 2}>
              <cylinderGeometry args={[0.0078, 0.0078, 0.014, 16]} />
            </mesh>
            <mesh material={housing} position={[s * 0.42, 0.006, 0]}>
              <boxGeometry args={[0.012, 0.022, 0.024]} />
            </mesh>
          </group>
        ))}
      </group>
      {/* suspension wires + power cord */}
      {[-0.48, 0.48].map((x) => (
        <mesh key={x} material={cable} position={[x, LED_POS.y + 0.018 + cableLen / 2, LED_POS.z - 0.012]}>
          <cylinderGeometry args={[0.0011, 0.0011, cableLen, 6]} />
        </mesh>
      ))}
      <mesh material={cord} position={[0.36, LED_POS.y + 0.018 + cableLen / 2, LED_POS.z - 0.02]}>
        <cylinderGeometry args={[0.0028, 0.0028, cableLen, 8]} />
      </mesh>
    </group>
  );
}

/* ───────────── dust in the light ───────────── */
function Dust({ count, shared }: { count: number; shared: RefObject<Shared> }) {
  const { gl } = useThree();
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    const s = new Float32Array(count);
    let seed = 1337;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (rnd() - 0.5) * 1.0;
      p[i * 3 + 1] = 0.15 + rnd() * 1.2;
      p[i * 3 + 2] = (rnd() - 0.5) * 1.0 - 0.15;
      s[i] = rnd();
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(s, 1));
    return g;
  }, [count]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uLevel: { value: 0 }, uScale: { value: 1 } },
        vertexShader: /* glsl */ `
          uniform float uTime; uniform float uLevel; uniform float uScale;
          attribute float aSeed; varying float vA;
          void main() {
            vec3 p = position;
            float sp = 0.012 + aSeed * 0.03;
            p.y = 0.15 + mod(p.y - 0.15 + uTime * sp, 1.2);
            p.x += sin(uTime * (0.21 + aSeed * 0.2) + aSeed * 31.0) * 0.06;
            p.z += cos(uTime * (0.17 + aSeed * 0.15) + aSeed * 17.0) * 0.06;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            float spread = mix(0.42, 0.3, clamp((p.y - 0.1) / 1.2, 0.0, 1.0));
            float beam = (1.0 - smoothstep(spread - 0.2, spread, abs(p.x))) * (1.0 - smoothstep(1.22, 1.33, p.y)) * smoothstep(-0.7, -0.2, p.z) * (1.0 - smoothstep(0.2, 0.62, p.z)) * (0.35 + 0.65 * smoothstep(0.2, 1.3, p.y));
            float tw = 0.55 + 0.45 * sin(uTime * (1.3 + aSeed * 2.0) + aSeed * 50.0);
            vA = beam * uLevel * (0.1 + 0.6 * fract(aSeed * 7.13)) * tw;
            gl_PointSize = uScale * (2.2 + aSeed * 4.5) / max(0.1, -mv.z);
          }`,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = (1.0 - smoothstep(0.05, 0.5, d)) * vA;
            gl_FragColor = vec4(vec3(1.25, 1.3, 1.38) * a, a);
          }`,
      }),
    [],
  );
  useFrame((s) => {
    mat.uniforms.uTime!.value = clockOf(s);
    mat.uniforms.uLevel!.value = shared.current!.level;
    mat.uniforms.uScale!.value = gl.getPixelRatio() * 1.4;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

/* ───────────── lens streak: what a camera sees when it looks at a bare LED ───────────── */
function Streak({ shared }: { shared: RefObject<Shared> }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uLevel: { value: 0 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv; uniform float uLevel;
          void main(){
            vec2 c = vUv - 0.5;
            float v = exp(-c.y * c.y * 5200.0);
            float halo = exp(-c.y * c.y * 260.0) * exp(-c.x * c.x * 9.0);
            float h = exp(-abs(c.x) * 2.6);
            float a = clamp((v * h * 0.9 + halo * 0.06) * uLevel, 0.0, 4.0);
            gl_FragColor = vec4(vec3(0.72, 0.84, 1.0) * a, clamp(a, 0.0, 1.0));
          }`,
      }),
    [],
  );
  useFrame((s) => {
    mat.uniforms.uLevel!.value = shared.current!.level * TUNE.streak!;
    ref.current?.quaternion.copy(s.camera.quaternion);
  });
  return (
    <mesh ref={ref} material={mat} position={[LED_POS.x, LED_POS.y, LED_POS.z + 0.04]} renderOrder={10} frustumCulled={false}>
      <planeGeometry args={[3.4, 0.5]} />
    </mesh>
  );
}

/* ───────────── a soft haze in the light's path ───────────── */
function Haze({ shared }: { shared: RefObject<Shared> }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uLevel: { value: 0 }, uTime: { value: 0 }, uHaze: { value: TUNE.haze } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv; uniform float uLevel; uniform float uTime; uniform float uHaze;
          void main(){
            float y = vUv.y;                       // 1 at the LED, 0 at the floor
            float spread = mix(0.62, 0.36, y);     // the beam widens toward the floor
            float x = abs(vUv.x - 0.5);
            float a = (1.0 - smoothstep(spread - 0.22, spread, x)) * y * y * uHaze;
            a *= 0.85 + 0.15 * sin(vUv.x * 23.0 + uTime * 0.3) * sin(vUv.y * 17.0 - uTime * 0.2);
            a = clamp(a * uLevel, 0.0, 1.0);
            gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * a, a);
          }`,
      }),
    [],
  );
  useFrame((s) => {
    mat.uniforms.uLevel!.value = shared.current!.level;
    mat.uniforms.uTime!.value = clockOf(s);
  });
  // a vertical card under the LED, between the light and the garment
  return (
    <mesh material={mat} position={[0, (LED_POS.y - 0.02) / 2, LED_POS.z - 0.2]} renderOrder={2}>
      <planeGeometry args={[2.1, LED_POS.y - 0.02]} />
    </mesh>
  );
}

/* ───────────── room ───────────── */
function Room({ quality }: { quality: Quality }) {
  const [wallMap, floorRough] = useMemo(() => {
    const load = (rx: number, ry: number, srgb: boolean) =>
      new THREE.TextureLoader().load("/textures/concrete.webp", (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(rx, ry);
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.needsUpdate = true;
      });
    return [load(3.2, 1.6, true), load(4, 4, false)] as const;
  }, []);
  const coveAlpha = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, "#000");
    grad.addColorStop(1, "#fff");
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 64);
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    <group>
      <mesh position={[0, 2.4, WALL_Z]}>
        <planeGeometry args={[12, 4.8]} />
        <meshStandardMaterial map={wallMap} color="#2c2e31" roughness={0.97} metalness={0} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#1e1f22" roughness={0.5} roughnessMap={floorRough} metalness={0.05} />
      </mesh>
      {/* cove shadow where floor meets wall */}
      <mesh position={[0, 0.25, WALL_Z + 0.01]}>
        <planeGeometry args={[12, 0.5]} />
        <meshBasicMaterial color="#000" transparent opacity={0.55} alphaMap={coveAlpha} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ───────────── the pool of light the tube throws on the floor ───────────── */
/** Additive light decal: a radial falloff that reaches zero at every edge of its plane. */
function useLightDecal(stops: [number, number][], color: THREE.Color) {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    for (const [at, a] of stops) grad.addColorStop(at, `rgba(255,255,255,${a})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    return new THREE.MeshBasicMaterial({ map: t, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Light pooling on the floor under the LED. */
function FloorPool({ shared }: { shared: RefObject<Shared> }) {
  const mat = useLightDecal([[0, 1], [0.25, 0.6], [0.55, 0.14], [1, 0]], new THREE.Color(0.55, 0.6, 0.68));
  useFrame(() => {
    mat.opacity = shared.current!.level * TUNE.pool!;
  });
  return (
    <mesh material={mat} rotation-x={-Math.PI / 2} position={[0, 0.001, LED_POS.z - 0.25]}>
      <planeGeometry args={[2.0, 1.1]} />
    </mesh>
  );
}

/** Soft spill on the back wall, so the dark garment reads against the room. */
function WallWash({ shared }: { shared: RefObject<Shared> }) {
  const mat = useLightDecal([[0, 1], [0.3, 0.55], [0.65, 0.14], [1, 0]], new THREE.Color(0.6, 0.66, 0.76));
  useFrame(() => {
    mat.opacity = shared.current!.level * TUNE.wash!;
  });
  return (
    <mesh material={mat} position={[0, 1.15, WALL_Z + 0.02]}>
      <planeGeometry args={[4.4, 2.6]} />
    </mesh>
  );
}

/* ───────────── garment ───────────── */
function Garment({ assets, stateRef, reducedMotion, spawnAt }: { assets: GarmentAssets; stateRef: RefObject<RackStageState>; reducedMotion: boolean; spawnAt: number }) {
  const group = useRef<THREE.Group>(null);
  const hero = assets.heroView === "back" ? Math.PI : 0;
  const first = useRef(true);
  useFrame((s, dt) => {
    const g = group.current;
    if (!g) return;
    const time = clockOf(s);
    const sc = stateRef.current!;
    const since = Math.max(0, time - spawnAt);
    const turn = reducedMotion ? hero - 0.32 : hero + (Math.min(1, Math.max(0, sc.t)) - 0.42) * 1.3 + Math.sin(time * 0.37) * 0.1;
    const bob = reducedMotion ? 0 : Math.sin(time * 1.15) * 0.022 + Math.sin(time * 2.3 + 1.1) * 0.007;
    // rises a little into the light when it appears
    const rise = reducedMotion ? 0 : (1 - Math.min(1, since / 0.9)) ** 3 * -0.05;
    if (first.current || reducedMotion || typeof window.__ahaTime === "number") {
      g.rotation.y = turn;
      first.current = false;
    } else {
      g.rotation.y = damp(g.rotation.y, turn, 3.2, dt);
    }
    g.position.y = GARMENT_Y + bob + rise;
    g.rotation.x = reducedMotion ? 0 : Math.sin(time * 0.71) * 0.022;
    g.rotation.z = reducedMotion ? 0 : Math.sin(time * 0.93 + 0.5) * 0.016;
    assets.uniforms.uTime.value = time;
    assets.uniforms.uFlutter.value = reducedMotion ? 0 : 0.0032;
  });
  return (
    <group ref={group} position={[0, GARMENT_Y, 0]}>
      <mesh geometry={assets.front.geometry} material={assets.front.material} />
      <mesh geometry={assets.back.geometry} material={assets.back.material} />
    </group>
  );
}

/** Frame-by-frame video capture: the tool sets the clock and renders exactly one frame per call. */
function CaptureHook() {
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    window.__ahaAdvance = (time) => advance(time, true);
    return () => {
      delete window.__ahaAdvance;
    };
  }, [advance]);
  return null;
}

/* ───────────── director: picks the garment, runs the light ───────────── */
function Director({ items, stateRef, quality, reducedMotion, onReady, shared }: Omit<RackStageProps, "running"> & { shared: RefObject<Shared> }) {
  const [shown, setShown] = useState<{ index: number; assets: GarmentAssets; at: number } | null>(null);
  const loaded = useRef(new Map<number, GarmentAssets>());
  const requested = useRef(new Set<number>());
  const phase = useRef<{ kind: "idle" | "off" | "on"; start: number }>({ kind: "idle", start: 0 });
  const readyFrames = useRef(-1);
  const { gl, invalidate } = useThree();
  const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy());

  const request = (i: number) => {
    if (i < 0 || i >= items.length || requested.current.has(i)) return;
    requested.current.add(i);
    loadGarment(items[i]!.variant, quality, aniso)
      .then((a) => {
        loaded.current.set(i, a);
        if (CAPTURE) window.__ahaLoaded = loaded.current.size;
        invalidate();
      })
      .catch(() => requested.current.delete(i));
  };

  // Once a piece is committed, draw a few frames: in on-demand mode nothing else would
  // (the piece, its floor shadow and the ready signal all need them).
  useEffect(() => {
    if (shown) invalidate(3);
  }, [shown, invalidate]);

  // Reduced motion renders on demand: check a few times a second whether the piece changed.
  useEffect(() => {
    if (!reducedMotion) return;
    let last = Number.NaN;
    const id = window.setInterval(() => {
      const a = stateRef.current?.active ?? 0;
      if (a !== last) {
        last = a;
        invalidate();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [reducedMotion, invalidate, stateRef]);

  useFrame((s) => {
    const time = clockOf(s);
    window.__ahaFrames = (window.__ahaFrames ?? 0) + 1;
    const target = Math.min(items.length - 1, Math.max(0, stateRef.current!.active));
    request(target);
    request(target + 1);
    request(target - 1);
    if (typeof window.__ahaTime === "number") for (let i = 0; i < items.length; i++) request(i);
    const sh = shared.current!;
    const p = phase.current;

    if (reducedMotion) {
      const a = loaded.current.get(target);
      if (a && sh.shown !== target) {
        sh.shown = target;
        sh.spawn = time;
        setShown({ index: target, assets: a, at: time });
      }
      sh.level = 1;
    } else if (sh.shown !== target && p.kind !== "off") {
      // cut the light, then swap in the dark
      phase.current = { kind: "off", start: time };
    } else if (p.kind === "off") {
      const e = time - p.start;
      sh.level = Math.max(0, 1 - e / 0.09) * (sh.shown < 0 ? 0 : 1);
      const a = loaded.current.get(target);
      if (e > 0.16 && a) {
        sh.shown = target;
        sh.spawn = time;
        setShown({ index: target, assets: a, at: time });
        phase.current = { kind: "on", start: time };
      }
    } else if (p.kind === "on") {
      const e = time - p.start;
      sh.level = strike(e);
      if (e > 0.6) phase.current = { kind: "idle", start: time };
    } else {
      sh.level = 1;
    }

    if (shown && readyFrames.current < 0) readyFrames.current = 0;
    if (readyFrames.current >= 0 && readyFrames.current < 3) {
      readyFrames.current++;
      if (readyFrames.current === 3) onReady?.();
      else invalidate();
    }
  });

  return (
    <>
      <LedFixture shared={shared} />
      {OFF.has("room") ? null : <Room quality={quality} />}
      <FloorPool shared={shared} />
      {OFF.has("room") ? null : <WallWash shared={shared} />}
      {shown ? <Garment key={shown.index} assets={shown.assets} stateRef={stateRef} reducedMotion={reducedMotion} spawnAt={shown.at} /> : null}
      {OFF.has("dust") ? null : <Dust count={quality === "high" ? 90 : 45} shared={shared} />}
      {OFF.has("haze") ? null : <Haze shared={shared} />}
      {OFF.has("streak") ? null : <Streak shared={shared} />}
      <hemisphereLight args={["#1b2330", "#000000", TUNE.fill]} />
      {/* light bouncing back up off the floor pool onto the hem */}
      <rectAreaLight position={[0, 0.02, 0.15]} width={1.1} height={0.7} color="#9aa6b6" intensity={TUNE.bounce} onUpdate={(l) => l.lookAt(0, 1.2, 0)} />
      {/* cool kicker from behind-left so dark fabric separates from the dark room */}
      <rectAreaLight position={[-1.2, 1.0, -1.05]} width={0.05} height={1.2} color="#a9c8ff" intensity={TUNE.kicker} onUpdate={(l) => l.lookAt(0, GARMENT_Y, 0)} />
      {OFF.has("shadow") ? null : <ContactShadows key={reducedMotion ? `still-${shown?.index ?? -1}` : "live"} position={[0, 0.002, 0]} scale={[2.6, 2.6]} resolution={quality === "high" ? 512 : 256} blur={2.8} far={1.3} opacity={0.62} color="#000000" frames={reducedMotion ? 2 : Infinity} />}
    </>
  );
}

function CameraRig({ reducedMotion, shared }: { reducedMotion: boolean; shared: RefObject<Shared> }) {
  const { camera, pointer } = useThree();
  useFrame((s, dt) => {
    const time = clockOf(s);
    const tx = reducedMotion ? 0 : pointer.x * 0.14 + Math.sin(time * 0.2) * 0.03;
    const ty = reducedMotion ? 0 : pointer.y * 0.06;
    // a slow push-in each time a piece lights up
    const since = time - shared.current!.spawn;
    const push = reducedMotion || shared.current!.shown < 0 ? 0 : 0.22 * (1 - Math.min(1, Math.max(0, since) / 2.4)) ** 3;
    const k = typeof window.__ahaTime === "number" ? 1 : Math.min(1, dt * 2.2);
    camera.position.x += (CAM_BASE.x + tx - camera.position.x) * k;
    camera.position.y += (CAM_BASE.y + ty - camera.position.y) * k;
    camera.position.z = CAM_BASE.z + push;
    camera.lookAt(CAM_LOOK);
  });
  return null;
}

export default function RackStage({ items, stateRef, quality, reducedMotion, running, onReady }: RackStageProps) {
  const shared = useRef<Shared>({ level: 0, shown: -1, spawn: 0 });
  return (
    <Canvas
      flat
      dpr={quality === "high" ? [1, 1.75] : [1, 1.5]}
      gl={{ antialias: false, alpha: false, stencil: false, powerPreference: "high-performance" }}
      camera={{ position: CAM_BASE.toArray(), fov: 38, near: 0.05, far: 30 }}
      frameloop={CAPTURE ? "never" : running ? (reducedMotion ? "demand" : "always") : "never"}
      onCreated={({ camera }) => camera.lookAt(CAM_LOOK)}
      aria-hidden
    >
      <color attach="background" args={["#050606"]} />
      <fog attach="fog" args={["#050606", 3.6, 9]} />
      {CAPTURE ? <CaptureHook /> : null}
      <CameraRig reducedMotion={reducedMotion} shared={shared} />
      <Director items={items} stateRef={stateRef} quality={quality} reducedMotion={reducedMotion} onReady={onReady} shared={shared} />
      {OFF.has("post") ? null : <EffectComposer multisampling={quality === "high" ? 4 : 0} enableNormalPass={false}>
        {/* two layers of glare: a tight glow on the tube and a faint veil, like a real lens */}
        <Bloom mipmapBlur intensity={TUNE.bloom} luminanceThreshold={TUNE.threshold} luminanceSmoothing={0.2} radius={TUNE.radius} levels={4} />
        <Bloom mipmapBlur intensity={TUNE.wide} luminanceThreshold={TUNE.threshold} luminanceSmoothing={0.2} radius={0.85} levels={quality === "high" ? 8 : 6} />
        {/* vignette in HDR, before tone mapping, so it darkens the room but never greys the tube */}
        <Vignette offset={0.3} darkness={0.75} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Noise opacity={0.06} premultiply />
      </EffectComposer>}
    </Canvas>
  );
}

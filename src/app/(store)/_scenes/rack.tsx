"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RackStageState } from "@/components/store/rack3d/stage";
import { formatMoney } from "@/lib/money";
import type { ProductView } from "@/server/catalog";
import { ConceptTag } from "@/components/store/primitives";
import { useStore } from "@/components/store/store-context";

const RackStage = dynamic(() => import("@/components/store/rack3d/stage"), { ssr: false });

const ORDER = ["tee", "stringer", "singlet", "hoodie", "shorts", "jacket"];

/** Probe WebGL2 once per page and release the probe context straight away. */
let webgl2Probe: boolean | null = null;
function hasWebgl2(): boolean {
  if (webgl2Probe !== null) return webgl2Probe;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    webgl2Probe = Boolean(gl);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl2Probe = false;
  }
  return webgl2Probe;
}

/** WebGL2 + not opted out (?flat=1) → the 3D rack; otherwise the 2D renders stay. */
function use3d(): { ok: boolean; quality: "high" | "low"; reduced: boolean } {
  const [state, setState] = useState({ ok: false, quality: "low" as "high" | "low", reduced: false });
  useEffect(() => {
    const ok = !new URLSearchParams(window.location.search).has("flat") && hasWebgl2();
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    const cores = navigator.hardwareConcurrency ?? 4;
    setState({ ok, quality: wide && cores >= 4 ? "high" : "low", reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches });
  }, []);
  return state;
}

/** Mount when near the viewport; run (render frames) only while on screen. */
function useNearAndVisible(ref: React.RefObject<HTMLElement | null>, margin = "600px") {
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setNear(true), { rootMargin: margin });
    const b = new IntersectionObserver((e) => setVisible(e.some((x) => x.isIntersecting)), { rootMargin: "80px" });
    a.observe(el);
    b.observe(el);
    return () => {
      a.disconnect();
      b.disconnect();
    };
  }, [ref, margin]);
  return { near, visible };
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function itemFor(p: ProductView) {
  const v = p.variants[0]!;
  const lit = v.media.find((m) => m.kind === p.heroView) ?? v.media.find((m) => m.kind === "front");
  const dark = v.media.find((m) => m.kind === `${p.heroView}_unlit`);
  return { product: p, variant: v, lit, dark };
}

/**
 * 02 / THE RACK — each garment floats under one thin LED tube in a dark room
 * (WebGL, see components/store/rack3d). Desktop: a sticky stage driven by native
 * scroll with a visible index; the light cuts out between pieces and strikes back
 * on. Mobile: full-width sections; only the piece in view runs in 3D. Without
 * WebGL2 the 2D renders (with the light sweep) remain. No scroll hijacking.
 */
export function Rack({ products }: { products: ProductView[] }) {
  const items = useMemo(
    () => [...products].sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category)).map(itemFor),
    [products],
  );
  return (
    <section id="the-rack" aria-labelledby="rack-title" className="relative">
      <h2 id="rack-title" className="sr-only">
        The rack: Drop 01, six pieces
      </h2>
      <RackDesktop items={items} />
      <RackMobile items={items} />
    </section>
  );
}

type Item = ReturnType<typeof itemFor>;

function RackDesktop({ items }: { items: Item[] }) {
  const { openQuickShop } = useStore();
  const sectionRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const n = items.length;
  const three = use3d();
  const stageState = useRef<RackStageState>({ active: 0, t: 0 });
  const { near, visible } = useNearAndVisible(sectionRef);
  const [ready3d, setReady3d] = useState(false);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const show3d = three.ok && wide && near;
  const stageItems = useMemo(() => items.map((it) => ({ variant: it.variant.code })), [items]);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    const update = () => {
      raf = 0;
      if (window.innerWidth < 1024) return;
      const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 60;
      const rect = section.getBoundingClientRect();
      const total = rect.height - (window.innerHeight - header);
      const p = Math.min(0.9999, Math.max(0, (header - rect.top) / Math.max(1, total)));
      const pos = p * n;
      const i = Math.min(n - 1, Math.floor(pos));
      const t = pos - i;
      stage.style.setProperty("--reveal", reduced.matches ? "1" : smooth(0.06, 0.6, t).toFixed(4));
      stageState.current = { active: i, t };
      setActive((prev) => (prev === i ? prev : i));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    reduced.addEventListener("change", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      reduced.removeEventListener("change", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [n]);

  const jump = (i: number) => {
    const section = sectionRef.current;
    if (!section) return;
    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 60;
    const top = section.getBoundingClientRect().top + window.scrollY;
    const total = section.offsetHeight - (window.innerHeight - header);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: top - header + ((i + 0.72) / n) * total, behavior: reduced ? "auto" : "smooth" });
  };

  const cur = items[active]!;
  const sizesInStock = cur.variant.skus.filter((s) => s.state !== "sold_out").map((s) => s.size);

  return (
    <div ref={sectionRef} className="relative hidden lg:block" style={{ height: `${n * 62 + 38}vh` }}>
      <div ref={stageRef} className="sticky top-[var(--header-h)] h-[calc(100vh-var(--header-h))] overflow-hidden border-b border-rule">
        <div className="shell grid h-full grid-cols-[minmax(200px,1fr)_minmax(0,2.1fr)_minmax(260px,1.15fr)] gap-10 py-8">
          {/* index */}
          <nav aria-label="The rack index" className="flex flex-col justify-between">
            <div>
              <p className="eyebrow">02 / The rack</p>
              <p className="mt-3 max-w-[22ch] text-sm text-bone-dim">Six pieces, one light. Scroll to switch pieces and turn them; move the pointer to look around.</p>
            </div>
            <ol className="space-y-1">
              {items.map((it, i) => (
                <li key={it.product.id}>
                  <button
                    type="button"
                    onClick={() => jump(i)}
                    aria-current={i === active ? "true" : undefined}
                    className={`group flex w-full items-baseline gap-3 border-l-2 py-1.5 pl-3 text-left transition-colors ${i === active ? "border-fluoro text-bone" : "border-transparent text-bone-mute hover:text-bone-dim"}`}
                  >
                    <span className="mono text-[11px]">{String(i + 1).padStart(2, "0")}</span>
                    <span className="font-display text-[26px] font-extrabold uppercase leading-none">{it.product.name}</span>
                  </button>
                </li>
              ))}
            </ol>
            <p className="mono text-[11px] text-bone-mute">01:13 — LIGHTS ON</p>
          </nav>

          {/* stage */}
          <div className="stage-wall relative overflow-hidden border border-rule">
            <div className={`absolute inset-0 transition-opacity duration-700 ${ready3d ? "opacity-0" : "opacity-100"}`}>
            <div className="fluoro-tube absolute left-1/2 top-5 h-[5px] w-[46%] -translate-x-1/2 rounded-full" aria-hidden />
            <div className="absolute inset-x-0 bottom-0 h-[16%] bg-gradient-to-t from-black/60 to-transparent" aria-hidden />
            <div className="absolute bottom-[7%] left-1/2 h-[5%] w-[44%] -translate-x-1/2 rounded-[50%] bg-black/70 blur-xl" aria-hidden />
            <div className="absolute inset-x-0 bottom-[4%] top-[9%]">
              {items.map((it, i) => (
                <div
                  key={it.product.id}
                  className="absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none"
                  style={{ opacity: i === active ? 1 : 0 }}
                  aria-hidden={i !== active}
                >
                  <div className="relative mx-auto h-full max-w-full" style={{ aspectRatio: "4 / 5" }}>
                    {it.dark ? <Image src={it.dark.url} alt="" fill sizes="(min-width: 1024px) 40vw, 1px" className="object-contain" loading={i < 2 ? "eager" : "lazy"} /> : null}
                    {it.lit ? (
                      <div className="reveal-lit absolute inset-0">
                        <Image src={it.lit.url} alt={it.lit.alt} fill sizes="(min-width: 1024px) 40vw, 1px" className="object-contain" loading={i < 2 ? "eager" : "lazy"} />
                      </div>
                    ) : null}
                    <div className="light-sweep pointer-events-none absolute inset-x-[6%] h-[3px] rounded-full" style={{ top: "calc(var(--reveal, 1) * 100%)", opacity: "calc((1 - var(--reveal, 1)) * 1.4)" }} aria-hidden />
                  </div>
                </div>
              ))}
            </div>
            </div>
            {show3d ? (
              <div className={`absolute inset-0 transition-opacity duration-700 ${ready3d ? "opacity-100" : "opacity-0"}`} aria-hidden>
                <RackStage items={stageItems} stateRef={stageState} quality={three.quality} reducedMotion={three.reduced} running={visible} onReady={() => setReady3d(true)} />
              </div>
            ) : null}
            <ConceptTag className="absolute bottom-4 left-4" />
            <p className="mono absolute bottom-4 right-4 text-[11px] text-bone-dim">
              {String(active + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
            </p>
          </div>

          {/* info */}
          <div className="flex flex-col justify-center" key={cur.product.id}>
            <p className="eyebrow">{cur.product.categoryLabel}</p>
            <h3 className="display mt-3 text-[clamp(64px,7vw,120px)]">{cur.product.name}</h3>
            <p className="num mt-4 text-2xl font-semibold">{formatMoney(cur.product.fromPriceMinor, cur.product.currency)}</p>
            {cur.product.summary ? <p className="mt-4 max-w-[38ch] text-bone-dim">{cur.product.summary}</p> : null}
            <p className="mt-4 text-sm text-bone-dim">
              {cur.product.fulfillmentMode === "made_to_order"
                ? "Made to order"
                : sizesInStock.length
                  ? `In stock: ${sizesInStock.join(" · ")}`
                  : "Sold out"}
              {" · "}
              {cur.product.variants.length} colour{cur.product.variants.length === 1 ? "" : "s"}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" className="btn btn-primary" onClick={() => openQuickShop({ product: cur.product, variantId: cur.variant.id })}>
                Quick shop
              </button>
              <Link href={`/products/${cur.product.slug}`} className="btn btn-ghost">
                Details
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RackMobile({ items }: { items: Item[] }) {
  const { openQuickShop } = useStore();
  const three = use3d();
  const [live, setLive] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!three.ok) return;
    const els = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-rack-item]") ?? []);
    const ratios = new Map<number, number>();
    let timer = 0;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) ratios.set(Number((e.target as HTMLElement).dataset.rackItem), e.isIntersecting ? e.intersectionRatio : 0);
        let best: number | null = null;
        let bestR = 0.35;
        for (const [i, r] of ratios) if (r > bestR) (best = i), (bestR = r);
        window.clearTimeout(timer);
        // wait for the scroll to settle so fast flicks don't spin up WebGL for every piece
        timer = window.setTimeout(() => setLive(best), 220);
      },
      { threshold: [0, 0.35, 0.6, 0.85, 1] },
    );
    els.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, [three.ok]);
  return (
    <div className="lg:hidden" ref={listRef}>
      <div className="shell flex items-baseline justify-between py-6">
        <p className="eyebrow">02 / The rack</p>
        <p className="mono text-[11px] text-bone-mute">{items.length} pieces</p>
      </div>
      {items.map((it, i) => (
        <MobileItem
          key={it.product.id}
          item={it}
          index={i}
          total={items.length}
          live={three.ok && live === i}
          quality={three.quality}
          reduced={three.reduced}
          onQuickShop={() => openQuickShop({ product: it.product, variantId: it.variant.id })}
        />
      ))}
    </div>
  );
}

function MobileItem({
  item,
  index,
  total,
  live,
  quality,
  reduced,
  onQuickShop,
}: {
  item: Item;
  index: number;
  total: number;
  live: boolean;
  quality: "high" | "low";
  reduced: boolean;
  onQuickShop: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [lit, setLit] = useState<boolean | null>(null);
  const [ready3d, setReady3d] = useState(false);
  const stageState = useRef<RackStageState>({ active: 0, t: 0.45 });
  const stageItems = useMemo(() => [{ variant: item.variant.code }], [item.variant.code]);
  useEffect(() => {
    if (!live) {
      setReady3d(false);
      return;
    }
    // the piece turns as it travels up the screen
    const onScroll = () => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const p = 1 - (r.top + r.height / 2) / (window.innerHeight + r.height / 2);
      stageState.current = { active: 0, t: Math.min(1, Math.max(0, p)) };
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [live]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLit(true);
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.6) {
      setLit(true);
      return;
    }
    setLit(false);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLit(true);
          io.disconnect();
        }
      },
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const p = item.product;
  return (
    <article ref={ref} id={`rack-${p.slug}`} data-rack-item={index} className="rack-mobile-item border-t border-rule" style={{ ["--reveal" as string]: lit === false ? 0 : 1 }}>
      <div className="stage-wall relative">
        <div className={`fluoro-tube absolute left-1/2 top-3 h-[4px] w-1/2 -translate-x-1/2 rounded-full transition-opacity duration-500 ${ready3d ? "opacity-0" : ""}`} aria-hidden />
        <div className="relative mx-auto aspect-[4/5] w-full max-w-[520px]">
          {item.dark ? <Image src={item.dark.url} alt="" fill sizes="(max-width: 1023px) 100vw, 1px" className="object-contain" loading={index === 0 ? "eager" : "lazy"} /> : null}
          {item.lit ? (
            <div className="reveal-lit absolute inset-0">
              <Image src={item.lit.url} alt={item.lit.alt} fill sizes="(max-width: 1023px) 100vw, 1px" className="object-contain" loading={index === 0 ? "eager" : "lazy"} />
            </div>
          ) : null}
        </div>
        {live ? (
          <div className={`absolute inset-0 transition-opacity duration-500 ${ready3d ? "opacity-100" : "opacity-0"}`} aria-hidden>
            <RackStage items={stageItems} stateRef={stageState} quality={quality} reducedMotion={reduced} running onReady={() => setReady3d(true)} />
          </div>
        ) : null}
        <ConceptTag className="absolute bottom-3 left-3" />
        <p className="mono absolute bottom-3 right-3 text-[11px] text-bone-dim">
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </p>
      </div>
      <div className="shell py-5">
        <p className="eyebrow">{p.categoryLabel}</p>
        <div className="mt-1 flex items-end justify-between gap-4">
          <h3 className="display text-[56px]">{p.name}</h3>
          <p className="num pb-1 text-lg font-semibold">{formatMoney(p.fromPriceMinor, p.currency)}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" className="btn btn-primary" onClick={onQuickShop}>
            Quick shop
          </button>
          <Link href={`/products/${p.slug}`} className="btn btn-ghost">
            Details
          </Link>
        </div>
      </div>
    </article>
  );
}

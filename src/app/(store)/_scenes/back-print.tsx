"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ProductView } from "@/server/catalog";
import { ConceptTag } from "@/components/store/primitives";
import { useStore } from "@/components/store/store-context";

type Tab = "front" | "back" | "detail";

/**
 * 03 / THE BACK PRINT — one print at full scale. Animates into the print once
 * when it first comes into view, then hands control to the visitor: Front / Back /
 * Print detail tabs and a zoom to inspect the ink.
 */
export function BackPrint({ product }: { product: ProductView }) {
  const { openQuickShop } = useStore();
  const variant = product.variants[0]!;
  const media = {
    front: variant.media.find((m) => m.kind === "front"),
    back: variant.media.find((m) => m.kind === "back"),
    detail: variant.media.find((m) => m.kind === "print_detail"),
  };
  const print = variant.prints.find((p) => p.placement.toLowerCase().includes("rear")) ?? variant.prints[0];
  const [tab, setTab] = useState<Tab>("back");
  const [intro, setIntro] = useState<"idle" | "zooming" | "done">("idle");
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIntro("done");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        setIntro("zooming");
        window.setTimeout(() => {
          setTab("detail");
          setIntro("done");
        }, 1500);
      },
      { threshold: 0.55 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: "front", label: "Front" },
    { id: "back", label: "Back" },
    { id: "detail", label: "Print detail" },
  ];
  const current = media[tab];

  return (
    <section aria-labelledby="backprint-title" className="border-b border-rule py-16 md:py-24">
      <div className="shell grid items-center gap-10 lg:grid-cols-[1.35fr_1fr] lg:gap-16">
        <div>
          <div role="tablist" aria-label="View" className="mb-4 flex gap-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`bp-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="bp-panel"
                className="chip min-h-10 text-[13px]"
                data-selected={tab === t.id}
                onClick={() => {
                  setTab(t.id);
                  setZoom(false);
                  setIntro("done");
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div
            ref={ref}
            id="bp-panel"
            role="tabpanel"
            aria-labelledby={`bp-tab-${tab}`}
            className="stage-wall relative aspect-square overflow-hidden border border-rule"
          >
            <div className="fluoro-tube absolute left-1/2 top-4 z-10 h-[4px] w-[40%] -translate-x-1/2 rounded-full" aria-hidden />
            {current ? (
              <div
                className={`absolute inset-0 ${tab === "detail" ? (zoom ? "cursor-zoom-out" : "cursor-zoom-in") : ""}`}
                onClick={() => tab === "detail" && setZoom((z) => !z)}
                onPointerMove={(e) => {
                  if (!zoom) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  setOrigin(`${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}% ${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
                }}
              >
                <div
                  className="absolute inset-0 transition-transform ease-[cubic-bezier(.3,.1,.2,1)] motion-reduce:transition-none"
                  style={{
                    transitionDuration: intro === "zooming" ? "1400ms" : "300ms",
                    transform: intro === "zooming" && tab === "back" ? "scale(1.85)" : zoom ? "scale(2.1)" : "scale(1)",
                    transformOrigin: intro === "zooming" ? "50% 44%" : zoom ? origin : "50% 50%",
                  }}
                >
                  <Image
                    key={current.id}
                    src={current.url}
                    alt={current.alt}
                    fill
                    sizes="(min-width: 1024px) 58vw, 100vw"
                    className={tab === "detail" ? "object-cover" : "object-contain p-[4%]"}
                    quality={85}
                  />
                </div>
              </div>
            ) : null}
            <ConceptTag className="absolute bottom-3 left-3 z-10" />
            {tab === "detail" ? (
              <button type="button" className="btn btn-ghost absolute bottom-3 right-3 z-10 min-h-9 bg-night/70 px-3 text-[11px]" onClick={() => setZoom((z) => !z)} aria-pressed={zoom}>
                {zoom ? "Zoom out" : "Zoom in"}
              </button>
            ) : null}
          </div>
        </div>
        <div>
          <p className="eyebrow">03 / The back print</p>
          <h2 id="backprint-title" className="display mt-3 text-[clamp(56px,7vw,112px)]">
            Night
            <br />
            Garage
          </h2>
          <p className="mt-6 max-w-[44ch] text-bone-dim">
            A roll-up door left half open after closing. A loaded rack inside, sodium light spilling across wet asphalt, two palms and a streetlight. Drawn for Drop 01 and printed big
            across the back of {product.name}.
          </p>
          <dl className="mt-6 grid max-w-sm grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-bone-mute">Artwork</dt>
            <dd className="mono">{print ? `${print.code} · v${print.version}` : "—"}</dd>
            <dt className="text-bone-mute">Placement</dt>
            <dd>{print?.placement ?? "Rear"}</dd>
            <dt className="text-bone-mute">Print method</dt>
            <dd>{print?.method ?? "Confirmed with our printer before launch"}</dd>
          </dl>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={() => openQuickShop({ product, variantId: variant.id })}>
              Quick shop {product.name}
            </button>
            <Link href={`/products/${product.slug}`} className="btn btn-ghost">
              Details
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

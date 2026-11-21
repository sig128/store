"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, useTransition } from "react";
import { addFitAction, previewFitAction, type FitPreview } from "@/app/(store)/actions";
import { formatMoney } from "@/lib/money";
import type { OutfitView } from "@/server/catalog";
import { ConceptTag, SizeChips } from "@/components/store/primitives";
import { useStore } from "@/components/store/store-context";

/**
 * 04 / BUILD THE FIT — styled flat-lays with real hotspots (each opens the exact
 * product + colour in quick shop) and a builder that adds the whole fit in one
 * action. Prices and any fit saving come from the server pricing engine; a sold-out
 * piece is simply left out and never blocks the others.
 */
export function BuildTheFit({ outfits, headingLevel = "h2", label = "04 / Build the fit" }: { outfits: OutfitView[]; headingLevel?: "h1" | "h2"; label?: string }) {
  const [active, setActive] = useState(0);
  const outfit = outfits[active];
  if (!outfit) return null;
  const H = headingLevel;
  return (
    <section id="build-the-fit" aria-labelledby="fit-title" className="border-b border-rule py-16 md:py-24">
      <div className="shell">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow">{label}</p>
            <H id="fit-title" className="display mt-3 text-[clamp(52px,7vw,104px)]">
              Build the fit
            </H>
          </div>
          <div role="tablist" aria-label="Outfits" className="flex flex-wrap gap-2">
            {outfits.map((o, i) => (
              <button key={o.id} role="tab" aria-selected={i === active} aria-controls="fit-panel" data-selected={i === active} className="chip min-h-10 text-[13px]" onClick={() => setActive(i)}>
                {o.title}
              </button>
            ))}
          </div>
        </div>
        <FitPanel key={outfit.id} outfit={outfit} />
      </div>
    </section>
  );
}

function FitPanel({ outfit }: { outfit: OutfitView }) {
  const { openQuickShop, setCart, openDrawer, announce, devMode } = useStore();
  const [sizes, setSizes] = useState<Record<string, string | null>>({});
  const [include, setInclude] = useState<Record<string, boolean>>(() => Object.fromEntries(outfit.items.map((i) => [i.id, true])));
  const [preview, setPreview] = useState<FitPreview | null>(null);
  const [results, setResults] = useState<{ label: string; ok: boolean; error?: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [openSpot, setOpenSpot] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      outfit.items.map((it) => {
        const variant = it.product.variants.find((v) => v.id === it.variantId) ?? it.product.variants[0]!;
        const skuId = sizes[it.id] ?? null;
        const sku = variant.skus.find((s) => s.id === skuId) ?? null;
        const soldOut = variant.skus.every((s) => s.state === "sold_out") || !it.product.purchasable;
        return { it, variant, sku, soldOut, img: variant.media.find((m) => m.kind === "front") ?? variant.media[0] };
      }),
    [outfit.items, sizes],
  );
  const chosen = rows.filter((r) => include[r.it.id] && !r.soldOut && r.sku && r.sku.state !== "sold_out");
  const chosenKey = chosen.map((r) => r.sku!.id).join(",");

  useEffect(() => {
    if (!chosenKey) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    previewFitAction({ outfitId: outfit.id, skuIds: chosenKey.split(",") }).then((r) => {
      if (!cancelled && r.ok) setPreview(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [chosenKey, outfit.id]);

  function addFit() {
    const missing = rows.filter((r) => include[r.it.id] && !r.soldOut && !r.sku);
    if (chosen.length === 0) {
      setError(missing.length ? "Choose a size for each piece you want." : "Pick at least one piece.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await addFitAction({ outfitId: outfit.id, skuIds: chosen.map((r) => r.sku!.id) });
      setCart(res.cart);
      const labelled = res.results.map((x) => {
        const row = chosen.find((r) => r.sku!.id === x.skuId)!;
        return { label: `${row.it.product.name} (${row.sku!.size})`, ok: x.ok, error: x.error };
      });
      setResults(labelled);
      const okCount = labelled.filter((l) => l.ok).length;
      announce(`${okCount} of ${labelled.length} pieces added to your bag.`);
      if (okCount > 0) openDrawer();
    });
  }

  const bundle = outfit.bundle;
  return (
    <div id="fit-panel" role="tabpanel" className="mt-10 grid gap-10 lg:grid-cols-[1.45fr_1fr]">
      <div className="relative self-start">
        {outfit.image ? (
          <div className="relative overflow-hidden border border-rule" style={{ aspectRatio: `${outfit.image.width} / ${outfit.image.height}` }}>
            <Image src={outfit.image.url} alt={outfit.image.alt} fill sizes="(min-width: 1024px) 58vw, 100vw" className="object-cover" />
            {outfit.items.map((it, i) => {
              const v = it.product.variants.find((x) => x.id === it.variantId);
              const tipId = `spot-${it.id}`;
              return (
                <div key={it.id} className="absolute" style={{ left: `${it.hotspotX / 100}%`, top: `${it.hotspotY / 100}%`, transform: "translate(-50%, -50%)" }}>
                  <button
                    type="button"
                    className="hotspot"
                    aria-describedby={tipId}
                    aria-label={`${it.product.name}, ${v?.label ?? ""} — open quick shop`}
                    onClick={() => openQuickShop({ product: it.product, variantId: it.variantId })}
                    onMouseEnter={() => setOpenSpot(it.id)}
                    onMouseLeave={() => setOpenSpot(null)}
                    onFocus={() => setOpenSpot(it.id)}
                    onBlur={() => setOpenSpot(null)}
                  >
                    {i + 1}
                  </button>
                  <span
                    id={tipId}
                    role="tooltip"
                    className={`pointer-events-none absolute left-1/2 top-[calc(100%+10px)] z-10 -translate-x-1/2 whitespace-nowrap border border-rule-strong bg-night/95 px-3 py-2 text-xs ${openSpot === it.id ? "block" : "hidden"}`}
                  >
                    <strong className="font-display text-base font-extrabold uppercase">{it.product.name}</strong>
                    <span className="ml-2 text-bone-dim">{v?.label}</span>
                    <span className="num ml-2">{formatMoney(it.product.fromPriceMinor, it.product.currency)}</span>
                  </span>
                </div>
              );
            })}
            <ConceptTag className="absolute bottom-3 left-3" />
          </div>
        ) : null}
        {outfit.subtitle ? <p className="mt-4 max-w-[60ch] text-bone-dim">{outfit.subtitle}</p> : null}
      </div>

      <div className="border border-rule bg-night-2">
        <div className="border-b border-rule p-5">
          <h3 className="display text-[34px]">{outfit.title}</h3>
          {bundle ? (
            <p className="mt-1 text-sm text-teal-bright">
              Take {bundle.minItems} or more pieces and save {bundle.bps / 100}% on them
              {devMode && !bundle.approved ? " (development pricing)" : ""}.
            </p>
          ) : null}
        </div>
        <ul className="divide-y divide-rule">
          {rows.map(({ it, variant, sku, soldOut, img }, i) => (
            <li key={it.id} className={`p-5 ${soldOut || !include[it.id] ? "opacity-70" : ""}`}>
              <div className="flex items-start gap-4">
                <span className="hotspot h-7 w-7 shrink-0 text-xs shadow-none">{i + 1}</span>
                <div className="relative h-20 w-16 shrink-0 bg-night-3">{img ? <Image src={img.url} alt="" fill sizes="64px" className="object-contain" /> : null}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-[22px] font-extrabold uppercase leading-none">{it.product.name}</p>
                      <p className="mt-1 text-sm text-bone-dim">{variant.label}</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[var(--bone)]"
                        checked={include[it.id] && !soldOut}
                        disabled={soldOut}
                        onChange={(e) => setInclude((x) => ({ ...x, [it.id]: e.target.checked }))}
                      />
                      <span className="sr-only">Include {it.product.name}</span>
                      <span aria-hidden>Include</span>
                    </label>
                  </div>
                  {soldOut ? (
                    <p className="mt-3 text-sm text-bone-dim">{it.product.purchasable ? "Sold out in this colour — the rest of the fit is still available." : it.product.notPurchasableReason}</p>
                  ) : include[it.id] ? (
                    <div className="mt-3">
                      <SizeChips
                        skus={variant.skus}
                        value={sku?.id ?? null}
                        onChange={(id) => setSizes((x) => ({ ...x, [it.id]: id }))}
                        name={`fit-${it.id}`}
                        error={sku?.state === "sold_out" ? `Size ${sku.size} is sold out — choose another or untick this piece.` : null}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="space-y-3 border-t border-rule p-5">
          {preview ? (
            <dl className="space-y-1 text-sm">
              {chosen.map((r) => {
                const line = preview.lines.find((l) => l.skuId === r.sku!.id);
                return (
                  <div key={r.it.id} className="flex justify-between">
                    <dt className="text-bone-dim">
                      {r.it.product.name} · {r.sku!.size}
                    </dt>
                    <dd className="num">{formatMoney(line?.priceMinor ?? r.sku!.priceMinor, preview.currency)}</dd>
                  </div>
                );
              })}
              {preview.savingMinor > 0 ? (
                <div className="flex justify-between text-teal-bright">
                  <dt>{preview.savingLabel ?? "Fit saving"}</dt>
                  <dd className="num">−{formatMoney(preview.savingMinor, preview.currency)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-rule pt-2 text-base font-semibold">
                <dt>Fit total</dt>
                <dd className="num">{formatMoney(preview.totalMinor, preview.currency)}</dd>
              </div>
              <p className="text-xs text-bone-mute">Before delivery. Final price is confirmed in your bag.</p>
            </dl>
          ) : (
            <p className="text-sm text-bone-dim">Choose sizes to see the fit total.</p>
          )}
          {error ? (
            <p className="text-sm text-error" role="alert">
              {error}
            </p>
          ) : null}
          {results ? (
            <ul className="space-y-1 text-sm" aria-live="polite">
              {results.map((r) => (
                <li key={r.label} className={r.ok ? "text-ok" : "text-error"}>
                  {r.ok ? "Added" : "Not added"}: {r.label}
                  {r.error ? ` — ${r.error}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          <button type="button" className="btn btn-primary w-full" onClick={addFit} disabled={pending} aria-busy={pending}>
            {pending ? "Adding…" : chosen.length ? `Add ${chosen.length} piece${chosen.length === 1 ? "" : "s"} to bag` : "Add the fit to bag"}
          </button>
        </div>
      </div>
    </div>
  );
}

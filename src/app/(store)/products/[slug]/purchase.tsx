"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addToCartAction, updateLineAction } from "@/app/(store)/actions";
import { formatMoney } from "@/lib/money";
import type { ProductDetailView } from "@/server/catalog";
import type { PersonalizationInput, ShippingMethodSnapshot } from "@/lib/types";
import { Sheet } from "@/components/ui/sheet";
import { SizeChips, Swatches } from "@/components/store/primitives";
import { SizeTable } from "@/components/store/size-table";
import { useStore } from "@/components/store/store-context";
import { Gallery } from "./gallery";
import { LockerTagEditor, tagErrors, type TagState } from "./locker-tag";

export function ProductExperience({
  product,
  initialVariantCode,
  rates,
  dispatchNote,
  edit,
}: {
  product: ProductDetailView;
  initialVariantCode: string | null;
  rates: ShippingMethodSnapshot[];
  dispatchNote: string;
  edit: { lineId: string; skuId: string; personalization: PersonalizationInput | null } | null;
}) {
  const { setCart, openDrawer, announce } = useStore();
  const initialVariant =
    (edit && product.variants.find((v) => v.skus.some((s) => s.id === edit.skuId))) ??
    product.variants.find((v) => v.code === initialVariantCode) ??
    product.variants.find((v) => v.anyAvailable) ??
    product.variants[0]!;
  const [variantId, setVariantId] = useState(initialVariant.id);
  const [skuId, setSkuId] = useState<string | null>(edit?.skuId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [showTagErrors, setShowTagErrors] = useState(false);
  const [guide, setGuide] = useState(false);
  const [pending, start] = useTransition();
  const p = product.personalization;
  const [tag, setTag] = useState<TagState>(() => ({
    enabled: Boolean(edit?.personalization),
    fields: edit?.personalization?.fields ?? {},
    colorId: edit?.personalization?.colorId ?? "",
    confirmed: false,
  }));
  const buyRef = useRef<HTMLButtonElement>(null);
  const [barVisible, setBarVisible] = useState(false);

  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0]!;
  const sku = variant.skus.find((s) => s.id === skuId) ?? null;
  const tagOn = Boolean(p && tag.enabled && variant.personalizationArea);
  const colorId = tag.colorId && variant.personalizationArea?.colorIds.includes(tag.colorId) ? tag.colorId : (variant.personalizationArea?.colorIds[0] ?? "");
  const errors = useMemo(() => (p && tagOn ? tagErrors(p, { ...tag, colorId }) : {}), [p, tagOn, tag, colorId]);
  const unit = sku?.priceMinor ?? variant.skus[0]?.priceMinor ?? product.fromPriceMinor;
  const total = unit + (tagOn && p ? p.priceMinor : 0);

  // Keep ?variant= in the URL so colour choices are shareable (no navigation, no scroll jump).
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("variant", variant.code);
    window.history.replaceState(null, "", url);
  }, [variant.code]);

  useEffect(() => {
    if (window.location.hash === "#size-guide") setGuide(true);
  }, []);

  // Mobile buy bar: only when the real purchase button is off-screen.
  useEffect(() => {
    const el = buyRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setBarVisible(!e!.isIntersecting && e!.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const chart = product.sizeChart.find((c) => c.variantId === variant.id) ?? product.sizeChart.find((c) => !c.variantId) ?? null;

  function submit() {
    if (!sku) {
      setError("Choose a size first.");
      document.getElementById("size-picker")?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (sku.state === "sold_out") {
      setError(`Size ${sku.size} is sold out in ${variant.label}. Choose another size or colour.`);
      return;
    }
    if (tagOn && Object.keys(errors).length) {
      setShowTagErrors(true);
      setError("Finish your Locker Tag (or untick it) before adding to bag.");
      return;
    }
    setError(null);
    const personalization: PersonalizationInput | null = tagOn ? { fields: tag.fields, colorId, spellingConfirmed: tag.confirmed } : null;
    start(async () => {
      const res = edit
        ? await updateLineAction({ lineId: edit.lineId, skuId: sku.id, personalization })
        : await addToCartAction({ skuId: sku.id, qty: 1, personalization });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCart(res.data);
      announce(`${product.name}, ${variant.label}, size ${sku.size} ${edit ? "updated in" : "added to"} your bag.`);
      openDrawer();
    });
  }

  const availability = !sku
    ? null
    : sku.state === "in_stock"
      ? "In stock — ready to ship"
      : sku.state === "made_to_order"
        ? product.leadTime
          ? `Made to order — ships ${product.leadTime.minDays}–${product.leadTime.maxDays} days after you order${product.leadTime.approved ? "" : " (development estimate)"}`
          : "Made to order — production time is confirmed before you pay"
        : `Sold out in ${sku.size}`;

  const est = rates.filter((r) => r.minDays != null && r.maxDays != null);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,1fr)] lg:gap-14">
      <Gallery media={variant.media} productName={product.name} />

      <div className="lg:sticky lg:top-[calc(var(--header-h)+24px)] lg:self-start">
        <p className="eyebrow">{product.categoryLabel}</p>
        <h1 className="display mt-2 text-[clamp(64px,8vw,120px)]">{product.name}</h1>
        <p className="num mt-3 text-2xl font-semibold" aria-live="polite">
          {formatMoney(total, product.currency)}
          {tagOn && p ? <span className="ml-2 text-sm font-normal text-bone-dim">incl. Locker Tag {formatMoney(p.priceMinor, product.currency)}</span> : null}
        </p>
        {product.summary ? <p className="mt-4 max-w-[48ch] text-bone-dim">{product.summary}</p> : null}

        <div className="mt-8 space-y-6">
          {product.variants.length > 1 ? (
            <Swatches
              variants={product.variants}
              value={variant.id}
              name="pdp-variant"
              onChange={(id) => {
                setVariantId(id);
                const next = product.variants.find((v) => v.id === id);
                const same = next?.skus.find((s) => s.size === sku?.size);
                setSkuId(same?.id ?? null);
                setError(null);
              }}
            />
          ) : (
            <p className="text-sm text-bone-dim">
              Colour: <span className="text-bone">{variant.label}</span>
            </p>
          )}
          <div id="size-picker">
            <SizeChips
              skus={variant.skus}
              value={skuId}
              onChange={(id) => {
                setSkuId(id);
                setError(null);
              }}
              name="pdp-size"
              legend={
                <>
                  <span>Size</span>
                  <button type="button" className="link normal-case tracking-normal" onClick={() => setGuide(true)}>
                    Size guide{chart ? "" : " (measurements pending)"}
                  </button>
                </>
              }
            />
            <p className="mt-2 min-h-5 text-sm text-bone-dim" aria-live="polite">
              {availability}
            </p>
            {product.fitNote ? <p className="mt-1 text-sm text-bone-dim">{product.fitNote}</p> : null}
          </div>

          {p ? (
            <LockerTagEditor
              p={p}
              variant={variant}
              state={{ ...tag, colorId }}
              onChange={setTag}
              currency={product.currency}
              errors={errors}
              showErrors={showTagErrors}
            />
          ) : null}

          <div>
            <button ref={buyRef} type="button" className="btn btn-primary w-full" onClick={submit} disabled={pending || !product.purchasable} aria-busy={pending} aria-describedby="buy-error">
              {pending ? "Adding…" : !product.purchasable ? product.notPurchasableReason : edit ? "Update bag" : `Add to bag — ${formatMoney(total, product.currency)}`}
            </button>
            <p id="buy-error" role="alert" className="mt-2 min-h-5 text-sm text-error">
              {error}
            </p>
          </div>

          <div className="space-y-1 border-t border-rule pt-4 text-sm text-bone-dim">
            {est.length ? (
              est.map((r) => (
                <p key={r.rateId}>
                  {r.name} ({r.carrier}): {r.minDays}–{r.maxDays} working days, {r.priceMinor === 0 ? "free" : formatMoney(r.priceMinor, r.currency)}
                </p>
              ))
            ) : (
              <p>Delivery options and prices are shown at checkout before you pay.</p>
            )}
            {dispatchNote ? <p>{dispatchNote}</p> : null}
            {tagOn && p?.productionDays != null ? <p>Locker Tag adds {p.productionDays} working days of production.</p> : null}
            <p>
              <a href="/returns" className="link">
                Returns
              </a>{" "}
              ·{" "}
              <a href="/shipping" className="link">
                Shipping
              </a>
            </p>
          </div>
        </div>

        <details className="group mt-8 border-t border-rule" open>
          <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-semibold uppercase tracking-[0.12em] text-[13px]">
            Details <span aria-hidden className="transition-transform group-open:rotate-45">+</span>
          </summary>
          {product.description ? <p className="pb-4 text-bone-dim">{product.description}</p> : null}
        </details>
        <details className="group border-t border-rule">
          <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-semibold uppercase tracking-[0.12em] text-[13px]">
            Prints &amp; construction <span aria-hidden className="transition-transform group-open:rotate-45">+</span>
          </summary>
          <ul className="space-y-2 pb-4 text-sm text-bone-dim">
            {variant.prints.map((pr) => (
              <li key={`${pr.code}-${pr.placement}`}>
                <span className="text-bone">{pr.title}</span> — {pr.placement}
                <span className="mono ml-2 text-xs text-bone-mute">
                  {pr.code} v{pr.version}
                </span>
                {pr.method ? <span className="block text-xs">Decoration: {pr.method} (pending supplier confirmation)</span> : null}
              </li>
            ))}
            {product.specs.map((s) => (
              <li key={s.key}>
                {s.label}: {s.value}
                {s.status !== "approved" ? <span className="ml-2 text-xs text-warn">draft</span> : null}
              </li>
            ))}
            <li className="text-xs text-bone-mute">Fabric, weight and care details are published once confirmed with our manufacturer.</li>
          </ul>
        </details>
        <p className="border-t border-rule pt-4 text-xs text-bone-mute">Images are concept renders of the intended garment, not photos of produced stock.</p>
      </div>

      <Sheet open={guide} onClose={() => setGuide(false)} labelledBy="guide-title" side="center">
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">{product.name}</p>
              <h2 id="guide-title" className="display mt-1 text-[40px]">
                Size guide
              </h2>
            </div>
            <button type="button" onClick={() => setGuide(false)} className="btn btn-ghost min-h-10 px-3" aria-label="Close size guide">
              ✕
            </button>
          </div>
          {chart ? (
            <SizeTable chart={chart} highlight={sku?.size} />
          ) : (
            <p className="text-bone-dim">Garment measurements for this piece are being confirmed with our manufacturer. They&apos;ll appear here before launch.</p>
          )}
        </div>
      </Sheet>

      {/* Mobile buy bar: appears only after the main button scrolls away, never covers the size controls */}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-rule-strong bg-night/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 transition-transform lg:hidden ${barVisible ? "translate-y-0" : "pointer-events-none translate-y-full"}`}
        aria-hidden={!barVisible}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-extrabold uppercase leading-none">{product.name}</p>
            <p className="truncate text-xs text-bone-dim">
              {variant.label}
              {sku ? ` · ${sku.size}` : " · choose a size"} · <span className="num">{formatMoney(total, product.currency)}</span>
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary min-h-11 px-4"
            tabIndex={barVisible ? 0 : -1}
            onClick={() => {
              if (!sku) document.getElementById("size-picker")?.scrollIntoView({ block: "center", behavior: "smooth" });
              submit();
            }}
            disabled={pending || !product.purchasable}
          >
            {sku ? "Add" : "Choose size"}
          </button>
        </div>
      </div>
    </div>
  );
}

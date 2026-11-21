"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { addToCartAction } from "@/app/(store)/actions";
import { Sheet } from "@/components/ui/sheet";
import { ConceptTag, Price, SizeChips, Swatches } from "./primitives";
import { useStore } from "./store-context";

/** The quick-shop panel opened from the rack, the grid, the back-print scene and fit hotspots. */
export function QuickShop() {
  const { quickShop, closeQuickShop, setCart, openDrawer, announce } = useStore();
  const product = quickShop?.product ?? null;
  const [variantId, setVariantId] = useState<string>("");
  const [skuId, setSkuId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!product) return;
    const preferred = product.variants.find((v) => v.id === quickShop?.variantId) ?? product.variants.find((v) => v.anyAvailable) ?? product.variants[0];
    setVariantId(preferred?.id ?? "");
    setSkuId(null);
    setError(null);
  }, [product, quickShop?.variantId]);

  const variant = useMemo(() => product?.variants.find((v) => v.id === variantId) ?? product?.variants[0], [product, variantId]);
  const sku = variant?.skus.find((s) => s.id === skuId) ?? null;
  const image = variant?.media.find((m) => m.kind === product?.heroView) ?? variant?.media.find((m) => m.kind === "front");

  function add() {
    if (!product || !variant) return;
    if (!sku) {
      setError("Choose a size.");
      return;
    }
    if (sku.state === "sold_out") {
      setError(`Size ${sku.size} is sold out. Choose another size.`);
      return;
    }
    setError(null);
    start(async () => {
      const res = await addToCartAction({ skuId: sku.id, qty: 1 });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCart(res.data);
      announce(`${product.name}, ${variant.label}, size ${sku.size} added to your bag.`);
      closeQuickShop();
      openDrawer();
    });
  }

  return (
    <Sheet open={Boolean(product)} onClose={closeQuickShop} labelledBy="qs-title">
      {product && variant ? (
        <div className="flex min-h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-rule p-5">
            <div>
              <p className="eyebrow">{product.categoryLabel}</p>
              <h2 id="qs-title" className="display mt-1 text-[44px]">
                {product.name}
              </h2>
            </div>
            <button type="button" onClick={closeQuickShop} className="btn btn-ghost min-h-10 px-3" aria-label="Close quick shop">
              ✕
            </button>
          </div>
          <div className="grid grid-cols-[120px_1fr] gap-4 p-5">
            <div className="relative aspect-[4/5] overflow-hidden bg-night-3">
              {image ? <Image src={image.url} alt={image.alt} fill sizes="120px" className="object-contain" /> : null}
            </div>
            <div className="flex flex-col justify-between">
              <Price minor={sku?.priceMinor ?? variant.skus[0]?.priceMinor ?? product.fromPriceMinor} currency={product.currency} className="text-xl font-semibold" />
              <ConceptTag className="self-start" />
            </div>
          </div>
          <div className="space-y-6 px-5 pb-5">
            {product.variants.length > 1 ? (
              <Swatches
                variants={product.variants}
                value={variant.id}
                name="qs-variant"
                onChange={(id) => {
                  setVariantId(id);
                  setSkuId(null);
                  setError(null);
                }}
              />
            ) : (
              <p className="text-sm text-bone-dim">
                Colour: <span className="text-bone">{variant.label}</span>
              </p>
            )}
            <SizeChips
              skus={variant.skus}
              value={skuId}
              onChange={(id) => {
                setSkuId(id);
                setError(null);
              }}
              name="qs-size"
              legend={
                <>
                  <span>Size</span>
                  <Link href={`/products/${product.slug}#size-guide`} className="link normal-case tracking-normal" onClick={closeQuickShop}>
                    Size guide
                  </Link>
                </>
              }
              error={error}
            />
            {sku ? (
              <p className="text-sm text-bone-dim" aria-live="polite">
                {sku.state === "in_stock"
                  ? "In stock"
                  : sku.state === "made_to_order"
                    ? product.leadTime
                      ? `Made to order — ships ${product.leadTime.minDays}–${product.leadTime.maxDays} days after you order`
                      : "Made to order — production time is confirmed before you pay"
                    : "Sold out in this size"}
              </p>
            ) : null}
          </div>
          <div className="mt-auto space-y-3 border-t border-rule p-5">
            {!product.purchasable ? (
              <p className="text-sm text-bone-dim">{product.notPurchasableReason}</p>
            ) : null}
            <button type="button" className="btn btn-primary w-full" onClick={add} disabled={pending || !product.purchasable} aria-busy={pending}>
              {pending ? "Adding…" : "Add to bag"}
            </button>
            <Link href={`/products/${product.slug}?variant=${variant.code}`} className="btn btn-ghost w-full" onClick={closeQuickShop}>
              {product.personalizable ? "Full details & Locker Tag" : "Full details"}
            </Link>
            {product.personalizable ? (
              <p className="text-center text-xs text-bone-mute">Want your name or number printed? Add a Locker Tag on the full product page.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}

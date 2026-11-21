"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/money";
import type { ProductView } from "@/server/catalog";
import { ConceptTag } from "./primitives";
import { useStore } from "./store-context";

const CATEGORY_LABEL: Record<string, string> = {
  tee: "Tees",
  stringer: "Stringers",
  singlet: "Singlets",
  hoodie: "Hoodies",
  shorts: "Shorts",
  jacket: "Jackets",
};
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL"];

/** Compact editorial grid with category and size filters and honest availability. */
export function ShopGrid({ products, headingId }: { products: ProductView[]; headingId?: string }) {
  const { openQuickShop } = useStore();
  const [cat, setCat] = useState<string>("all");
  const [size, setSize] = useState<string | null>(null);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category))], [products]);
  const sizes = useMemo(() => SIZE_ORDER.filter((s) => products.some((p) => p.sizes.includes(s))), [products]);

  const visible = products.filter((p) => {
    if (cat !== "all" && p.category !== cat) return false;
    if (size) return p.variants.some((v) => v.skus.some((s) => s.size === size && s.state !== "sold_out"));
    return true;
  });

  return (
    <div>
      <div className="flex flex-col gap-4 border-y border-rule py-4 md:flex-row md:items-center md:justify-between" aria-labelledby={headingId}>
        <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
          <button type="button" className="chip min-h-9 text-[12px]" aria-pressed={cat === "all"} onClick={() => setCat("all")}>
            All
          </button>
          {categories.map((c) => (
            <button key={c} type="button" className="chip min-h-9 text-[12px]" aria-pressed={cat === c} onClick={() => setCat(c)}>
              {CATEGORY_LABEL[c] ?? c}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Filter by size in stock" className="flex flex-wrap items-center gap-2">
          <span className="eyebrow mr-1">In stock in</span>
          {sizes.map((s) => (
            <button key={s} type="button" className="chip min-h-9 min-w-10 text-[12px]" aria-pressed={size === s} onClick={() => setSize(size === s ? null : s)}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {visible.length} product{visible.length === 1 ? "" : "s"} shown
      </p>
      {visible.length === 0 ? (
        <p className="py-16 text-center text-bone-dim">Nothing matches — size {size} is sold out in this category.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-10 pt-8 md:grid-cols-3 md:gap-x-6">
          {visible.map((p) => (
            <ProductCard key={p.id} product={p} size={size} onQuickShop={() => openQuickShop({ product: p })} />
          ))}
        </ul>
      )}
    </div>
  );
}

function availability(p: ProductView, size: string | null): string {
  if (!p.purchasable) return p.notPurchasableReason ?? "Not available";
  if (p.fulfillmentMode === "made_to_order") return p.leadTime ? `Made to order · ${p.leadTime.minDays}–${p.leadTime.maxDays} days` : "Made to order";
  const inStock = SIZE_ORDER.filter((s) => p.variants.some((v) => v.skus.some((k) => k.size === s && k.state === "in_stock")));
  if (inStock.length === 0) return "Sold out";
  if (size) return `Size ${size} in stock`;
  const missing = p.sizes.filter((s) => !inStock.includes(s));
  return missing.length ? `In stock ${inStock[0]}–${inStock[inStock.length - 1]}${missing.length ? ` · sold out: ${missing.join(", ")}` : ""}` : "All sizes in stock";
}

function ProductCard({ product: p, size, onQuickShop }: { product: ProductView; size: string | null; onQuickShop: () => void }) {
  const v = p.variants[0]!;
  const img = v.media.find((m) => m.kind === p.heroView) ?? v.media[0];
  const alt = v.media.find((m) => m.kind === (p.heroView === "back" ? "front" : "back"));
  return (
    <li className="group">
      <Link href={`/products/${p.slug}`} className="block">
        <div className="stage-wall relative aspect-[4/5] overflow-hidden border border-rule">
          {img ? <Image src={img.url} alt={img.alt} fill sizes="(min-width: 768px) 30vw, 48vw" className="object-contain p-[5%] transition-opacity duration-300 group-hover:opacity-0 motion-reduce:transition-none" /> : null}
          {alt ? <Image src={alt.url} alt="" fill sizes="(min-width: 768px) 30vw, 48vw" className="object-contain p-[5%] opacity-0 transition-opacity duration-300 group-hover:opacity-100 motion-reduce:transition-none" /> : null}
          <ConceptTag className="absolute left-2 top-2" />
        </div>
      </Link>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/products/${p.slug}`} className="font-display text-[26px] font-extrabold uppercase leading-none hover:text-fluoro md:text-[30px]">
            {p.name}
          </Link>
          <p className="mt-1 text-[13px] text-bone-dim">{p.categoryLabel}</p>
        </div>
        <p className="num shrink-0 font-semibold">
          {p.variants.some((x) => x.skus.some((s) => s.priceMinor !== p.fromPriceMinor)) ? "from " : ""}
          {formatMoney(p.fromPriceMinor, p.currency)}
        </p>
      </div>
      <div className="mt-2 flex items-center gap-1.5" aria-label={`Colours: ${p.variants.map((x) => x.label).join(", ")}`}>
        {p.variants.map((x) => (
          <span key={x.id} title={x.label} className="h-3.5 w-3.5 rounded-full border border-rule-strong" style={{ background: x.colorHex }} />
        ))}
        <span className="ml-1 text-[12px] text-bone-mute">
          {p.variants.length} option{p.variants.length === 1 ? "" : "s"}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] text-bone-dim">{availability(p, size)}</p>
      <button type="button" className="btn btn-ghost mt-3 min-h-10 w-full text-[12px]" onClick={onQuickShop} disabled={!p.purchasable}>
        Quick shop
      </button>
    </li>
  );
}

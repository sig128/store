"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { removeLineAction, updateLineAction } from "@/app/(store)/actions";
import { formatMoney } from "@/lib/money";
import type { CartLineView, CartView } from "@/server/cart";
import { useStore } from "./store-context";

export function CartLines({ cart, compact = false }: { cart: CartView; compact?: boolean }) {
  if (cart.lines.length === 0) return null;
  return (
    <ul className="divide-y divide-rule">
      {cart.lines.map((l) => (
        <CartLine key={l.id} line={l} currency={cart.currency} compact={compact} />
      ))}
    </ul>
  );
}

function CartLine({ line, currency, compact }: { line: CartLineView; currency: string; compact: boolean }) {
  const { setCart, announce } = useStore();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: true; data: CartView } | { ok: false; error: string }>, msg?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setError(null);
      setCart(r.data);
      if (msg) announce(msg);
    });

  return (
    <li className={`grid grid-cols-[84px_1fr] gap-4 py-4 ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
      <Link href={`/products/${line.productSlug}`} className="relative block aspect-[4/5] bg-night-3">
        {line.image ? <Image src={line.image.url} alt={line.image.alt} fill sizes="84px" className="object-contain" /> : null}
      </Link>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/products/${line.productSlug}`} className="font-display text-[22px] font-extrabold uppercase leading-none">
              {line.productName}
            </Link>
            <p className="mt-1 text-sm text-bone-dim">
              {line.variantLabel} · {line.size}
            </p>
            {line.personalizationLabel ? <p className="mt-1 text-sm text-sodium">{line.personalizationLabel}</p> : null}
            {line.fulfillmentMode === "made_to_order" ? (
              <p className="mt-1 text-xs text-bone-dim">
                Made to order{line.leadTime ? ` · ships ${line.leadTime.minDays}–${line.leadTime.maxDays} days after order` : ""}
              </p>
            ) : null}
            {line.withdrawalRule === "personalized_exempt" ? (
              <p className="mt-1 text-xs text-bone-dim">Personalised: no change-of-mind returns. Faults are still covered.</p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="num font-semibold">{formatMoney(line.lineTotalMinor, currency)}</p>
            {line.discountMinor > 0 ? <p className="num text-xs text-bone-dim line-through">{formatMoney(line.lineSubtotalMinor, currency)}</p> : null}
          </div>
        </div>

        {line.issue ? (
          <p className="mt-2 text-sm text-error" role="alert">
            {line.issue}
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 text-sm text-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center border border-rule-strong" role="group" aria-label={`Quantity for ${line.productName}`}>
            <button
              type="button"
              className="h-10 w-10 text-lg disabled:opacity-40"
              aria-label="Decrease quantity"
              disabled={pending || line.qty <= 1}
              onClick={() => run(() => updateLineAction({ lineId: line.id, qty: line.qty - 1 }), `Quantity ${line.qty - 1}`)}
            >
              −
            </button>
            <span className="num w-8 text-center" aria-live="polite">
              {line.qty}
            </span>
            <button
              type="button"
              className="h-10 w-10 text-lg disabled:opacity-40"
              aria-label="Increase quantity"
              disabled={pending || line.qty >= 10}
              onClick={() => run(() => updateLineAction({ lineId: line.id, qty: line.qty + 1 }), `Quantity ${line.qty + 1}`)}
            >
              +
            </button>
          </div>
          {line.sizeOptions.length > 1 ? (
            <label className="inline-flex items-center gap-2 text-sm">
              <span className="text-bone-dim">Size</span>
              <select
                className="field h-10 min-h-0 w-auto py-0 text-sm"
                value={line.skuId}
                disabled={pending}
                onChange={(e) => run(() => updateLineAction({ lineId: line.id, skuId: e.target.value }), "Size updated")}
              >
                {line.sizeOptions.map((o) => (
                  <option key={o.skuId} value={o.skuId} disabled={!o.available && o.skuId !== line.skuId}>
                    {o.size}
                    {!o.available ? " — sold out" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {line.personalization && !compact ? (
            <Link href={`/products/${line.productSlug}?edit=${line.id}`} className="link text-sm">
              Edit Locker Tag
            </Link>
          ) : null}
          <button
            type="button"
            className="link ml-auto text-sm text-bone-dim"
            disabled={pending}
            onClick={() => run(() => removeLineAction(line.id), `${line.productName} removed from your bag`)}
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

export function CartSummary({ cart, showShippingNote = true }: { cart: CartView; showShippingNote?: boolean }) {
  const p = cart.pricing;
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-bone-dim">Subtotal</dt>
        <dd className="num">{formatMoney(p.subtotalMinor, cart.currency)}</dd>
      </div>
      {p.discounts.map((d) => (
        <div key={d.ref} className="flex justify-between text-teal-bright">
          <dt>{d.label}</dt>
          <dd className="num">−{formatMoney(d.amountMinor, cart.currency)}</dd>
        </div>
      ))}
      {showShippingNote ? (
        <div className="flex justify-between">
          <dt className="text-bone-dim">Delivery</dt>
          <dd className="text-right text-bone-dim">{cart.shippingFromMinor != null ? `from ${formatMoney(cart.shippingFromMinor, cart.currency)} — calculated at checkout` : "Calculated at checkout"}</dd>
        </div>
      ) : null}
      <div className="flex justify-between border-t border-rule pt-3 text-base font-semibold">
        <dt>{showShippingNote ? "Total before delivery" : "Total"}</dt>
        <dd className="num">{formatMoney(p.totalMinor, cart.currency)}</dd>
      </div>
      {p.tax.mode === "vat_inclusive" && p.taxMinor > 0 ? (
        <p className="text-xs text-bone-dim">
          Includes {formatMoney(p.taxMinor, cart.currency)} {p.tax.label}
          {cart.taxUnconfigured ? " (development estimate — tax not configured)" : ""}
        </p>
      ) : null}
    </dl>
  );
}

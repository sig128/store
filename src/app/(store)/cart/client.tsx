"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { applyCodeAction } from "@/app/(store)/actions";
import { CartLines, CartSummary } from "@/components/store/cart-lines";
import { useStore } from "@/components/store/store-context";

export function CartPageClient() {
  const { cart, setCart } = useStore();
  const [code, setCode] = useState("");
  const [codeMsg, setCodeMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (cart.lines.length === 0) {
    return (
      <div className="py-16">
        <p className="text-bone-dim">Your bag is empty.</p>
        <Link href="/shop" className="btn btn-primary mt-6">
          Shop Drop 01
        </Link>
      </div>
    );
  }
  const blocked = cart.checkoutBlockers.length > 0;
  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
      <section aria-label="Items">
        <CartLines cart={cart} />
      </section>
      <aside className="h-fit space-y-5 border border-rule bg-night-2 p-6 lg:sticky lg:top-[calc(var(--header-h)+24px)]" aria-label="Summary">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await applyCodeAction(code || null);
              if (r.ok) {
                setCart(r.data);
                setCodeMsg(code ? "Code applied." : null);
                setCode("");
              } else setCodeMsg(r.error);
            });
          }}
        >
          <label htmlFor="code" className="label">
            Discount code
          </label>
          <div className="flex gap-2">
            <input id="code" className="field uppercase" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
            <button type="submit" className="btn btn-ghost" disabled={pending}>
              Apply
            </button>
          </div>
          {cart.discountCode ? (
            <p className="text-sm text-teal-bright">
              {cart.discountCode} applied ·{" "}
              <button
                type="button"
                className="link"
                onClick={() =>
                  start(async () => {
                    const r = await applyCodeAction(null);
                    if (r.ok) setCart(r.data);
                  })
                }
              >
                remove
              </button>
            </p>
          ) : null}
          {cart.discountError ? <p className="text-sm text-error">{cart.discountError}</p> : null}
          <p className="min-h-5 text-sm text-bone-dim" role="status">
            {codeMsg}
          </p>
        </form>
        <CartSummary cart={cart} />
        {blocked ? (
          <p className="text-sm text-error" role="alert">
            {cart.checkoutBlockers[0]}
          </p>
        ) : null}
        {blocked ? (
          <span className="btn btn-primary w-full" aria-disabled="true">
            Checkout
          </span>
        ) : (
          <Link href="/checkout" className="btn btn-primary w-full">
            Checkout
          </Link>
        )}
        <p className="text-xs text-bone-mute">Your bag is saved on this device for 90 days. Items are only held for you once you start payment.</p>
      </aside>
    </div>
  );
}

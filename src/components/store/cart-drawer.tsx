"use client";

import Link from "next/link";
import { Sheet } from "@/components/ui/sheet";
import { CartLines, CartSummary } from "./cart-lines";
import { useStore } from "./store-context";

export function CartDrawer() {
  const { cart, drawerOpen, closeDrawer } = useStore();
  const blocked = cart.checkoutBlockers.length > 0;
  return (
    <Sheet open={drawerOpen} onClose={closeDrawer} labelledBy="bag-title">
      <div className="flex min-h-full flex-col">
        <div className="flex items-center justify-between border-b border-rule px-5 py-4">
          <h2 id="bag-title" className="display text-[34px]">
            Your bag <span className="num text-bone-dim">({cart.itemCount})</span>
          </h2>
          <button type="button" onClick={closeDrawer} className="btn btn-ghost min-h-10 px-3" aria-label="Close bag">
            ✕
          </button>
        </div>
        <div className="flex-1 px-5">
          {cart.lines.length === 0 ? (
            <div className="py-16 text-center">
              <p className="display text-[40px]">Empty locker.</p>
              <p className="mt-2 text-bone-dim">Nothing in your bag yet.</p>
              <Link href="/shop" className="btn btn-ghost mt-6" onClick={closeDrawer}>
                Shop Drop 01
              </Link>
            </div>
          ) : (
            <CartLines cart={cart} compact />
          )}
        </div>
        {cart.lines.length ? (
          <div className="space-y-4 border-t border-rule bg-night-2 p-5">
            <CartSummary cart={cart} />
            {blocked ? (
              <p className="text-sm text-error" role="alert">
                {cart.checkoutBlockers[0]}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <Link href="/cart" className="btn btn-ghost" onClick={closeDrawer}>
                View bag
              </Link>
              <Link
                href={blocked ? "/cart" : "/checkout"}
                className="btn btn-primary"
                onClick={closeDrawer}
                aria-disabled={blocked}
              >
                Checkout
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

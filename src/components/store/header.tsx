"use client";

import Link from "next/link";
import { useState } from "react";
import { brand } from "@/config/brand";
import { useStore } from "./store-context";

export function Header() {
  const { cart, openDrawer } = useStore();
  const [menu, setMenu] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-night/95">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-bone focus:px-3 focus:py-2 focus:text-night">
        Skip to content
      </a>
      <div className="shell flex h-[var(--header-h)] items-center justify-between gap-6">
        <Link href="/" className="flex items-baseline gap-2" aria-label={`${brand.name} — home`}>
          <span className="font-display text-[26px] font-black uppercase leading-none tracking-tight">{brand.shortName}</span>
          <span className="hidden text-[11px] font-semibold uppercase tracking-[0.32em] text-bone-dim sm:inline">Athletics</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-8 text-[13px] font-semibold uppercase tracking-[0.14em] md:flex">
          <Link href="/shop" className="hover:text-fluoro">
            Shop
          </Link>
          <Link href="/lookbook" className="hover:text-fluoro">
            Lookbook
          </Link>
          <Link href="/size-guide" className="hover:text-fluoro">
            Size guide
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="md:hidden btn btn-ghost min-h-10 px-3 text-[12px]"
            aria-expanded={menu}
            aria-controls="mobile-nav"
            onClick={() => setMenu((m) => !m)}
          >
            Menu
          </button>
          <button type="button" onClick={openDrawer} className="btn btn-ghost min-h-10 gap-2 px-3 text-[12px]" aria-label={`Open bag, ${cart.itemCount} item${cart.itemCount === 1 ? "" : "s"}`}>
            Bag <span className="num rounded-sm bg-bone px-1.5 text-night">{cart.itemCount}</span>
          </button>
        </div>
      </div>
      {menu ? (
        <nav id="mobile-nav" aria-label="Mobile" className="shell grid gap-1 border-t border-rule py-3 md:hidden">
          {[
            ["/shop", "Shop Drop 01"],
            ["/lookbook", "Lookbook"],
            ["/size-guide", "Size guide"],
            ["/shipping", "Shipping"],
            ["/returns", "Returns"],
            ["/support", "Order support"],
          ].map(([href, label]) => (
            <Link key={href} href={href!} className="py-2 font-display text-2xl font-extrabold uppercase" onClick={() => setMenu(false)}>
              {label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}

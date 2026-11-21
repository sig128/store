"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { CartView } from "@/server/cart";
import type { ProductView } from "@/server/catalog";
import { CartDrawer } from "./cart-drawer";
import { QuickShop } from "./quick-shop";

export interface QuickShopTarget {
  product: ProductView;
  variantId?: string;
}

interface StoreCtx {
  cart: CartView;
  setCart: (c: CartView) => void;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  quickShop: QuickShopTarget | null;
  openQuickShop: (t: QuickShopTarget) => void;
  closeQuickShop: () => void;
  announce: (msg: string) => void;
  devMode: boolean;
}

const Ctx = createContext<StoreCtx | null>(null);

export function useStore(): StoreCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore must be used inside <StoreProvider>");
  return c;
}

export function StoreProvider({ initialCart, devMode, children }: { initialCart: CartView; devMode: boolean; children: React.ReactNode }) {
  const [cart, setCart] = useState(initialCart);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quickShop, setQuickShop] = useState<QuickShopTarget | null>(null);
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback((msg: string) => {
    setMessage("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(msg), 50);
  }, []);

  const value = useMemo<StoreCtx>(
    () => ({
      cart,
      setCart,
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      quickShop,
      openQuickShop: (t) => setQuickShop(t),
      closeQuickShop: () => setQuickShop(null),
      announce,
      devMode,
    }),
    [cart, drawerOpen, quickShop, announce, devMode],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <CartDrawer />
      <QuickShop />
      <div aria-live="polite" role="status" className="sr-only">
        {message}
      </div>
    </Ctx.Provider>
  );
}

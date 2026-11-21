import Link from "next/link";
import { brand } from "@/config/brand";
import { db } from "@/server/db";
import { buildCartView, findCart } from "@/server/cart";
import { env, simulatorEnabled } from "@/server/env";
import { getCartToken } from "@/server/http/session";
import { getSettings } from "@/server/settings";
import { Header } from "@/components/store/header";
import { StoreProvider } from "@/components/store/store-context";

export const dynamic = "force-dynamic";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  const cart = await buildCartView(db(), await findCart(db(), await getCartToken()), settings);
  const dev = env().APP_ENV !== "production";
  const seller = settings.seller;
  return (
    <StoreProvider initialCart={cart} devMode={dev}>
      {dev ? (
        <div className="border-b border-rule bg-night-2 text-[12px] text-bone-dim">
          <p className="shell py-1.5">
            <strong className="font-semibold text-sodium">Development build.</strong> Prices, stock, measurements and specs are sample data; images are concept renders.
            {simulatorEnabled() ? " Payments use the local test simulator — no money moves." : ""}
          </p>
        </div>
      ) : null}
      <Header />
      <main id="main" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <footer className="mt-24 border-t border-rule">
        <div className="shell grid gap-10 py-14 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <p className="display text-[56px]">{brand.shortName}</p>
            <p className="mt-3 max-w-sm text-bone-dim">{brand.tagline}</p>
          </div>
          <nav aria-label="Shop" className="grid content-start gap-2 text-sm">
            <p className="eyebrow mb-1">Shop</p>
            <Link href="/shop" className="link">Drop 01</Link>
            <Link href="/lookbook" className="link">Lookbook</Link>
            <Link href="/size-guide" className="link">Size &amp; fit</Link>
          </nav>
          <nav aria-label="Help" className="grid content-start gap-2 text-sm">
            <p className="eyebrow mb-1">Help</p>
            <Link href="/support" className="link">Order support</Link>
            <Link href="/shipping" className="link">Shipping</Link>
            <Link href="/returns" className="link">Returns</Link>
            <Link href="/contact" className="link">Contact</Link>
          </nav>
          <nav aria-label="Legal" className="grid content-start gap-2 text-sm">
            <p className="eyebrow mb-1">Legal</p>
            <Link href="/terms" className="link">Terms of sale</Link>
            <Link href="/privacy" className="link">Privacy</Link>
          </nav>
        </div>
        <div className="shell border-t border-rule py-5 text-xs text-bone-mute">
          {seller.legalName ? (
            <p>
              {seller.legalName}
              {seller.orgNumber ? ` · Org. no. ${seller.orgNumber}` : ""}
              {seller.addressLines.length ? ` · ${seller.addressLines.join(", ")}` : ""}
            </p>
          ) : (
            <p>Seller details not configured yet (set them in Admin → Settings before launch).</p>
          )}
        </div>
      </footer>
      <div className="grain" aria-hidden />
    </StoreProvider>
  );
}

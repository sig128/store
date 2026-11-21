import Link from "next/link";
import { listOutfits, listProducts } from "@/server/catalog";
import { getSettings } from "@/server/settings";
import { formatMoney } from "@/lib/money";
import { ShopGrid } from "@/components/store/shop-grid";
import { DropSignup } from "@/components/store/drop-signup";
import { countryNames } from "@/server/policies";
import { OutsideTheGym } from "./_scenes/outside";
import { Rack } from "./_scenes/rack";
import { BackPrint } from "./_scenes/back-print";
import { BuildTheFit } from "./_scenes/build-the-fit";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [products, outfits, settings] = await Promise.all([listProducts(), listOutfits(), getSettings()]);
  const hero = products.find((p) => p.category === "tee") ?? products[0];
  return (
    <>
      <OutsideTheGym products={products} />
      <Rack products={products} />
      {hero ? <BackPrint product={hero} /> : null}
      {outfits.length ? <BuildTheFit outfits={outfits} /> : null}

      <section id="shop-the-drop" aria-labelledby="shop-title" className="scroll-mt-[var(--header-h)] py-16 md:py-24">
        <div className="shell">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">05 / Shop the drop</p>
              <h2 id="shop-title" className="display mt-3 text-[clamp(52px,7vw,104px)]">
                Drop 01
              </h2>
            </div>
            <Link href="/shop" className="link text-sm">
              Open the full shop page
            </Link>
          </div>
          <ShopGrid products={products} headingId="shop-title" />
        </div>
      </section>

      <section aria-labelledby="locker-title" className="border-t border-rule">
        <div className="h-3 w-full bg-[repeating-linear-gradient(90deg,var(--night-3)_0_14px,transparent_14px_20px)]" aria-hidden />
        <div className="shell py-16">
          <p className="eyebrow">06 / The locker room</p>
          <h2 id="locker-title" className="display mt-3 text-[clamp(48px,6vw,88px)]">
            The locker room
          </h2>
          <div className="mt-10 grid gap-10 md:grid-cols-3">
            <div className="border-t border-rule-strong pt-5">
              <p className="font-stencil text-[13px] uppercase tracking-[0.2em] text-bone-mute">Locker 01</p>
              <h3 className="mt-2 font-display text-[32px] font-extrabold uppercase leading-none">Size &amp; fit</h3>
              <p className="mt-3 text-bone-dim">Every size table lists the garment laid flat, measured in centimetres or inches — not body measurements and not a guess.</p>
              <Link href="/size-guide" className="btn btn-ghost mt-5">
                Size guide
              </Link>
            </div>
            <div className="border-t border-rule-strong pt-5">
              <p className="font-stencil text-[13px] uppercase tracking-[0.2em] text-bone-mute">Locker 02</p>
              <h3 className="mt-2 font-display text-[32px] font-extrabold uppercase leading-none">Shipping &amp; returns</h3>
              <p className="mt-3 text-bone-dim">
                We ship to {countryNames(settings.store.shipsTo)} only, with delivery prices shown before you pay. {settings.support.withdrawalDays}-day returns on standard items.
              </p>
              <div className="mt-5 flex gap-3">
                <Link href="/shipping" className="btn btn-ghost">
                  Shipping
                </Link>
                <Link href="/returns" className="btn btn-ghost">
                  Returns
                </Link>
              </div>
            </div>
            <div className="border-t border-rule-strong pt-5">
              <p className="font-stencil text-[13px] uppercase tracking-[0.2em] text-bone-mute">Locker 03</p>
              <h3 className="mt-2 font-display text-[32px] font-extrabold uppercase leading-none">Next drop</h3>
              {settings.features.dropSignup ? (
                <div className="mt-3">
                  <DropSignup />
                </div>
              ) : (
                <p className="mt-3 text-bone-dim">Signups are closed.</p>
              )}
            </div>
          </div>
          {products.length ? (
            <p className="mt-12 text-sm text-bone-mute">
              {products.length} pieces · from {formatMoney(Math.min(...products.map((p) => p.fromPriceMinor)), products[0]!.currency)}
              {settings.tax.mode === "vat_inclusive" ? ` · prices include ${settings.tax.label}` : settings.tax.mode === "not_registered" ? " · no VAT is charged" : ""}
            </p>
          ) : null}
        </div>
      </section>
    </>
  );
}

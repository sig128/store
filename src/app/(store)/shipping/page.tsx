import type { Metadata } from "next";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { ratesFor } from "@/server/shipping";
import { countryNames } from "@/server/policies";
import { formatMoney } from "@/lib/money";
import { PolicyPage, policyMetadata } from "@/components/store/policy-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = policyMetadata("Shipping", "Where we deliver, delivery options and prices.", "/shipping");

export default async function Page() {
  const s = await getSettings();
  const perCountry = await Promise.all(s.store.shipsTo.map(async (c) => ({ c, rates: await ratesFor(db(), c, 0, s.store.currency) })));
  return (
    <PolicyPage slug="shipping" eyebrow="Help">
      <section aria-labelledby="rates-title" className="mt-10 max-w-[68ch]">
        <h2 id="rates-title" className="font-display text-[28px] font-extrabold uppercase leading-none">
          Delivery options
        </h2>
        <p className="mt-2 text-sm text-bone-dim">We deliver to {countryNames(s.store.shipsTo) || "—"}. The exact price for your address is confirmed at checkout before you pay.</p>
        {perCountry.map(({ c, rates }) => (
          <div key={c} className="mt-5">
            <h3 className="text-sm text-bone-mute">{countryNames([c])}</h3>
            {rates.length === 0 ? (
              <p className="mt-2 text-bone-dim">Delivery options are being confirmed.</p>
            ) : (
              <ul className="mt-2 divide-y divide-rule border-y border-rule">
                {rates.map((r) => (
                  <li key={r.rateId} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-3">
                    <span className="font-semibold text-bone">{r.name}</span>
                    <span className="mono text-right text-bone">{formatMoney(r.priceMinor, r.currency)}</span>
                    <span className="text-sm text-bone-dim">
                      {r.carrier}
                      {r.service ? ` — ${r.service}` : ""}
                    </span>
                    <span className="text-right text-sm text-bone-dim">{r.minDays != null && r.maxDays != null ? `${r.minDays}–${r.maxDays} working days` : "Delivery time shown when confirmed"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>
    </PolicyPage>
  );
}

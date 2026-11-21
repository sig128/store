import type { Metadata } from "next";
import { getSettings } from "@/server/settings";
import { providerForChoice } from "@/server/payments";
import { checkoutGate } from "@/server/readiness";
import { CheckoutClient } from "./client";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

const COUNTRY_NAMES: Record<string, string> = { NO: "Norway", SE: "Sweden", DK: "Denmark", FI: "Finland" };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const gate = await checkoutGate();
  const card = providerForChoice("card", { stripe: s.checkout.stripeEnabled, paypal: s.checkout.paypalEnabled });
  const paypal = providerForChoice("paypal", { stripe: s.checkout.stripeEnabled, paypal: s.checkout.paypalEnabled });
  return (
    <div className="shell py-10 md:py-14">
      <h1 className="display text-[clamp(52px,7vw,96px)]">Checkout</h1>
      {!gate.open ? (
        <p className="mt-6 max-w-xl border border-warn/40 bg-warn/10 p-4 text-warn">{gate.message}</p>
      ) : (
        <CheckoutClient
          countries={s.store.shipsTo.map((c) => ({ code: c, name: COUNTRY_NAMES[c] ?? c }))}
          providers={{
            card: card ? { label: card.label, simulator: card.id === "simulator" } : null,
            paypal: paypal ? { label: paypal.label, simulator: paypal.id === "simulator" } : null,
          }}
          withdrawalDays={s.support.withdrawalDays}
          dutiesNote={s.tax.dutiesNote}
          notice={sp.cancelled ? "Payment was cancelled. Nothing was charged — your bag is still here." : sp.error ? decodeURIComponent(sp.error) : null}
        />
      )}
    </div>
  );
}

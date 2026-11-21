import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/server/settings";
import { OrderLinkForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Order support", description: "Get a secure link to your order, track a delivery, or start a return.", alternates: { canonical: "/support" } };

export default async function Support({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const s = await getSettings();
  return (
    <article className="shell py-14 md:py-20">
      <p className="eyebrow">Help</p>
      <h1 className="display mt-3 text-[clamp(52px,8vw,112px)]">Order support</h1>
      {sp.link === "expired" ? (
        <p role="alert" className="mt-6 max-w-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          That order link has expired or was already replaced. Enter your details below and we&apos;ll email a fresh one.
        </p>
      ) : null}
      <div className="mt-10 grid gap-12 md:grid-cols-[1fr_1fr]">
        <section aria-labelledby="sup-link">
          <h2 id="sup-link" className="font-display text-[28px] font-extrabold uppercase leading-none">
            See your order
          </h2>
          <p className="mb-6 mt-3 max-w-md text-bone-dim">
            Orders don&apos;t need an account. We email a private link that is valid for {s.support.orderLinkDays} days and shows status, tracking and receipt.
          </p>
          <OrderLinkForm />
        </section>
        <section aria-labelledby="sup-more" className="space-y-6 text-bone-dim">
          <h2 id="sup-more" className="font-display text-[28px] font-extrabold uppercase leading-none text-bone">
            Something else
          </h2>
          <p>
            <strong className="text-bone">Returns and exchanges:</strong> read the <Link className="link" href="/returns">returns page</Link>, then email us with your order number.
          </p>
          <p>
            <strong className="text-bone">Delivery:</strong> options and prices are on the <Link className="link" href="/shipping">shipping page</Link>. Tracking is emailed as soon as your parcel is handed to the carrier.
          </p>
          <p>
            <strong className="text-bone">Sizing:</strong> compare with a garment you own using the <Link className="link" href="/size-guide">size guide</Link>.
          </p>
          <p>
            <Link className="link" href="/contact">Contact us</Link>
          </p>
        </section>
      </div>
    </article>
  );
}

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { orders, simulatorSessions } from "@/server/db/schema";
import { simulatorEnabled } from "@/server/env";
import { formatMoney } from "@/lib/money";
import { simulate } from "./actions";

export const dynamic = "force-dynamic";

export default async function SimulatorPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  if (!simulatorEnabled()) notFound();
  const { ref } = await params;
  const sp = await searchParams;
  const [s] = await db().select().from(simulatorSessions).where(eq(simulatorSessions.ref, ref));
  if (!s) notFound();
  const [o] = await db().select({ number: orders.number }).from(orders).where(eq(orders.id, s.reference.orderId));
  const hidden = (
    <>
      <input type="hidden" name="ref" value={ref} />
      <input type="hidden" name="success" value={sp.success ?? ""} />
      <input type="hidden" name="cancel" value={sp.cancel ?? ""} />
      <input type="hidden" name="ret" value={sp.ret ?? ""} />
    </>
  );
  const Btn = ({ action, label, primary, delay }: { action: string; label: string; primary?: boolean; delay?: boolean }) => (
    <form action={simulate}>
      {hidden}
      <input type="hidden" name="action" value={action} />
      {delay ? <input type="hidden" name="delay" value="1" /> : null}
      <button type="submit" className={`btn w-full ${primary ? "btn-primary" : "btn-ghost"}`}>
        {label}
      </button>
    </form>
  );
  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <p className="border border-warn/50 bg-warn/10 px-4 py-3 text-sm text-warn">
        LOCAL PAYMENT SIMULATOR — development only. No money moves. In production this page does not exist; buyers go to Stripe or PayPal.
      </p>
      <h1 className="display mt-8 text-[56px]">{s.flavor === "card" ? "Test card checkout" : "Test wallet approval"}</h1>
      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-bone-dim">Order</dt>
        <dd className="mono">{o?.number}</dd>
        <dt className="text-bone-dim">Amount</dt>
        <dd className="num text-lg font-semibold">{formatMoney(s.amountMinor, s.currency)}</dd>
        <dt className="text-bone-dim">Session</dt>
        <dd className="mono text-xs">{ref}</dd>
        <dt className="text-bone-dim">Status</dt>
        <dd className="mono">{s.status}</dd>
      </dl>
      {sp.done ? <p className="mt-4 text-sm text-ok">Applied: {sp.done}</p> : null}
      <div className="mt-8 grid gap-3">
        {s.flavor === "card" ? (
          <>
            <Btn action="pay" label="Pay now (succeeds)" primary />
            <Btn action="pay" label="Pay — webhook arrives late (6 s)" delay />
            <Btn action="pay_async" label="Pay with delayed confirmation (async)" />
            <Btn action="wrong_amount" label="Pay a wrong amount (tests verification)" />
            <Btn action="cancel" label="Cancel and return to store" />
          </>
        ) : (
          <>
            <Btn action="approve" label="Approve payment (store captures it)" primary />
            <Btn action="cancel" label="Cancel and return to store" />
          </>
        )}
      </div>
      {s.status === "processing" || s.status === "paid" ? (
        <div className="mt-10 grid gap-3 border-t border-rule pt-6">
          <p className="eyebrow">Provider-side events</p>
          {s.status === "processing" ? (
            <>
              <Btn action="async_succeeds" label="Delayed payment succeeds" />
              <Btn action="async_fails" label="Delayed payment fails" />
            </>
          ) : null}
          {s.status === "paid" ? <Btn action="duplicate_capture" label="Send a second successful capture (duplicate)" /> : null}
        </div>
      ) : null}
    </main>
  );
}

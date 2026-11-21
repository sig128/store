import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { orderLines, orders, paymentAttempts } from "@/server/db/schema";
import { hasOrderAccess } from "@/server/http/session";
import { enqueue } from "@/server/jobs/queue";
import { OrderSummary } from "@/components/store/order-view";
import { StatusPoller } from "./poller";

export const metadata: Metadata = { title: "Order status", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Landing page after the provider. It NEVER marks anything paid: it shows the
 * verified server state and, while that is still pending, says so and polls.
 */
export default async function CompletePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  let orderId = sp.order && /^[0-9a-f-]{36}$/i.test(sp.order) ? sp.order : null;
  const attemptId = sp.attempt && /^[0-9a-f-]{36}$/i.test(sp.attempt) ? sp.attempt : null;
  if (!orderId && attemptId) {
    const [a] = await db().select({ orderId: paymentAttempts.orderId }).from(paymentAttempts).where(eq(paymentAttempts.id, attemptId));
    orderId = a?.orderId ?? null;
  }
  if (!orderId || !(await hasOrderAccess(orderId))) {
    return (
      <div className="shell py-16">
        <h1 className="display text-[64px]">Order status</h1>
        <p className="mt-4 max-w-xl text-bone-dim">
          We can&apos;t show this order in this browser. Use the link in your confirmation email, or{" "}
          <Link href="/support" className="link">
            request a new link
          </Link>
          .
        </p>
      </div>
    );
  }
  const [order] = await db().select().from(orders).where(eq(orders.id, orderId));
  if (!order) return null;
  const lines = await db().select().from(orderLines).where(eq(orderLines.orderId, order.id)).orderBy(asc(orderLines.lineNo));
  const pending = order.paymentStatus === "unpaid" || order.paymentStatus === "processing";
  if (pending && attemptId) {
    // Ask the worker to check the provider directly in case the webhook is slow (deduplicated per minute).
    await enqueue(db(), { type: "payment.reconcile", payload: { attemptId }, dedupeKey: `reconcile:${attemptId}:${Math.floor(Date.now() / 60_000)}`, orderId: order.id });
  }

  return (
    <div className="shell py-12 md:py-16">
      <p className="eyebrow">
        Order <span className="mono">{order.number}</span>
      </p>
      {order.paymentStatus === "paid" ? (
        <>
          <h1 className="display mt-3 text-[clamp(56px,8vw,112px)]">Locked in.</h1>
          <p className="mt-4 max-w-xl text-bone-dim">
            Payment confirmed. A receipt and a secure order link are on their way to <span className="text-bone">{order.email}</span>.
          </p>
        </>
      ) : order.paymentStatus === "processing" ? (
        <>
          <h1 className="display mt-3 text-[clamp(56px,8vw,112px)]">Confirming payment…</h1>
          <p className="mt-4 max-w-xl text-bone-dim">Your payment method confirms in the background. We hold your items meanwhile and email you as soon as it&apos;s confirmed. You can close this page.</p>
        </>
      ) : order.paymentStatus === "unpaid" ? (
        <>
          <h1 className="display mt-3 text-[clamp(56px,8vw,112px)]">Confirming payment…</h1>
          <p className="mt-4 max-w-xl text-bone-dim">We&apos;re waiting for the payment provider to confirm. This usually takes a few seconds.</p>
        </>
      ) : (
        <>
          <h1 className="display mt-3 text-[clamp(56px,8vw,112px)]">Not paid.</h1>
          <p className="mt-4 max-w-xl text-bone-dim">This order wasn&apos;t paid ({order.paymentStatus}). Nothing was charged for it.</p>
          <Link href="/cart" className="btn btn-primary mt-6">
            Back to your bag
          </Link>
        </>
      )}
      {pending ? <StatusPoller orderId={order.id} /> : null}
      <div className="mt-12">
        <OrderSummary order={order} lines={lines} />
      </div>
    </div>
  );
}

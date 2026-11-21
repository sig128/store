import "../guard";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { orders, paymentAttempts } from "../db/schema";
import { releaseReservations } from "../inventory";
import { getProvider } from "../payments";
import type { AttemptRow, NormalizedEvent, ProviderStatus } from "../payments/types";
import { sameDestination } from "../shipping";
import { ACTIVE_ATTEMPT, addOrderEvent, handleProviderEvent } from "./transitions";

/**
 * Recovery and reconciliation. Nothing here marks an order paid directly: every
 * finding is turned into a NormalizedEvent and applied by handleProviderEvent.
 */

async function loadAttempt(id: string): Promise<AttemptRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [a] = await db().select().from(paymentAttempts).where(eq(paymentAttempts.id, id));
  return a ?? null;
}

function statusToEvents(a: AttemptRow, st: ProviderStatus, origin: string): NormalizedEvent[] {
  const base = { provider: a.provider, type: origin, checkoutRef: a.providerRef, attemptId: a.id, summary: { origin, state: st.state } };
  const events: NormalizedEvent[] = [];
  for (const p of st.payments) {
    const kind = p.status === "succeeded" ? "payment_succeeded" : p.status === "processing" ? "payment_processing" : "payment_failed";
    events.push({ ...base, eventId: `${origin}:${a.id}:${p.providerPaymentId}:${p.status}`, kind, payment: p });
  }
  if (events.length === 0) {
    if (st.state === "expired") events.push({ ...base, eventId: `${origin}:${a.id}:expired`, kind: "checkout_expired" });
    if (st.state === "cancelled") events.push({ ...base, eventId: `${origin}:${a.id}:cancelled`, kind: "checkout_cancelled" });
    if (st.state === "failed") events.push({ ...base, eventId: `${origin}:${a.id}:failed`, kind: "payment_failed", failureReason: "Reported failed by provider" });
    if (st.state === "approved" && a.status === "open") events.push({ ...base, eventId: `${origin}:${a.id}:approved`, kind: "checkout_approved" });
  }
  return events;
}

/** Ask the provider what really happened to an attempt and apply it. */
export async function reconcileAttempt(attemptId: string): Promise<ProviderStatus["state"] | "noop"> {
  const a = await loadAttempt(attemptId);
  if (!a || !a.providerRef) return "noop";
  const st = await getProvider(a.provider).retrieve(a);
  for (const ev of statusToEvents(a, st, "reconcile")) await handleProviderEvent(ev);
  return st.state;
}

/**
 * Make sure an attempt can no longer take money before another one starts.
 * Returns "paid" when the provider says it already completed (then reconciled).
 */
export async function closeAttempt(attemptId: string, reason: string): Promise<"closed" | "paid" | "error" | "noop"> {
  const a = await loadAttempt(attemptId);
  if (!a || !(ACTIVE_ATTEMPT as readonly string[]).includes(a.status)) return "noop";
  const res = a.providerRef ? await getProvider(a.provider).closeCheckout(a) : ({ status: "closed" } as const);
  if (res.status === "already_completed") {
    await reconcileAttempt(a.id);
    return "paid";
  }
  if (res.status === "error") return "error";
  const rows = await db()
    .update(paymentAttempts)
    .set({ status: "superseded", failureReason: reason, closedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(paymentAttempts.id, a.id), inArray(paymentAttempts.status, [...ACTIVE_ATTEMPT])))
    .returning({ id: paymentAttempts.id });
  if (rows.length) await addOrderEvent(db(), a.orderId, "attempt_closed", `Payment attempt closed (${reason}).`, { attemptId: a.id });
  return "closed";
}

export type CaptureOutcome =
  | { outcome: "paid" | "processing" | "failed" | "rejected" | "expired" | "noop"; orderId: string | null; message?: string }
  | { outcome: "declined_retry"; orderId: string; payerActionUrl: string | null };

/**
 * Approve-then-capture providers (PayPal): verify the approved order, capture it
 * server-side with an idempotent request id, then apply the capture result through
 * the canonical transition. Buyer approval alone never marks anything paid.
 */
export async function captureApprovedAttempt(attemptId: string): Promise<CaptureOutcome> {
  const a = await loadAttempt(attemptId);
  if (!a) return { outcome: "noop", orderId: null };
  if (a.status === "succeeded") return { outcome: "paid", orderId: a.orderId };
  if (a.status !== "open" && a.status !== "approved") return { outcome: "noop", orderId: a.orderId, message: `Attempt is ${a.status}` };
  const provider = getProvider(a.provider);
  if (!provider.capture) return { outcome: "noop", orderId: a.orderId };

  const st = await provider.retrieve(a);
  if (st.state === "succeeded" || st.state === "processing") {
    for (const ev of statusToEvents(a, st, "capture-check")) await handleProviderEvent(ev);
    return { outcome: st.state === "succeeded" ? "paid" : "processing", orderId: a.orderId };
  }
  if (st.state !== "approved") return { outcome: "failed", orderId: a.orderId, message: `Payment not approved (${st.state}).` };
  if (a.expiresAt.getTime() < Date.now()) {
    await closeAttempt(a.id, "approval arrived after the checkout expired");
    return { outcome: "expired", orderId: a.orderId, message: "This checkout expired before payment. Nothing was charged — please check out again." };
  }
  const [order] = await db().select().from(orders).where(eq(orders.id, a.orderId));
  const mismatch =
    !order ||
    st.amountMinor !== a.amountMinor ||
    (st.currency ?? "").toUpperCase() !== a.currency.toUpperCase() ||
    (st.reference?.orderId && st.reference.orderId !== a.orderId) ||
    (st.reference?.attemptId && st.reference.attemptId !== a.id) ||
    (st.shippingAddress && !sameDestination(st.shippingAddress, order.shippingAddress));
  if (mismatch) {
    await db()
      .update(paymentAttempts)
      .set({ status: "failed", failureReason: "Approved order did not match the quote; not captured", closedAt: new Date(), updatedAt: new Date() })
      .where(eq(paymentAttempts.id, a.id));
    await addOrderEvent(db(), a.orderId, "capture_rejected", "PayPal approval did not match the quoted total/destination. Not captured; nothing was charged.");
    return { outcome: "rejected", orderId: a.orderId, message: "Your payment details changed after we quoted your order. Nothing was charged — please review your order and pay again." };
  }
  const res = await provider.capture(a);
  if ((res as { declinedRetryable?: boolean }).declinedRetryable) {
    return { outcome: "declined_retry", orderId: a.orderId, payerActionUrl: res.payerActionUrl ?? null };
  }
  for (const ev of statusToEvents(a, res, "capture")) await handleProviderEvent(ev);
  return {
    outcome: res.state === "succeeded" ? "paid" : res.state === "processing" ? "processing" : "failed",
    orderId: a.orderId,
  };
}

/**
 * Periodic recovery (worker + cron): close stale attempts, reconcile anything
 * ambiguous, expire unpaid orders whose stock hold ended.
 */
export async function sweepOrders(now = new Date()): Promise<{ reconciled: number; closed: number; expired: number }> {
  const root = db();
  let reconciled = 0;
  let closed = 0;
  let expired = 0;

  // Attempts that never got a provider reference (crash between DB and provider).
  await root
    .update(paymentAttempts)
    .set({ status: "failed", failureReason: "Checkout creation did not complete", closedAt: now, updatedAt: now })
    .where(and(eq(paymentAttempts.status, "creating"), lt(paymentAttempts.createdAt, new Date(now.getTime() - 10 * 60_000)), sql`${paymentAttempts.providerRef} is null`));

  // Open/approved attempts past their expiry, and processing ones: ask the provider.
  const stale = await root
    .select()
    .from(paymentAttempts)
    .where(
      sql`(${paymentAttempts.status} in ('open','approved') and ${paymentAttempts.expiresAt} < ${new Date(now.getTime() - 2 * 60_000)})
          or (${paymentAttempts.status} = 'processing' and ${paymentAttempts.updatedAt} < ${new Date(now.getTime() - 10 * 60_000)})`,
    )
    .limit(50);
  for (const a of stale) {
    try {
      const state = await reconcileAttempt(a.id);
      reconciled++;
      if (state === "open" || state === "approved") {
        const r = await closeAttempt(a.id, "expired without payment");
        if (r === "closed") closed++;
      }
    } catch (err) {
      console.error(`[sweep] reconcile ${a.id} failed`, err);
    }
  }

  // Unpaid orders whose hold ended and that have no live attempt.
  const lapsed = await root
    .select()
    .from(orders)
    .where(and(eq(orders.paymentStatus, "unpaid"), lt(orders.reservationExpiresAt, now)))
    .limit(100);
  for (const o of lapsed) {
    const active = await root
      .select({ id: paymentAttempts.id })
      .from(paymentAttempts)
      .where(and(eq(paymentAttempts.orderId, o.id), inArray(paymentAttempts.status, [...ACTIVE_ATTEMPT])));
    if (active.length) {
      for (const x of active) {
        const r = await closeAttempt(x.id, "stock hold ended");
        if (r === "paid") continue;
      }
      const still = await root
        .select({ id: paymentAttempts.id })
        .from(paymentAttempts)
        .where(and(eq(paymentAttempts.orderId, o.id), inArray(paymentAttempts.status, [...ACTIVE_ATTEMPT])));
      if (still.length) continue;
    }
    await root.transaction(async (tx) => {
      const [locked] = await tx.select().from(orders).where(eq(orders.id, o.id)).for("update");
      if (!locked || locked.paymentStatus !== "unpaid") return;
      await tx.update(orders).set({ paymentStatus: "expired", expiredAt: now, reservationExpiresAt: null, updatedAt: now }).where(eq(orders.id, o.id));
      await releaseReservations(tx, o.id);
      await addOrderEvent(tx, o.id, "expired", "No payment before the stock hold ended. Stock released.");
    });
    expired++;
  }
  return { reconciled, closed, expired };
}

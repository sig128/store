import "../guard";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db, type DB, type Tx } from "../db";
import {
  cartLines,
  carts,
  discountCodes,
  orderEvents,
  orderLines,
  orders,
  paymentAttempts,
  payments,
  providerEvents,
  refunds,
} from "../db/schema";
import { commitStock, extendReservations, releaseReservations } from "../inventory";
import { enqueue } from "../jobs/queue";
import { sameAddress, sameDestination } from "../shipping";
import type { AttemptRow, NormalizedEvent, OrderRow, VerifiedPayment } from "../payments/types";
import type { ReviewReason } from "@/lib/types";

/**
 * THE canonical payment state machine. Stripe webhooks, PayPal webhooks, PayPal
 * capture responses, the local simulator and reconciliation jobs all end up in
 * `handleProviderEvent`, so every path applies the same verification and the same
 * idempotent transition:
 *   - events are recorded once (provider, event id);
 *   - payments are recorded once (provider, provider payment id);
 *   - the order row is locked while it changes;
 *   - an order is only marked paid when amount, currency and our own reference match;
 *   - a second successful payment is flagged for review — never a second shipment.
 */

export const ACTIVE_ATTEMPT = ["creating", "open", "approved", "processing"] as const;

export async function addOrderEvent(
  tx: Tx | DB,
  orderId: string,
  type: string,
  message: string,
  data?: Record<string, unknown>,
  actor = "system",
) {
  await tx.insert(orderEvents).values({ orderId, type, message, data: data ?? null, actor });
}

export function addReview(order: Pick<OrderRow, "reviewReasons">, reason: Omit<ReviewReason, "at">): { reviewStatus: "needs_review"; reviewReasons: ReviewReason[] } {
  const reasons = [...(order.reviewReasons ?? []), { ...reason, at: new Date().toISOString() }];
  return { reviewStatus: "needs_review", reviewReasons: reasons };
}

export function blocksFulfillment(order: Pick<OrderRow, "reviewReasons">): boolean {
  return (order.reviewReasons ?? []).some((r) => r.blocksFulfillment && !r.resolvedAt);
}

function verifyPayment(attempt: AttemptRow, order: OrderRow, p: VerifiedPayment): Omit<ReviewReason, "at"> | null {
  if (p.currency.toUpperCase() !== attempt.currency.toUpperCase()) {
    return { code: "currency_mismatch", message: `Provider reported ${p.currency.toUpperCase()}, expected ${attempt.currency}.`, blocksFulfillment: true };
  }
  if (p.amountMinor !== attempt.amountMinor || attempt.amountMinor !== order.totalMinor) {
    return { code: "amount_mismatch", message: `Provider reported ${p.amountMinor} minor units, expected ${attempt.amountMinor}.`, blocksFulfillment: true };
  }
  const ref = p.reference ?? {};
  if ((!ref.orderId && !ref.attemptId) || (ref.orderId && ref.orderId !== order.id) || (ref.attemptId && ref.attemptId !== attempt.id)) {
    return { code: "reference_mismatch", message: "Payment does not carry this order's reference.", blocksFulfillment: true };
  }
  if (p.shippingAddress && !sameDestination(p.shippingAddress, order.shippingAddress)) {
    return { code: "address_mismatch", message: "The provider's shipping destination differs from the quoted destination (country/postal code).", blocksFulfillment: true };
  }
  return null;
}

async function lockOrder(tx: Tx, orderId: string): Promise<OrderRow | null> {
  const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  return o ?? null;
}

async function findAttempt(tx: Tx, ev: NormalizedEvent): Promise<AttemptRow | null> {
  const byId = ev.attemptId ?? ev.payment?.reference?.attemptId ?? null;
  if (byId && /^[0-9a-f-]{36}$/i.test(byId)) {
    const [a] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.id, byId));
    if (a && a.provider === ev.provider) return a;
  }
  if (ev.checkoutRef) {
    const [a] = await tx
      .select()
      .from(paymentAttempts)
      .where(and(eq(paymentAttempts.provider, ev.provider), eq(paymentAttempts.providerRef, ev.checkoutRef)));
    if (a) return a;
  }
  if (ev.payment?.providerPaymentId) {
    // e.g. disputes, which only reference the payment
    const [p] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.provider, ev.provider), eq(payments.providerPaymentId, ev.payment.providerPaymentId)));
    if (p?.attemptId) {
      const [a] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.id, p.attemptId));
      if (a) return a;
    }
  }
  return null;
}

export type EventOutcome = { status: "processed" | "duplicate" | "ignored"; orderId?: string | null; note?: string };

export async function handleProviderEvent(ev: NormalizedEvent, root: DB = db()): Promise<EventOutcome> {
  const inserted = await root
    .insert(providerEvents)
    .values({ provider: ev.provider, eventId: ev.eventId, type: ev.type, payload: ev.summary, status: "received" })
    .onConflictDoNothing({ target: [providerEvents.provider, providerEvents.eventId] })
    .returning({ id: providerEvents.id });
  if (!inserted[0]) {
    const [existing] = await root
      .select()
      .from(providerEvents)
      .where(and(eq(providerEvents.provider, ev.provider), eq(providerEvents.eventId, ev.eventId)));
    if (existing && (existing.status === "processed" || existing.status === "ignored")) {
      return { status: "duplicate", orderId: existing.orderId };
    }
  }
  try {
    const outcome = await root.transaction((tx) => applyEvent(tx, ev));
    await root
      .update(providerEvents)
      .set({
        status: outcome.status === "ignored" ? "ignored" : "processed",
        processedAt: new Date(),
        orderId: outcome.orderId ?? null,
        error: outcome.note ?? null,
        attempts: sql`${providerEvents.attempts} + 1`,
      })
      .where(and(eq(providerEvents.provider, ev.provider), eq(providerEvents.eventId, ev.eventId)));
    return outcome;
  } catch (err) {
    await root
      .update(providerEvents)
      .set({ status: "failed", error: String((err as Error).message ?? err).slice(0, 1000), attempts: sql`${providerEvents.attempts} + 1` })
      .where(and(eq(providerEvents.provider, ev.provider), eq(providerEvents.eventId, ev.eventId)));
    throw err;
  }
}

async function applyEvent(tx: Tx, ev: NormalizedEvent): Promise<EventOutcome> {
  if (ev.kind === "ignored") return { status: "ignored", note: "Event type not used" };
  if (ev.kind === "refund_updated") return applyRefundUpdate(tx, ev);

  const attempt0 = await findAttempt(tx, ev);
  if (!attempt0) return { status: "ignored", note: "No matching payment attempt" };
  const order = await lockOrder(tx, attempt0.orderId);
  if (!order) return { status: "ignored", note: "Order not found" };
  const [attempt] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.id, attempt0.id)).for("update");
  if (!attempt) return { status: "ignored" };
  const now = new Date();

  switch (ev.kind) {
    case "payment_succeeded": {
      const p = ev.payment;
      if (!p) return { status: "ignored", orderId: order.id, note: "No payment details" };
      return recordSuccess(tx, order, attempt, p, ev);
    }
    case "payment_processing": {
      const p = ev.payment;
      if (p) {
        await tx
          .insert(payments)
          .values({ orderId: order.id, attemptId: attempt.id, provider: ev.provider, providerPaymentId: p.providerPaymentId, status: "processing", amountMinor: p.amountMinor, currency: p.currency.toUpperCase(), details: p.details ?? null })
          .onConflictDoNothing({ target: [payments.provider, payments.providerPaymentId] });
      }
      if ((ACTIVE_ATTEMPT as readonly string[]).includes(attempt.status)) {
        await tx.update(paymentAttempts).set({ status: "processing", updatedAt: now }).where(eq(paymentAttempts.id, attempt.id));
      }
      if (order.paymentStatus === "unpaid") {
        const until = new Date(Date.now() + 7 * 24 * 3600_000);
        await tx.update(orders).set({ paymentStatus: "processing", reservationExpiresAt: until, updatedAt: now }).where(eq(orders.id, order.id));
        await extendReservations(tx, order.id, until);
        await addOrderEvent(tx, order.id, "payment_processing", "Payment is processing; waiting for the provider to confirm.", { provider: ev.provider });
      }
      return { status: "processed", orderId: order.id };
    }
    case "payment_failed": {
      if ((ACTIVE_ATTEMPT as readonly string[]).includes(attempt.status)) {
        await tx
          .update(paymentAttempts)
          .set({ status: "failed", failureReason: ev.failureReason ?? "Payment failed", closedAt: now, updatedAt: now })
          .where(eq(paymentAttempts.id, attempt.id));
      }
      if (ev.payment) {
        await tx
          .update(payments)
          .set({ status: "failed", updatedAt: now })
          .where(and(eq(payments.provider, ev.provider), eq(payments.providerPaymentId, ev.payment.providerPaymentId), eq(payments.status, "processing")));
      }
      if (order.paymentStatus === "unpaid" || order.paymentStatus === "processing") {
        const stillHeld = order.reservationExpiresAt && order.reservationExpiresAt > now && order.paymentStatus === "unpaid";
        if (stillHeld) {
          await addOrderEvent(tx, order.id, "payment_failed", `Payment attempt failed (${ev.failureReason ?? "declined"}). The customer can try again.`);
        } else {
          await tx.update(orders).set({ paymentStatus: "failed", updatedAt: now }).where(eq(orders.id, order.id));
          await releaseReservations(tx, order.id);
          await addOrderEvent(tx, order.id, "payment_failed", `Payment failed (${ev.failureReason ?? "declined"}). Stock released.`);
        }
      }
      return { status: "processed", orderId: order.id };
    }
    case "checkout_expired":
    case "checkout_cancelled": {
      if (attempt.status === "open" || attempt.status === "creating" || attempt.status === "approved") {
        await tx
          .update(paymentAttempts)
          .set({ status: ev.kind === "checkout_expired" ? "expired" : "cancelled", closedAt: now, updatedAt: now })
          .where(eq(paymentAttempts.id, attempt.id));
        await addOrderEvent(tx, order.id, ev.kind, ev.kind === "checkout_expired" ? "Checkout session expired." : "Checkout cancelled by the customer.");
      }
      return { status: "processed", orderId: order.id };
    }
    case "checkout_approved": {
      if (attempt.status === "open") {
        await tx.update(paymentAttempts).set({ status: "approved", updatedAt: now }).where(eq(paymentAttempts.id, attempt.id));
      }
      // Approval is NOT payment. Capture server-side (idempotent job) and wait for the result.
      if (attempt.status === "open" || attempt.status === "approved") {
        await enqueue(tx, { type: "payment.capture_paypal", payload: { attemptId: attempt.id }, dedupeKey: `capture:${attempt.id}`, orderId: order.id });
      }
      return { status: "processed", orderId: order.id };
    }
    case "dispute_opened": {
      await tx
        .update(orders)
        .set({ ...addReview(order, { code: "dispute", message: "The payment is disputed at the provider.", blocksFulfillment: order.fulfillmentStatus !== "shipped" && order.fulfillmentStatus !== "delivered" }), updatedAt: now })
        .where(eq(orders.id, order.id));
      await addOrderEvent(tx, order.id, "dispute_opened", "A dispute was opened at the payment provider.");
      return { status: "processed", orderId: order.id };
    }
    default:
      return { status: "ignored", orderId: order.id };
  }
}

async function recordSuccess(tx: Tx, order: OrderRow, attempt: AttemptRow, p: VerifiedPayment, ev: NormalizedEvent): Promise<EventOutcome> {
  const now = new Date();
  const [existing] = await tx
    .select()
    .from(payments)
    .where(and(eq(payments.provider, ev.provider), eq(payments.providerPaymentId, p.providerPaymentId)))
    .for("update");
  if (existing && existing.status !== "processing") {
    return { status: "processed", orderId: order.id, note: "Payment already recorded" };
  }

  const problem = verifyPayment(attempt, order, p);
  if (problem) {
    if (existing) {
      await tx.update(payments).set({ status: "mismatch", amountMinor: p.amountMinor, currency: p.currency.toUpperCase(), updatedAt: now }).where(eq(payments.id, existing.id));
    } else {
      await tx.insert(payments).values({ orderId: order.id, attemptId: attempt.id, provider: ev.provider, providerPaymentId: p.providerPaymentId, status: "mismatch", amountMinor: p.amountMinor, currency: p.currency.toUpperCase(), capturedAt: p.capturedAt ?? now, details: p.details ?? null });
    }
    await tx
      .update(paymentAttempts)
      .set({ status: "failed", failureReason: problem.message, closedAt: now, updatedAt: now })
      .where(eq(paymentAttempts.id, attempt.id));
    await tx.update(orders).set({ ...addReview(order, problem), updatedAt: now }).where(eq(orders.id, order.id));
    await addOrderEvent(tx, order.id, "payment_mismatch", `Payment NOT accepted: ${problem.message}`, { providerPaymentId: p.providerPaymentId, provider: ev.provider });
    return { status: "processed", orderId: order.id, note: problem.code };
  }

  const [other] = await tx
    .select()
    .from(payments)
    .where(and(eq(payments.orderId, order.id), eq(payments.status, "succeeded"), ne(payments.providerPaymentId, p.providerPaymentId)));
  if (other) {
    // A second successful capture for the same order: record it, flag it, ship nothing extra.
    if (existing) {
      await tx.update(payments).set({ status: "duplicate", updatedAt: now }).where(eq(payments.id, existing.id));
    } else {
      await tx.insert(payments).values({ orderId: order.id, attemptId: attempt.id, provider: ev.provider, providerPaymentId: p.providerPaymentId, status: "duplicate", amountMinor: p.amountMinor, currency: p.currency.toUpperCase(), capturedAt: p.capturedAt ?? now, details: p.details ?? null });
    }
    await tx.update(paymentAttempts).set({ status: "succeeded", closedAt: now, updatedAt: now }).where(eq(paymentAttempts.id, attempt.id));
    await tx
      .update(orders)
      .set({ ...addReview(order, { code: "duplicate_capture", message: `Second successful payment ${p.providerPaymentId} (${ev.provider}). Refund it; do not ship twice.`, blocksFulfillment: false }), updatedAt: now })
      .where(eq(orders.id, order.id));
    await addOrderEvent(tx, order.id, "duplicate_capture", "A second successful payment was received and flagged for review.", { providerPaymentId: p.providerPaymentId });
    return { status: "processed", orderId: order.id, note: "duplicate_capture" };
  }

  if (existing) {
    await tx.update(payments).set({ status: "succeeded", capturedAt: p.capturedAt ?? now, updatedAt: now, details: p.details ?? existing.details }).where(eq(payments.id, existing.id));
  } else {
    await tx.insert(payments).values({ orderId: order.id, attemptId: attempt.id, provider: ev.provider, providerPaymentId: p.providerPaymentId, status: "succeeded", amountMinor: p.amountMinor, currency: p.currency.toUpperCase(), capturedAt: p.capturedAt ?? now, details: p.details ?? null });
  }
  await tx.update(paymentAttempts).set({ status: "succeeded", closedAt: now, updatedAt: now }).where(eq(paymentAttempts.id, attempt.id));
  // Any other attempt still marked active can no longer be allowed to charge.
  await tx
    .update(paymentAttempts)
    .set({ status: "superseded", closedAt: now, updatedAt: now })
    .where(and(eq(paymentAttempts.orderId, order.id), ne(paymentAttempts.id, attempt.id), inArray(paymentAttempts.status, [...ACTIVE_ATTEMPT])));

  const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, order.id));
  const stocked = lines.filter((l) => l.fulfillmentMode === "stocked" && l.skuId).map((l) => ({ skuId: l.skuId!, qty: l.qty }));
  const { oversold } = await commitStock(tx, order.id, stocked);
  const late = order.paymentStatus === "expired" || order.paymentStatus === "cancelled" || order.paymentStatus === "failed";
  let review: { reviewStatus?: "needs_review"; reviewReasons?: ReviewReason[] } = {};
  if (p.shippingAddress && !sameAddress(p.shippingAddress, order.shippingAddress)) {
    review = addReview(order, { code: "address_mismatch", message: "The provider shows a differently formatted address for the same destination. Check the label before shipping.", blocksFulfillment: false });
  }
  if (oversold.length) {
    review = addReview({ reviewReasons: review.reviewReasons ?? order.reviewReasons }, {
      code: "late_payment_oversold",
      message: `Paid after the stock hold ended and ${oversold.length} SKU(s) are no longer available. Restock or refund before fulfilling.`,
      blocksFulfillment: true,
    });
  }
  await tx
    .update(orders)
    .set({ paymentStatus: "paid", paidAt: p.capturedAt ?? now, reservationExpiresAt: null, updatedAt: now, ...review })
    .where(eq(orders.id, order.id));
  if (order.discountCode) {
    await tx.update(discountCodes).set({ usedCount: sql`${discountCodes.usedCount} + 1` }).where(eq(discountCodes.code, order.discountCode));
  }
  if (order.cartId) {
    // Empty the bag only if it still points at this order.
    const [cart] = await tx.select().from(carts).where(eq(carts.id, order.cartId)).for("update");
    if (cart && cart.pendingOrderId === order.id) {
      await tx.delete(cartLines).where(eq(cartLines.cartId, cart.id));
      await tx.update(carts).set({ pendingOrderId: null, discountCode: null, updatedAt: now }).where(eq(carts.id, cart.id));
    }
  }
  await enqueue(tx, { type: "email.order_confirmation", payload: { orderId: order.id }, dedupeKey: `email:order_confirmation:${order.id}`, orderId: order.id });
  await enqueue(tx, { type: "fulfillment.prepare", payload: { orderId: order.id }, dedupeKey: `fulfillment:prepare:${order.id}`, orderId: order.id });
  await addOrderEvent(
    tx,
    order.id,
    "payment_succeeded",
    `Payment verified (${ev.provider}, ${p.providerPaymentId}).${late ? " Received after the order had lapsed." : ""}${oversold.length ? " Flagged: stock no longer available." : ""}`,
    { provider: ev.provider, providerPaymentId: p.providerPaymentId, amountMinor: p.amountMinor, currency: p.currency },
  );
  return { status: "processed", orderId: order.id };
}

async function applyRefundUpdate(tx: Tx, ev: NormalizedEvent): Promise<EventOutcome> {
  const r = ev.refund;
  if (!r) return { status: "ignored", note: "No refund details" };
  let [refund] = await tx
    .select()
    .from(refunds)
    .where(and(eq(refunds.provider, ev.provider), eq(refunds.providerRefundId, r.providerRefundId)))
    .for("update");
  if (!refund && r.ourRefundId && /^[0-9a-f-]{36}$/i.test(r.ourRefundId)) {
    // Our own refund whose API response hasn't been stored yet (the webhook won the race).
    const [mine] = await tx.select().from(refunds).where(and(eq(refunds.id, r.ourRefundId), eq(refunds.provider, ev.provider))).for("update");
    if (mine && (mine.providerRefundId === null || mine.providerRefundId === r.providerRefundId)) {
      await tx.update(refunds).set({ providerRefundId: r.providerRefundId, updatedAt: new Date() }).where(eq(refunds.id, mine.id));
      refund = { ...mine, providerRefundId: r.providerRefundId };
    }
  }
  if (!refund) {
    if (!r.providerPaymentId) return { status: "ignored", note: "Unknown refund" };
    const [payment] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.provider, ev.provider), eq(payments.providerPaymentId, r.providerPaymentId)));
    if (!payment) return { status: "ignored", note: "Refund for unknown payment" };
    await lockOrder(tx, payment.orderId);
    // A refund made directly in the provider dashboard: record it so books stay right.
    [refund] = await tx
      .insert(refunds)
      .values({
        orderId: payment.orderId,
        paymentId: payment.id,
        provider: ev.provider,
        providerRefundId: r.providerRefundId,
        amountMinor: r.amountMinor,
        currency: r.currency.toUpperCase(),
        status: r.status,
        reason: "Refunded at the payment provider",
        idempotencyKey: `provider:${ev.provider}:${r.providerRefundId}`,
        requestedBy: `${ev.provider} dashboard`,
      })
      .onConflictDoNothing()
      .returning();
    if (!refund) return { status: "processed", note: "Refund already recorded" };
    await addOrderEvent(tx, payment.orderId, "refund_recorded", `Refund ${r.providerRefundId} recorded from ${ev.provider}.`, { amountMinor: r.amountMinor });
  } else {
    await lockOrder(tx, refund.orderId);
    if (refund.status !== r.status) {
      await tx.update(refunds).set({ status: r.status, updatedAt: new Date() }).where(eq(refunds.id, refund.id));
      await addOrderEvent(tx, refund.orderId, "refund_updated", `Refund ${r.providerRefundId} is now ${r.status}.`);
    }
  }
  if (r.status === "succeeded") {
    await enqueue(tx, { type: "email.refunded", payload: { refundId: refund.id }, dedupeKey: `email:refunded:${refund.id}`, orderId: refund.orderId });
  }
  await recomputeRefundStatus(tx, refund.orderId);
  return { status: "processed", orderId: refund.orderId };
}

export async function recomputeRefundStatus(tx: Tx, orderId: string) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return;
  const rows = await tx
    .select({ status: refunds.status, amount: refunds.amountMinor, paymentStatus: payments.status })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .where(eq(refunds.orderId, orderId));
  const primary = rows.filter((r) => r.paymentStatus === "succeeded");
  const pending = primary.some((r) => r.status === "pending");
  const refunded = primary.filter((r) => r.status === "succeeded").reduce((s, r) => s + r.amount, 0);
  const next = pending ? "pending" : refunded >= order.totalMinor && refunded > 0 ? "refunded" : refunded > 0 ? "partially_refunded" : "none";
  if (next !== order.refundStatus) {
    await tx.update(orders).set({ refundStatus: next, updatedAt: new Date() }).where(eq(orders.id, orderId));
  }
}

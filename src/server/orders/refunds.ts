import "../guard";
import { and, eq, inArray, sql } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "../db";
import { orders, payments, refunds } from "../db/schema";
import { audit, type Actor } from "../audit";
import { enqueue } from "../jobs/queue";
import { getProvider } from "../payments";
import { ProviderError } from "../payments/types";
import { addOrderEvent, recomputeRefundStatus } from "./transitions";

/**
 * Provider-backed refunds. The amount is checked against what is still refundable
 * while the order row is locked, the refund row is written before the provider is
 * called, and the provider call reuses the same idempotency key — so double
 * clicks, retries and concurrent admins cannot refund twice.
 */

export type RefundOutcome = { ok: true; refundId: string; status: "pending" | "succeeded" | "failed" } | { ok: false; error: string };

export async function issueRefund(
  input: { orderId: string; paymentId?: string | null; amountMinor: number; reason: string; note?: string | null; idempotencyKey: string; returnId?: string | null },
  actor: Actor,
): Promise<RefundOutcome> {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) return { ok: false, error: "Enter an amount greater than zero." };
  if (!/^[A-Za-z0-9:_-]{8,120}$/.test(input.idempotencyKey)) return { ok: false, error: "Invalid request key." };

  const phase1 = await db().transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update");
    if (!order) return { ok: false as const, error: "Order not found." };
    const [same] = await tx.select().from(refunds).where(eq(refunds.idempotencyKey, input.idempotencyKey));
    if (same) return { ok: true as const, refund: same, existing: true };
    const payRows = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.orderId, order.id), inArray(payments.status, ["succeeded", "duplicate"])));
    const payment = input.paymentId ? payRows.find((p) => p.id === input.paymentId) : payRows.find((p) => p.status === "succeeded");
    if (!payment) return { ok: false as const, error: "There is no captured payment to refund on this order." };
    const [{ used }] = (await tx
      .select({ used: sql<number>`coalesce(sum(${refunds.amountMinor}), 0)` })
      .from(refunds)
      .where(and(eq(refunds.paymentId, payment.id), inArray(refunds.status, ["pending", "succeeded"])))) as [{ used: number }];
    const refundable = payment.amountMinor - Number(used);
    if (input.amountMinor > refundable) {
      return { ok: false as const, error: `Only ${refundable} minor units (${(refundable / 100).toFixed(2)} ${payment.currency}) can still be refunded on this payment.` };
    }
    const [refund] = await tx
      .insert(refunds)
      .values({
        orderId: order.id,
        paymentId: payment.id,
        provider: payment.provider,
        amountMinor: input.amountMinor,
        currency: payment.currency,
        status: "pending",
        reason: input.reason,
        note: input.note ?? null,
        idempotencyKey: input.idempotencyKey,
        requestedBy: actor.email,
        returnId: input.returnId ?? null,
      })
      .returning();
    await recomputeRefundStatus(tx, order.id);
    await audit(tx, actor, "refund.request", "order", order.id, `Refund ${(input.amountMinor / 100).toFixed(2)} ${payment.currency} requested (${input.reason})`, { refundId: refund!.id, paymentId: payment.id });
    await addOrderEvent(tx, order.id, "refund_requested", `Refund of ${(input.amountMinor / 100).toFixed(2)} ${payment.currency} requested by ${actor.email}.`, { refundId: refund!.id }, actor.email);
    return { ok: true as const, refund: refund!, existing: false };
  });
  if (!phase1.ok) return phase1;
  if (phase1.existing && phase1.refund.status !== "pending") return { ok: true, refundId: phase1.refund.id, status: phase1.refund.status === "cancelled" ? "failed" : phase1.refund.status };
  return callProvider(phase1.refund.id, actor);
}

/** Calls (or re-calls, with the same idempotency key) the provider for a pending refund. */
export async function callProvider(refundId: string, actor: Actor): Promise<RefundOutcome> {
  const [refund] = await db().select().from(refunds).where(eq(refunds.id, refundId));
  if (!refund) return { ok: false, error: "Refund not found." };
  if (refund.status !== "pending") return { ok: true, refundId, status: refund.status === "cancelled" ? "failed" : refund.status };
  const [payment] = await db().select().from(payments).where(eq(payments.id, refund.paymentId));
  if (!payment) return { ok: false, error: "Payment not found." };
  try {
    const res = await getProvider(payment.provider).refund(payment, refund.amountMinor, refund.idempotencyKey, refund.reason, refund.id);
    let finalStatus: "pending" | "succeeded" | "failed" = res.status;
    await db().transaction(async (tx) => {
      await tx.select().from(orders).where(eq(orders.id, refund.orderId)).for("update");
      const [cur] = await tx.select().from(refunds).where(eq(refunds.id, refund.id)).for("update");
      // A webhook may already have moved this refund on; never move it backwards.
      if (cur && cur.status !== "pending") finalStatus = cur.status === "cancelled" ? "failed" : cur.status;
      await tx
        .update(refunds)
        .set({ providerRefundId: res.providerRefundId, status: cur && cur.status !== "pending" ? cur.status : res.status, failureReason: res.failureReason ?? null, updatedAt: new Date() })
        .where(eq(refunds.id, refund.id));
      if (finalStatus === "succeeded") {
        await enqueue(tx, { type: "email.refunded", payload: { refundId: refund.id }, dedupeKey: `email:refunded:${refund.id}`, orderId: refund.orderId });
      }
      await recomputeRefundStatus(tx, refund.orderId);
      await audit(tx, actor, "refund.provider_result", "order", refund.orderId, `Provider refund ${res.providerRefundId}: ${res.status}`, { refundId: refund.id });
      await addOrderEvent(tx, refund.orderId, "refund_result", `Refund ${res.providerRefundId} is ${res.status}.`, { refundId: refund.id });
    });
    return { ok: true, refundId: refund.id, status: finalStatus };
  } catch (err) {
    const definitive = (err instanceof ProviderError && !err.retryable) || err instanceof Stripe.errors.StripeInvalidRequestError || err instanceof Stripe.errors.StripeCardError;
    await db().transaction(async (tx) => {
      await tx
        .update(refunds)
        .set({
          status: definitive ? "failed" : "pending",
          failureReason: `${definitive ? "Rejected" : "No confirmation yet (retry uses the same key)"}: ${(err as Error).message}`.slice(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(refunds.id, refund.id));
      await recomputeRefundStatus(tx, refund.orderId);
      await audit(tx, actor, "refund.error", "order", refund.orderId, `Refund call failed: ${(err as Error).message}`, { refundId: refund.id, definitive });
    });
    return definitive ? { ok: false, error: `The provider rejected the refund: ${(err as Error).message}` } : { ok: false, error: "The provider didn't confirm the refund yet. It is still pending — retry it from the order page (it reuses the same key, so it cannot double-refund)." };
  }
}

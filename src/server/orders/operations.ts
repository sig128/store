import "../guard";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db, type Tx } from "../db";
import { fulfillmentRequests, orderLines, orders, paymentAttempts, returnLines, returns, shipmentLines, shipments } from "../db/schema";
import { audit, type Actor } from "../audit";
import { moveStock, releaseReservations } from "../inventory";
import { enqueue } from "../jobs/queue";
import { trackingUrlFor } from "@/config/carriers";
import { ACTIVE_ATTEMPT, addOrderEvent, blocksFulfillment } from "./transitions";
import { closeAttempt } from "./payment-ops";
import { issueRefund } from "./refunds";
import type { FulfillmentStatus, ReviewReason } from "@/lib/types";

/** Operator actions on orders: fulfilment, tracking, cancellation, returns/exchanges, review flags. */

export class OpError extends Error {}

async function lock(tx: Tx, orderId: string) {
  const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  if (!o) throw new OpError("Order not found.");
  return o;
}

const NEXT: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  unfulfilled: ["in_production", "packed", "cancelled"],
  in_production: ["packed", "cancelled"],
  packed: ["shipped", "in_production"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export async function setFulfillment(orderId: string, to: "in_production" | "packed" | "delivered", actor: Actor) {
  await db().transaction(async (tx) => {
    const o = await lock(tx, orderId);
    if (o.paymentStatus !== "paid") throw new OpError("Only paid orders can be fulfilled.");
    if (blocksFulfillment(o)) throw new OpError("This order is flagged for review. Resolve the flag before fulfilling it.");
    if (!NEXT[o.fulfillmentStatus].includes(to)) throw new OpError(`Can't move from ${o.fulfillmentStatus} to ${to}.`);
    await tx.update(orders).set({ fulfillmentStatus: to, updatedAt: new Date() }).where(eq(orders.id, orderId));
    if (to === "packed") {
      const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, orderId));
      const [existing] = await tx.select().from(shipments).where(and(eq(shipments.orderId, orderId), eq(shipments.kind, "original")));
      if (!existing) {
        const [sh] = await tx.insert(shipments).values({ orderId, kind: "original", status: "packed", packedAt: new Date(), createdBy: actor.email }).returning();
        await tx.insert(shipmentLines).values(lines.map((l) => ({ shipmentId: sh!.id, orderLineId: l.id, skuId: l.skuId, description: `${l.productName} — ${l.variantLabel}, ${l.size}`, qty: l.qty })));
      }
    }
    if (to === "delivered") {
      await tx.update(shipments).set({ status: "delivered", deliveredAt: new Date(), updatedAt: new Date() }).where(and(eq(shipments.orderId, orderId), eq(shipments.status, "shipped")));
    }
    await audit(tx, actor, `fulfilment.${to}`, "order", orderId, `Marked ${o.number} ${to.replace("_", " ")}`);
    await addOrderEvent(tx, orderId, `fulfilment_${to}`, `Marked ${to.replace("_", " ")} by ${actor.email}.`, undefined, actor.email);
  });
}

export async function markShipped(
  orderId: string,
  input: { carrierId: string; carrierName: string; trackingNumber: string | null; trackingUrl: string | null; notify: boolean },
  actor: Actor,
) {
  return db().transaction(async (tx) => {
    const o = await lock(tx, orderId);
    if (o.paymentStatus !== "paid") throw new OpError("Only paid orders can ship.");
    if (blocksFulfillment(o)) throw new OpError("This order is flagged for review. Resolve the flag before shipping.");
    if (!["packed", "in_production", "unfulfilled"].includes(o.fulfillmentStatus)) throw new OpError(`Order is ${o.fulfillmentStatus}.`);
    const tracking = input.trackingNumber?.trim() || null;
    const url = input.trackingUrl?.trim() || (tracking ? trackingUrlFor(input.carrierId, tracking) : null);
    if (url && !/^https:\/\//.test(url)) throw new OpError("Tracking URL must start with https://");
    let [sh] = await tx.select().from(shipments).where(and(eq(shipments.orderId, orderId), eq(shipments.kind, "original")));
    if (!sh) {
      const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, orderId));
      [sh] = await tx.insert(shipments).values({ orderId, kind: "original", status: "packed", packedAt: new Date(), createdBy: actor.email }).returning();
      await tx.insert(shipmentLines).values(lines.map((l) => ({ shipmentId: sh!.id, orderLineId: l.id, skuId: l.skuId, description: `${l.productName} — ${l.variantLabel}, ${l.size}`, qty: l.qty })));
    }
    await tx
      .update(shipments)
      .set({ status: "shipped", carrier: input.carrierName, trackingNumber: tracking, trackingUrl: url, shippedAt: new Date(), updatedAt: new Date() })
      .where(eq(shipments.id, sh!.id));
    await tx.update(orders).set({ fulfillmentStatus: "shipped", updatedAt: new Date() }).where(eq(orders.id, orderId));
    if (input.notify) {
      await enqueue(tx, { type: "email.shipped", payload: { shipmentId: sh!.id }, dedupeKey: `email:shipped:${sh!.id}`, orderId });
    }
    await audit(tx, actor, "fulfilment.shipped", "order", orderId, `Shipped ${o.number} with ${input.carrierName}${tracking ? ` (${tracking})` : ""}`, { notify: input.notify });
    await addOrderEvent(tx, orderId, "shipped", `Shipped with ${input.carrierName}${tracking ? `, tracking ${tracking}` : ""}.${input.notify ? " Customer notified." : ""}`, undefined, actor.email);
    return sh!.id;
  });
}

/** Operator records that they placed the supplier order themselves (manual flow). */
export async function recordSupplierOrder(orderId: string, reference: string, actor: Actor) {
  if (!reference.trim()) throw new OpError("Enter the supplier's order reference.");
  await db().transaction(async (tx) => {
    const o = await lock(tx, orderId);
    await tx
      .insert(fulfillmentRequests)
      .values({ orderId, provider: "manual", status: "confirmed", providerRef: reference.trim(), payload: {}, confirmedAt: new Date(), submittedAt: new Date() })
      .onConflictDoUpdate({ target: [fulfillmentRequests.orderId, fulfillmentRequests.provider], set: { status: "confirmed", providerRef: reference.trim(), confirmedAt: new Date(), updatedAt: new Date() } });
    await audit(tx, actor, "fulfilment.supplier_order", "order", orderId, `Supplier order reference recorded for ${o.number}: ${reference.trim()}`);
    await addOrderEvent(tx, orderId, "supplier_order", `Supplier order placed manually (ref ${reference.trim()}).`, undefined, actor.email);
  });
}

export async function resolveReview(orderId: string, index: number, note: string, actor: Actor) {
  await db().transaction(async (tx) => {
    const o = await lock(tx, orderId);
    const reasons: ReviewReason[] = [...(o.reviewReasons ?? [])];
    const r = reasons[index];
    if (!r || r.resolvedAt) throw new OpError("That flag is not open.");
    reasons[index] = { ...r, resolvedAt: new Date().toISOString(), resolvedBy: actor.email };
    const open = reasons.some((x) => !x.resolvedAt);
    await tx.update(orders).set({ reviewReasons: reasons, reviewStatus: open ? "needs_review" : "clear", updatedAt: new Date() }).where(eq(orders.id, orderId));
    await audit(tx, actor, "review.resolve", "order", orderId, `Resolved flag "${r.code}": ${note}`);
    await addOrderEvent(tx, orderId, "review_resolved", `Flag ${r.code} resolved by ${actor.email}: ${note}`, undefined, actor.email);
  });
}

/**
 * Cancel an order before it ships. Unpaid: close any live attempt and release stock.
 * Paid: put stock back and refund the full amount through the provider.
 */
export async function cancelOrder(orderId: string, reason: string, actor: Actor, idempotencyKey: string) {
  const [o0] = await db().select().from(orders).where(eq(orders.id, orderId));
  if (!o0) throw new OpError("Order not found.");
  if (o0.paymentStatus === "unpaid" || o0.paymentStatus === "processing") {
    const live = await db().select().from(paymentAttempts).where(and(eq(paymentAttempts.orderId, orderId), inArray(paymentAttempts.status, [...ACTIVE_ATTEMPT])));
    for (const a of live) {
      const r = await closeAttempt(a.id, "order cancelled by staff");
      if (r === "paid") throw new OpError("A payment just completed for this order. Reload and refund it instead.");
      if (r === "error") throw new OpError("Couldn't confirm the payment attempt is closed. Try again.");
    }
    await db().transaction(async (tx) => {
      const o = await lock(tx, orderId);
      if (o.paymentStatus === "paid") throw new OpError("A payment just completed for this order.");
      await tx.update(orders).set({ paymentStatus: "cancelled", fulfillmentStatus: "cancelled", cancelledAt: new Date(), updatedAt: new Date() }).where(eq(orders.id, orderId));
      await releaseReservations(tx, orderId);
      await audit(tx, actor, "order.cancel", "order", orderId, `Cancelled unpaid order ${o.number}: ${reason}`);
      await addOrderEvent(tx, orderId, "cancelled", `Cancelled by ${actor.email}: ${reason}`, undefined, actor.email);
    });
    return;
  }
  if (o0.paymentStatus !== "paid") throw new OpError(`Order is ${o0.paymentStatus}.`);
  if (o0.fulfillmentStatus === "shipped" || o0.fulfillmentStatus === "delivered") throw new OpError("Shipped orders are handled as returns, not cancellations.");
  await db().transaction(async (tx) => {
    const o = await lock(tx, orderId);
    if (o.fulfillmentStatus === "cancelled") return;
    const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, orderId));
    for (const l of lines) {
      if (l.fulfillmentMode === "stocked" && l.skuId) {
        await moveStock(tx, { skuId: l.skuId, delta: l.qty, reason: "sale_reversal", actor: actor.email, orderId, note: `Cancelled ${o.number}` });
      }
    }
    await tx.update(orders).set({ fulfillmentStatus: "cancelled", cancelledAt: new Date(), updatedAt: new Date() }).where(eq(orders.id, orderId));
    await enqueue(tx, { type: "email.cancelled", payload: { orderId, reason, refunded: true }, dedupeKey: `email:cancelled:${orderId}`, orderId });
    await audit(tx, actor, "order.cancel", "order", orderId, `Cancelled paid order ${o.number}: ${reason}`);
    await addOrderEvent(tx, orderId, "cancelled", `Cancelled by ${actor.email}: ${reason}. Stock returned.`, undefined, actor.email);
  });
  const res = await issueRefund({ orderId, amountMinor: o0.totalMinor, reason: `Order cancelled: ${reason}`, idempotencyKey }, actor);
  if (!res.ok) throw new OpError(`Order cancelled, but the refund needs attention: ${res.error}`);
}

/* ───────────── returns & exchanges ───────────── */

export async function createReturn(
  input: { orderId: string; type: "return" | "exchange"; reason: string; customerNote?: string | null; lines: { orderLineId: string; qty: number; exchangeSkuId?: string | null }[] },
  actor: Actor,
): Promise<string> {
  if (!input.lines.length) throw new OpError("Choose at least one item.");
  return db().transaction(async (tx) => {
    const o = await lock(tx, input.orderId);
    if (o.paymentStatus !== "paid") throw new OpError("Returns are only possible on paid orders.");
    const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, o.id));
    const previous = await tx
      .select({ orderLineId: returnLines.orderLineId, qty: returnLines.qty })
      .from(returnLines)
      .innerJoin(returns, eq(returns.id, returnLines.returnId))
      .where(and(eq(returns.orderId, o.id), ne(returns.status, "rejected")));
    for (const rl of input.lines) {
      const ol = lines.find((l) => l.id === rl.orderLineId);
      if (!ol) throw new OpError("Unknown order line.");
      const already = previous.filter((p) => p.orderLineId === ol.id).reduce((n, p) => n + p.qty, 0);
      if (rl.qty < 1 || rl.qty + already > ol.qty) throw new OpError(`${ol.productName} ${ol.size}: at most ${ol.qty - already} can be returned.`);
      if (input.type === "exchange" && !rl.exchangeSkuId) throw new OpError("Choose the replacement size for each exchanged item.");
    }
    const seq = await tx.execute<{ n: string }>(sql`select nextval('rma_number_seq') as n`);
    const [r] = await tx
      .insert(returns)
      .values({ orderId: o.id, rmaNumber: `RMA-${seq.rows[0]!.n}`, type: input.type, reason: input.reason, customerNote: input.customerNote ?? null, createdBy: actor.email })
      .returning();
    await tx.insert(returnLines).values(input.lines.map((l) => ({ returnId: r!.id, orderLineId: l.orderLineId, qty: l.qty, exchangeSkuId: l.exchangeSkuId ?? null })));
    await tx.update(orders).set({ returnStatus: "open", updatedAt: new Date() }).where(eq(orders.id, o.id));
    await audit(tx, actor, `return.create`, "order", o.id, `${r!.rmaNumber} (${input.type}) opened for ${o.number}: ${input.reason}`);
    await addOrderEvent(tx, o.id, "return_opened", `${r!.rmaNumber} (${input.type}) opened.`, { returnId: r!.id }, actor.email);
    return r!.id;
  });
}

export async function receiveReturn(returnId: string, lines: { returnLineId: string; condition: string; restock: boolean }[], actor: Actor) {
  await db().transaction(async (tx) => {
    const [r] = await tx.select().from(returns).where(eq(returns.id, returnId)).for("update");
    if (!r) throw new OpError("Return not found.");
    if (r.status !== "requested") throw new OpError(`Return is already ${r.status}.`);
    const rls = await tx.select({ rl: returnLines, ol: orderLines }).from(returnLines).innerJoin(orderLines, eq(orderLines.id, returnLines.orderLineId)).where(eq(returnLines.returnId, returnId));
    for (const x of rls) {
      const input = lines.find((l) => l.returnLineId === x.rl.id);
      const restock = Boolean(input?.restock) && x.ol.fulfillmentMode === "stocked" && !x.ol.personalization && Boolean(x.ol.skuId);
      await tx.update(returnLines).set({ condition: input?.condition ?? null, restock }).where(eq(returnLines.id, x.rl.id));
      if (restock) await moveStock(tx, { skuId: x.ol.skuId!, delta: x.rl.qty, reason: "return_restock", actor: actor.email, orderId: r.orderId, returnId, note: `${r.rmaNumber} received` });
    }
    await tx.update(returns).set({ status: "received", receivedAt: new Date(), updatedAt: new Date() }).where(eq(returns.id, returnId));
    await audit(tx, actor, "return.receive", "order", r.orderId, `${r.rmaNumber} received`);
    await addOrderEvent(tx, r.orderId, "return_received", `${r.rmaNumber} received.`, { returnId }, actor.email);
  });
}

export async function shipExchange(returnId: string, input: { carrierId: string; carrierName: string; trackingNumber: string | null; notify: boolean }, actor: Actor) {
  return db().transaction(async (tx) => {
    const [r] = await tx.select().from(returns).where(eq(returns.id, returnId)).for("update");
    if (!r || r.type !== "exchange") throw new OpError("Exchange not found.");
    const [existing] = await tx.select().from(shipments).where(eq(shipments.returnId, returnId));
    if (existing) throw new OpError("The replacement has already shipped.");
    await lock(tx, r.orderId);
    const rls = await tx.select({ rl: returnLines, ol: orderLines }).from(returnLines).innerJoin(orderLines, eq(orderLines.id, returnLines.orderLineId)).where(eq(returnLines.returnId, returnId));
    const tracking = input.trackingNumber?.trim() || null;
    const [sh] = await tx
      .insert(shipments)
      .values({ orderId: r.orderId, kind: "replacement", returnId, status: "shipped", carrier: input.carrierName, trackingNumber: tracking, trackingUrl: tracking ? trackingUrlFor(input.carrierId, tracking) : null, packedAt: new Date(), shippedAt: new Date(), createdBy: actor.email })
      .returning();
    for (const x of rls) {
      if (!x.rl.exchangeSkuId) continue;
      await moveStock(tx, { skuId: x.rl.exchangeSkuId, delta: -x.rl.qty, reason: "exchange_out", actor: actor.email, orderId: r.orderId, returnId, note: `${r.rmaNumber} replacement` });
      await tx.insert(shipmentLines).values({ shipmentId: sh!.id, orderLineId: x.ol.id, skuId: x.rl.exchangeSkuId, description: `Exchange for ${x.ol.productName} ${x.ol.size}`, qty: x.rl.qty });
    }
    if (input.notify) await enqueue(tx, { type: "email.shipped", payload: { shipmentId: sh!.id }, dedupeKey: `email:shipped:${sh!.id}`, orderId: r.orderId });
    await audit(tx, actor, "return.exchange_shipped", "order", r.orderId, `${r.rmaNumber} replacement shipped`);
    await addOrderEvent(tx, r.orderId, "exchange_shipped", `${r.rmaNumber} replacement shipped.`, undefined, actor.email);
    return sh!.id;
  });
}

export async function closeReturn(returnId: string, status: "closed" | "rejected", note: string, actor: Actor) {
  await db().transaction(async (tx) => {
    const [r] = await tx.select().from(returns).where(eq(returns.id, returnId)).for("update");
    if (!r) throw new OpError("Return not found.");
    await tx.update(returns).set({ status, closedAt: new Date(), internalNote: note || r.internalNote, updatedAt: new Date() }).where(eq(returns.id, returnId));
    const open = await tx.select({ id: returns.id }).from(returns).where(and(eq(returns.orderId, r.orderId), inArray(returns.status, ["requested", "received"]), ne(returns.id, returnId)));
    if (!open.length) await tx.update(orders).set({ returnStatus: "closed", updatedAt: new Date() }).where(eq(orders.id, r.orderId));
    await audit(tx, actor, `return.${status}`, "order", r.orderId, `${r.rmaNumber} ${status}${note ? `: ${note}` : ""}`);
    await addOrderEvent(tx, r.orderId, `return_${status}`, `${r.rmaNumber} ${status}.`, undefined, actor.email);
  });
}

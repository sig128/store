import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/server/db";
import { orderAccessTokens, refunds } from "@/server/db/schema";
import { issueRefund } from "@/server/orders/refunds";
import { handleProviderEvent } from "@/server/orders/transitions";
import { issueOrderToken, redeemOrderToken, decodeGrant, encodeGrant } from "@/server/orders/access";
import { setProvidersForTesting } from "@/server/payments";
import { SimulatorProvider } from "@/server/payments/simulator";
import type { PaymentRow, RefundResult } from "@/server/payments/types";
import { checkout, event, newCart, paymentFor, reload, send, setStock } from "../helpers";

const actor = { id: "test", email: "refunds@test.invalid", role: "owner" };

async function paidOrder(code = "AH-ASPH-M") {
  await setStock(code, 5);
  const { cart, token } = await newCart([{ code }]);
  const { order, attempt } = await checkout(token, cart.id);
  await send(event(attempt!, "payment_succeeded", { payment: paymentFor(attempt!) }));
  return reload(order!.id);
}

afterEach(() => setProvidersForTesting(null));
afterAll(async () => {
  await closeDb();
});

describe("provider-backed refunds", () => {
  it("the same request key never refunds twice", async () => {
    const o = await paidOrder();
    const a = await issueRefund({ orderId: o.id, amountMinor: 10000, reason: "requested_by_customer", idempotencyKey: `refund:${o.id}:k1` }, actor);
    const b = await issueRefund({ orderId: o.id, amountMinor: 10000, reason: "requested_by_customer", idempotencyKey: `refund:${o.id}:k1` }, actor);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.refundId).toBe(a.refundId);
    const rows = await db().select().from(refunds).where(eq(refunds.orderId, o.id));
    expect(rows).toHaveLength(1);
    expect((await reload(o.id)).refundStatus).toBe("partially_refunded");
  });

  it("concurrent refunds with different keys can't exceed what was paid", async () => {
    const o = await paidOrder();
    const [x, y] = await Promise.all([
      issueRefund({ orderId: o.id, amountMinor: o.totalMinor, reason: "requested_by_customer", idempotencyKey: `refund:${o.id}:a` }, actor),
      issueRefund({ orderId: o.id, amountMinor: o.totalMinor, reason: "requested_by_customer", idempotencyKey: `refund:${o.id}:b` }, actor),
    ]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
    const failed = [x, y].find((r) => !r.ok)!;
    if (!failed.ok) expect(failed.error).toMatch(/can still be refunded/);
    const after = await reload(o.id);
    expect(after.refundStatus).toBe("refunded");
    expect(after.paymentStatus).toBe("paid"); // refund status is tracked separately
  });

  it("a refund webhook that beats the API response updates our refund instead of creating a second one", async () => {
    const o = await paidOrder();
    class RacingSim extends SimulatorProvider {
      async refund(payment: PaymentRow, amountMinor: number, _key: string, _reason?: string, ourRefundId?: string): Promise<RefundResult> {
        await handleProviderEvent({
          provider: "simulator",
          eventId: `simevt_refund_${ourRefundId}`,
          type: "refund.updated",
          kind: "refund_updated",
          summary: {},
          refund: { providerRefundId: "simre_race_1", providerPaymentId: payment.providerPaymentId, ourRefundId, amountMinor, currency: payment.currency, status: "succeeded" },
        });
        return { providerRefundId: "simre_race_1", status: "pending" }; // stale answer from the API
      }
    }
    setProvidersForTesting({ simCard: new RacingSim("card") });
    const r = await issueRefund({ orderId: o.id, amountMinor: 5000, reason: "requested_by_customer", idempotencyKey: `refund:${o.id}:race` }, actor);
    expect(r.ok).toBe(true);
    const rows = await db().select().from(refunds).where(eq(refunds.orderId, o.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ providerRefundId: "simre_race_1", status: "succeeded" });
    expect((await reload(o.id)).refundStatus).toBe("partially_refunded");
  });

  it("a refund made in the provider dashboard is recorded once", async () => {
    const o = await paidOrder();
    const [pay] = await db().select().from((await import("@/server/db/schema")).payments).where(eq((await import("@/server/db/schema")).payments.orderId, o.id));
    const ev = {
      provider: "simulator" as const,
      eventId: `simevt_dash_${o.id}`,
      type: "refund.updated",
      kind: "refund_updated" as const,
      summary: {},
      refund: { providerRefundId: `simre_dash_${o.id.slice(0, 8)}`, providerPaymentId: pay!.providerPaymentId, amountMinor: 2500, currency: "NOK", status: "succeeded" as const },
    };
    await handleProviderEvent(ev);
    await handleProviderEvent({ ...ev, eventId: `${ev.eventId}_again` });
    const rows = await db().select().from(refunds).where(eq(refunds.orderId, o.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.requestedBy).toMatch(/dashboard/);
  });
});

describe("guest order access", () => {
  it("order links are random, stored only as a hash, and expire", async () => {
    const o = await paidOrder("AH-ASPH-L");
    const token = await issueOrderToken(db(), o.id, 30);
    const rows = await db().select().from(orderAccessTokens).where(eq(orderAccessTokens.orderId, o.id));
    expect(rows.some((r) => r.tokenHash === token)).toBe(false);
    expect(rows.some((r) => r.tokenHash === createHash("sha256").update(token).digest("hex"))).toBe(true);
    expect(await redeemOrderToken(db(), token)).toMatchObject({ orderId: o.id, number: o.number });
    expect(await redeemOrderToken(db(), "x".repeat(43))).toBeNull();
    expect(await redeemOrderToken(db(), o.number)).toBeNull(); // the order number is not a key

    const old = await issueOrderToken(db(), o.id, 30);
    await db().update(orderAccessTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(orderAccessTokens.tokenHash, createHash("sha256").update(old).digest("hex")));
    expect(await redeemOrderToken(db(), old)).toBeNull();
  });

  it("the access cookie can't be forged, edited or reused after expiry", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const signed = encodeGrant({ orderIds: [id], exp: Date.now() + 60_000 });
    expect(decodeGrant(signed).orderIds).toEqual([id]);
    const mac = signed.slice(signed.lastIndexOf(".") + 1);
    const edited = Buffer.from(JSON.stringify({ orderIds: ["22222222-2222-4222-8222-222222222222"], exp: Date.now() + 60_000 })).toString("base64url");
    expect(decodeGrant(`${edited}.${mac}`).orderIds).toEqual([]);
    expect(decodeGrant(`${signed.slice(0, signed.lastIndexOf("."))}.forged`).orderIds).toEqual([]);
    expect(decodeGrant(encodeGrant({ orderIds: [id], exp: Date.now() - 1 })).orderIds).toEqual([]);
  });
});

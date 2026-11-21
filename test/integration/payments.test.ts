import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "@/server/db";
import { carts, cartLines, jobs, paymentAttempts, payments, products, printTemplates, providerEvents } from "@/server/db/schema";
import { sweepOrders } from "@/server/orders/payment-ops";
import { activeHolds, checkout, event, linesOf, newCart, onHand, paymentFor, reload, send, setStock } from "../helpers";

const jobCount = async (orderId: string, type: string) =>
  Number((await db().select({ n: sql<number>`count(*)` }).from(jobs).where(and(eq(jobs.orderId, orderId), eq(jobs.type, type))))[0]!.n);

afterAll(async () => {
  await closeDb();
});

describe("verified payment → paid, exactly once", () => {
  beforeEach(async () => {
    await setStock("LS-WBLK-M", 5);
  });

  it("marks the order paid only from a verified provider event, and ignores repeats", async () => {
    const { cart, token } = await newCart([{ code: "LS-WBLK-M" }]);
    const { res, order, attempt } = await checkout(token, cart.id);
    expect(res.ok).toBe(true);
    expect(order!.paymentStatus).toBe("unpaid");
    expect(attempt!.status).toBe("open");
    expect(await activeHolds(order!.id)).toHaveLength(1);
    // Reaching the success URL does nothing by itself: the order is still unpaid.
    expect((await reload(order!.id)).paymentStatus).toBe("unpaid");

    const pay = paymentFor(attempt!);
    const ev = event(attempt!, "payment_succeeded", { payment: pay });
    expect((await send(ev)).status).toBe("processed");
    const paid = await reload(order!.id);
    expect(paid.paymentStatus).toBe("paid");
    expect(await onHand("LS-WBLK-M")).toBe(4);
    expect(await activeHolds(order!.id)).toHaveLength(0);

    // Same delivery again (provider retry) → recognised as a duplicate.
    expect((await send(ev)).status).toBe("duplicate");
    // Same payment reported under a new event id → still one payment, one sale, one email.
    expect((await send(event(attempt!, "payment_succeeded", { payment: pay }))).note).toBe("Payment already recorded");
    const pays = await db().select().from(payments).where(eq(payments.orderId, order!.id));
    expect(pays).toHaveLength(1);
    expect(await onHand("LS-WBLK-M")).toBe(4);
    expect(await jobCount(order!.id, "email.order_confirmation")).toBe(1);
    expect(await jobCount(order!.id, "fulfillment.prepare")).toBe(1);
    // The bag is emptied only now.
    expect(await db().select().from(cartLines).where(eq(cartLines.cartId, cart.id))).toHaveLength(0);
  });

  it("a second successful capture is recorded and flagged, never shipped twice", async () => {
    const { cart, token } = await newCart([{ code: "LS-WBLK-M" }]);
    const { order, attempt } = await checkout(token, cart.id);
    await send(event(attempt!, "payment_succeeded", { payment: paymentFor(attempt!) }));
    const r = await send(event(attempt!, "payment_succeeded", { payment: paymentFor(attempt!) }));
    expect(r.note).toBe("duplicate_capture");
    const o = await reload(order!.id);
    expect(o.paymentStatus).toBe("paid");
    expect(o.reviewStatus).toBe("needs_review");
    expect(o.reviewReasons.map((x) => x.code)).toContain("duplicate_capture");
    expect(o.reviewReasons.find((x) => x.code === "duplicate_capture")!.blocksFulfillment).toBe(false);
    const pays = await db().select().from(payments).where(eq(payments.orderId, order!.id));
    expect(pays.map((p) => p.status).sort()).toEqual(["duplicate", "succeeded"]);
    expect(await onHand("LS-WBLK-M")).toBe(4);
    expect(await jobCount(order!.id, "email.order_confirmation")).toBe(1);
  });
});

describe("payments that must not be accepted", () => {
  beforeEach(async () => {
    await setStock("NR-CHAR-M", 5);
  });

  it.each([
    ["amount_mismatch", (a: Parameters<typeof paymentFor>[0]) => paymentFor(a, { amountMinor: a.amountMinor - 100 })],
    ["currency_mismatch", (a: Parameters<typeof paymentFor>[0]) => paymentFor(a, { currency: "EUR" })],
    ["reference_mismatch", (a: Parameters<typeof paymentFor>[0]) => paymentFor(a, { reference: { orderId: "00000000-0000-4000-8000-000000000000", attemptId: null } })],
    ["address_mismatch", (a: Parameters<typeof paymentFor>[0]) => paymentFor(a, { shippingAddress: { name: "X", line1: "Elsewhere 1", postalCode: "5003", city: "Bergen", country: "NO" } })],
  ])("%s → order stays unpaid and is flagged", async (code, make) => {
    const { cart, token } = await newCart([{ code: "NR-CHAR-M" }]);
    const { order, attempt } = await checkout(token, cart.id);
    const r = await send(event(attempt!, "payment_succeeded", { payment: make(attempt!) }));
    expect(r.note).toBe(code);
    const o = await reload(order!.id);
    expect(o.paymentStatus).toBe("unpaid");
    expect(o.reviewStatus).toBe("needs_review");
    expect(o.reviewReasons[0]).toMatchObject({ code, blocksFulfillment: true });
    const [p] = await db().select().from(payments).where(eq(payments.orderId, order!.id));
    expect(p!.status).toBe("mismatch");
    const [a] = await db().select().from(paymentAttempts).where(eq(paymentAttempts.id, attempt!.id));
    expect(a!.status).toBe("failed");
    expect(await onHand("NR-CHAR-M")).toBe(5);
    expect(await jobCount(order!.id, "email.order_confirmation")).toBe(0);
  });
});

describe("delayed and approve-then-capture payments", () => {
  beforeEach(async () => {
    await setStock("HC-ASPH-L", 4);
  });

  it("processing first, success later: held, then sold once", async () => {
    const { cart, token } = await newCart([{ code: "HC-ASPH-L" }]);
    const { order, attempt } = await checkout(token, cart.id);
    const pay = paymentFor(attempt!, { status: "processing" });
    await send(event(attempt!, "payment_processing", { payment: pay }));
    let o = await reload(order!.id);
    expect(o.paymentStatus).toBe("processing");
    expect(o.reservationExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000); // hold extended
    expect(await onHand("HC-ASPH-L")).toBe(4);
    // The sweeper must not expire a processing order.
    await sweepOrders(new Date(Date.now() + 3 * 3600_000));
    expect((await reload(order!.id)).paymentStatus).toBe("processing");

    await send(event(attempt!, "payment_succeeded", { payment: { ...pay, status: "succeeded" } }));
    o = await reload(order!.id);
    expect(o.paymentStatus).toBe("paid");
    expect(await onHand("HC-ASPH-L")).toBe(3);
  });

  it("processing then failed: stock goes back", async () => {
    const { cart, token } = await newCart([{ code: "HC-ASPH-L" }]);
    const { order, attempt } = await checkout(token, cart.id);
    const pay = paymentFor(attempt!, { status: "processing" });
    await send(event(attempt!, "payment_processing", { payment: pay }));
    await send(event(attempt!, "payment_failed", { payment: { ...pay, status: "failed" }, failureReason: "bank declined" }));
    const o = await reload(order!.id);
    expect(o.paymentStatus).toBe("failed");
    expect(await activeHolds(order!.id)).toHaveLength(0);
    expect(await onHand("HC-ASPH-L")).toBe(4);
  });

  it("wallet approval is not payment; capture is queued once", async () => {
    const { cart, token } = await newCart([{ code: "HC-ASPH-L" }]);
    const { order, attempt } = await checkout(token, cart.id, { choice: "paypal" });
    await send(event(attempt!, "checkout_approved"));
    await send(event(attempt!, "checkout_approved"));
    const o = await reload(order!.id);
    expect(o.paymentStatus).toBe("unpaid");
    const [a] = await db().select().from(paymentAttempts).where(eq(paymentAttempts.id, attempt!.id));
    expect(a!.status).toBe("approved");
    expect(await jobCount(order!.id, "payment.capture_paypal")).toBe(1);
  });
});

describe("cancelled and expired checkouts", () => {
  beforeEach(async () => {
    await setStock("FW-TEAL-M", 3);
  });

  it("expired session closes the attempt; the lapsed hold is released by the sweeper", async () => {
    const { cart, token } = await newCart([{ code: "FW-TEAL-M", qty: 2 }]);
    const { order, attempt } = await checkout(token, cart.id);
    await send(event(attempt!, "checkout_expired"));
    const [a] = await db().select().from(paymentAttempts).where(eq(paymentAttempts.id, attempt!.id));
    expect(a!.status).toBe("expired");
    expect(await activeHolds(order!.id)).toHaveLength(1); // still held for a retry until the hold ends
    await sweepOrders(new Date(Date.now() + 2 * 3600_000));
    const o = await reload(order!.id);
    expect(o.paymentStatus).toBe("expired");
    expect(await activeHolds(order!.id)).toHaveLength(0);
    expect(await onHand("FW-TEAL-M")).toBe(3);
  });

  it("retrying checkout for the same bag replaces the attempt — never two live ones", async () => {
    const { cart, token } = await newCart([{ code: "FW-TEAL-M" }]);
    const first = await checkout(token, cart.id);
    const second = await checkout(token, cart.id, { quoteId: first.quoteId });
    expect(second.res.ok).toBe(true);
    expect(second.order!.id).toBe(first.order!.id); // same bag, quote and address → same pending order
    const attempts = await db().select().from(paymentAttempts).where(eq(paymentAttempts.orderId, first.order!.id));
    const live = attempts.filter((x) => ["creating", "open", "approved", "processing"].includes(x.status));
    expect(live).toHaveLength(1);
    expect(live[0]!.id).toBe(second.attempt!.id);
    // The database itself refuses a second live attempt.
    await expect(
      db().insert(paymentAttempts).values({ orderId: first.order!.id, provider: "simulator", status: "open", amountMinor: 100, currency: "NOK", expiresAt: new Date(Date.now() + 60_000) }),
    ).rejects.toThrow();
    // A late payment on the superseded attempt is still verified against the order (and flagged if it doubles up).
    await send(event(second.attempt!, "payment_succeeded", { payment: paymentFor(second.attempt!) }));
    expect((await reload(first.order!.id)).paymentStatus).toBe("paid");
  });
});

describe("changing the bag after starting payment", () => {
  it("a new quote replaces the unpaid order: old hold released, old attempt closed", async () => {
    await setStock("FW-TEAL-L", 2);
    const { cart, token } = await newCart([{ code: "FW-TEAL-L" }]);
    const first = await checkout(token, cart.id);
    const second = await checkout(token, cart.id); // fresh quote → fresh order snapshot
    expect(second.order!.id).not.toBe(first.order!.id);
    expect((await reload(first.order!.id)).paymentStatus).toBe("cancelled");
    expect(await activeHolds(first.order!.id)).toHaveLength(0);
    expect(await activeHolds(second.order!.id)).toHaveLength(1);
    const [old] = await db().select().from(paymentAttempts).where(eq(paymentAttempts.id, first.attempt!.id));
    expect(["expired", "cancelled", "superseded"]).toContain(old!.status);
  });
});

describe("stock races", () => {
  it("two buyers, one last unit: exactly one checkout gets it", async () => {
    await setStock("HC-BONE-XL", 1);
    const a = await newCart([{ code: "HC-BONE-XL" }]);
    const b = await newCart([{ code: "HC-BONE-XL" }]);
    const [ra, rb] = await Promise.all([checkout(a.token, a.cart.id), checkout(b.token, b.cart.id)]);
    const results = [ra.res, rb.res];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const lost = results.find((r) => !r.ok)!;
    expect(lost.ok).toBe(false);
    // Depending on timing the loser is stopped by the stock lock ("out_of_stock") or, if the
    // winner already holds the unit, by the bag check before any order is created ("invalid").
    if (!lost.ok) {
      expect(["out_of_stock", "invalid"]).toContain(lost.code);
      expect(lost.message).toMatch(/sold out|need your attention/i);
    }
    const winner = [ra, rb].find((x) => x.res.ok)!;
    expect(await activeHolds(winner.order!.id)).toHaveLength(1);
    expect(await onHand("HC-BONE-XL")).toBe(1); // nothing sold yet, nothing oversold
  });

  it("payment that arrives after the hold lapsed and the unit sold is accepted but blocked for review; stock never goes negative", async () => {
    await setStock("HC-BONE-S", 1);
    const a = await newCart([{ code: "HC-BONE-S" }]);
    const first = await checkout(a.token, a.cart.id);
    await sweepOrders(new Date(Date.now() + 2 * 3600_000)); // A's hold lapses
    expect((await reload(first.order!.id)).paymentStatus).toBe("expired");
    const b = await newCart([{ code: "HC-BONE-S" }]);
    const second = await checkout(b.token, b.cart.id);
    await send(event(second.attempt!, "payment_succeeded", { payment: paymentFor(second.attempt!) }));
    expect(await onHand("HC-BONE-S")).toBe(0);
    // A's buyer completes payment late at the provider.
    await send(event(first.attempt!, "payment_succeeded", { payment: paymentFor(first.attempt!) }));
    const o = await reload(first.order!.id);
    expect(o.paymentStatus).toBe("paid");
    expect(o.reviewReasons.find((r) => r.code === "late_payment_oversold")).toMatchObject({ blocksFulfillment: true });
    expect(await onHand("HC-BONE-S")).toBe(0);
  });
});

describe("Locker Tag snapshots", () => {
  it("stores the exact print spec per line and keeps it after the template changes", async () => {
    await setStock("HC-ASPH-M", 5);
    await setStock("LS-WBLK-L", 5);
    const [prod] = await db().select().from(products).where(eq(products.slug, "heat-check-training-singlet"));
    await db().update(products).set({ personalizationNoWithdrawal: true }).where(eq(products.id, prod!.id));
    const { cart, token } = await newCart([
      { code: "HC-ASPH-M", personalization: { fields: { name: "nordstrøm", number: "13" }, colorId: "coral", spellingConfirmed: true } },
      { code: "LS-WBLK-L" },
    ]);
    const { order } = await checkout(token, cart.id);
    const lines = await linesOf(order!.id);
    const tagged = lines.find((l) => l.skuCode === "HC-ASPH-M")!;
    const plain = lines.find((l) => l.skuCode === "LS-WBLK-L")!;
    expect(tagged.personalization).toMatchObject({
      fields: { name: "NORDSTRØM", number: "13" },
      color: { id: "coral", hex: "#ee7c5e" },
      templateCode: "LT-SINGLET-UB",
      templateVersion: 1,
      areaMm: { widthMm: 260, heightMm: 230, offsetFromCollarMm: 70 },
    });
    expect(tagged.personalization!.font.version).toBeTruthy();
    expect(tagged.personalizationUnitMinor).toBe(14900);
    // Final-sale rule only on the personalised line.
    expect(tagged.withdrawalRule).toBe("personalized_exempt");
    expect(plain.withdrawalRule).toBe("standard");

    const before = JSON.stringify(tagged.personalization);
    const [tpl] = await db().select().from(printTemplates).where(eq(printTemplates.code, "LT-SINGLET-UB"));
    try {
      await db().update(printTemplates).set({ colors: [{ id: "coral", name: "Changed", hex: "#000000" }], areaMm: { widthMm: 1, heightMm: 1, offsetFromCollarMm: 1 } }).where(eq(printTemplates.id, tpl!.id));
      await db().update(products).set({ personalizationPriceMinor: 99900, personalizationNoWithdrawal: false }).where(eq(products.id, prod!.id));
      const after = (await linesOf(order!.id)).find((l) => l.skuCode === "HC-ASPH-M")!;
      expect(JSON.stringify(after.personalization)).toBe(before);
      expect(after.personalizationUnitMinor).toBe(14900);
      expect(after.withdrawalRule).toBe("personalized_exempt");
    } finally {
      await db().update(printTemplates).set({ colors: tpl!.colors, areaMm: tpl!.areaMm }).where(eq(printTemplates.id, tpl!.id));
      await db().update(products).set({ personalizationPriceMinor: prod!.personalizationPriceMinor, personalizationNoWithdrawal: prod!.personalizationNoWithdrawal }).where(eq(products.id, prod!.id));
    }
  });
});

describe("webhook endpoint", () => {
  it("rejects unsigned or tampered requests with 400 and accepts a signed one", async () => {
    const { handleWebhook } = await import("@/server/payments/webhook-route");
    const { signSimulatorPayload } = await import("@/server/payments/simulator");
    await setStock("LS-WBLK-S", 3);
    const { cart, token } = await newCart([{ code: "LS-WBLK-S" }]);
    const { order, attempt } = await checkout(token, cart.id);
    const body = JSON.stringify({ id: "simevt_hook_1", type: "payment.succeeded", ref: attempt!.providerRef, payment: paymentFor(attempt!) });
    const bad = await handleWebhook("simulator", new Request("http://x/api/webhooks/simulator", { method: "POST", body, headers: { "x-simulator-signature": "nope" } }));
    expect(bad.status).toBe(400);
    expect((await reload(order!.id)).paymentStatus).toBe("unpaid");
    const tampered = await handleWebhook("simulator", new Request("http://x", { method: "POST", body: body.replace("succeeded", "succeeded "), headers: { "x-simulator-signature": signSimulatorPayload(body) } }));
    expect(tampered.status).toBe(400);
    const ok = await handleWebhook("simulator", new Request("http://x", { method: "POST", body, headers: { "x-simulator-signature": signSimulatorPayload(body) } }));
    expect(ok.status).toBe(200);
    expect((await reload(order!.id)).paymentStatus).toBe("paid");
    const ev = await db().select().from(providerEvents).where(eq(providerEvents.eventId, "simevt_hook_1"));
    expect(ev[0]!.status).toBe("processed");
    // carts point at nothing pending any more
    const [c] = await db().select().from(carts).where(eq(carts.id, cart.id));
    expect(c!.pendingOrderId).toBeNull();
  });
});

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { carts, inventoryLevels, orderLines, orders, paymentAttempts, skus, stockReservations } from "@/server/db/schema";
import { addLine, buildCartView, createCart } from "@/server/cart";
import { personalizationKey } from "@/server/personalization";
import { cartFingerprint, createQuote, ratesFor } from "@/server/shipping";
import { getSettings } from "@/server/settings";
import { priceForCheckout, startCheckout } from "@/server/orders/checkout";
import { handleProviderEvent } from "@/server/orders/transitions";
import type { NormalizedEvent, VerifiedPayment } from "@/server/payments/types";
import type { Address, PersonalizationInput } from "@/lib/types";

export const ADDRESS: Address = { name: "Kari Nordmann", line1: "Storgata 1", postalCode: "0155", city: "Oslo", country: "NO", phone: null };

export async function skuByCode(code: string) {
  const [s] = await db().select().from(skus).where(eq(skus.code, code));
  if (!s) throw new Error(`No SKU ${code}`);
  return s;
}

export async function setStock(code: string, onHand: number) {
  const s = await skuByCode(code);
  await db().update(inventoryLevels).set({ onHand, verifiedAt: new Date() }).where(eq(inventoryLevels.skuId, s.id));
  await db().delete(stockReservations).where(eq(stockReservations.skuId, s.id));
  return s;
}

export async function onHand(code: string) {
  const s = await skuByCode(code);
  const [l] = await db().select().from(inventoryLevels).where(eq(inventoryLevels.skuId, s.id));
  return l?.onHand ?? 0;
}

export async function newCart(lines: { code: string; qty?: number; personalization?: PersonalizationInput | null }[]) {
  const s = await getSettings();
  const { cart, token } = await createCart(db(), s.store.currency);
  for (const l of lines) {
    const sku = await skuByCode(l.code);
    await addLine(db(), cart, { skuId: sku.id, qty: l.qty ?? 1, personalization: l.personalization ?? null });
  }
  return { cart, token };
}

/** Same steps as the checkout page: quote delivery, then start payment with the total the buyer saw. */
export async function checkout(token: string, cartId: string, opts: { choice?: "card" | "paypal"; email?: string; quoteId?: string } = {}) {
  const s = await getSettings();
  const [cart] = await db().select().from(carts).where(eq(carts.id, cartId));
  const view = await buildCartView(db(), cart!, s);
  const rates = await ratesFor(db(), "NO", view.pricing.subtotalMinor - view.pricing.discountMinor, view.currency);
  const rate = rates[0]!;
  const fp = cartFingerprint(
    view.lines.map((l) => ({ skuId: l.skuId, qty: l.qty, personalizationKey: personalizationKey(l.personalization) })),
    view.discountCode,
  );
  const quote = opts.quoteId ? { id: opts.quoteId } : await createQuote(db(), { cartId, fingerprint: fp, address: ADDRESS, method: rate, ttlMinutes: 30 });
  const pricing = await priceForCheckout(db(), view, rate.priceMinor, s);
  const res = await startCheckout({
    cartToken: token,
    email: opts.email ?? "buyer@example.com",
    address: ADDRESS,
    quoteId: quote.id,
    choice: opts.choice ?? "card",
    termsAccepted: true,
    acknowledgedTotalMinor: pricing.totalMinor,
  });
  if (!res.ok) return { res, order: null, attempt: null, quoteId: quote.id } as const;
  const [order] = await db().select().from(orders).where(eq(orders.id, res.orderId));
  const [attempt] = await db().select().from(paymentAttempts).where(eq(paymentAttempts.id, res.attemptId));
  return { res, order: order!, attempt: attempt!, quoteId: quote.id } as const;
}

export async function reload(orderId: string) {
  const [o] = await db().select().from(orders).where(eq(orders.id, orderId));
  return o!;
}

export async function linesOf(orderId: string) {
  return db().select().from(orderLines).where(eq(orderLines.orderId, orderId));
}

export async function activeHolds(orderId: string) {
  return db().select().from(stockReservations).where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "active")));
}

const rid = (p: string) => `${p}_${randomBytes(6).toString("hex")}`;

type AttemptLike = { id: string; orderId: string; amountMinor: number; currency: string; providerRef: string | null };

export function paymentFor(a: AttemptLike, over: Partial<VerifiedPayment> = {}): VerifiedPayment {
  return {
    providerPaymentId: rid("simpay"),
    status: "succeeded",
    amountMinor: a.amountMinor,
    currency: a.currency,
    reference: { orderId: a.orderId, attemptId: a.id },
    shippingAddress: null,
    ...over,
  };
}

export function event(a: AttemptLike, kind: NormalizedEvent["kind"], extra: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    provider: "simulator",
    eventId: rid("simevt"),
    type: `test.${kind}`,
    kind,
    checkoutRef: a.providerRef,
    attemptId: a.id,
    summary: { test: true },
    ...extra,
  };
}

export const send = (ev: NormalizedEvent) => handleProviderEvent(ev);

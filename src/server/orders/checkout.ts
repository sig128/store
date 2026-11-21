import "../guard";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { brand } from "@/config/brand";
import { appUrl } from "../env";
import { db, type Tx } from "../db";
import {
  artworks,
  carts,
  mediaAssets,
  orderLines,
  orders,
  paymentAttempts,
  printTemplates,
  variantPrints,
} from "../db/schema";
import { buildCartView, findCart, taxRuleFrom, activeBundles, codeRule, type CartRow, type CartView } from "../cart";
import { loadSkuDetails, showDevData } from "../catalog";
import { OutOfStockError, releaseReservations, reserveStock, type Shortage } from "../inventory";
import { buildSnapshot, personalizationKey, type TemplateLike } from "../personalization";
import { priceCart } from "../pricing";
import { getSettings, type Settings } from "../settings";
import { cartFingerprint, loadQuote, ratesFor, sameAddress, sameDestination, validateAddress } from "../shipping";
import { providerForChoice, type PaymentChoice } from "../payments";
import type { AttemptRow, OrderRow } from "../payments/types";
import { checkoutGate } from "../readiness";
import { ACTIVE_ATTEMPT, addOrderEvent } from "./transitions";
import { closeAttempt, reconcileAttempt } from "./payment-ops";
import type { Address, PricingSnapshot } from "@/lib/types";

export interface StartCheckoutInput {
  cartToken: string | null | undefined;
  email: string;
  address: unknown;
  quoteId: string;
  choice: PaymentChoice;
  termsAccepted: boolean;
  acknowledgedTotalMinor: number;
  customerNote?: string | null;
}

export type StartCheckoutResult =
  | { ok: true; redirectUrl: string; orderId: string; attemptId: string }
  | {
      ok: false;
      code:
        | "closed"
        | "invalid"
        | "empty"
        | "quote_expired"
        | "quote_mismatch"
        | "total_changed"
        | "out_of_stock"
        | "provider_unavailable"
        | "provider_error"
        | "busy"
        | "already_paid";
      message: string;
      fieldErrors?: Record<string, string>;
      newTotalMinor?: number;
      orderId?: string;
      shortages?: (Shortage & { label: string })[];
    };

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(200);

/** Final, server-side price for this bag and this shipping quote. */
export async function priceForCheckout(exec: Tx | ReturnType<typeof db>, view: CartView, shippingMinor: number, s: Settings): Promise<PricingSnapshot> {
  const bundles = await activeBundles(exec);
  const { rule } = await codeRule(exec, view.discountCode, view.currency);
  return priceCart({
    currency: view.currency,
    lines: view.lines
      .filter((l) => l.status === "ok")
      .map((l) => ({ key: l.id, skuId: l.skuId, productId: l.productId, qty: l.qty, unitPriceMinor: l.unitPriceMinor, personalizationUnitMinor: l.personalizationUnitMinor })),
    bundles,
    code: rule,
    shippingMinor,
    tax: taxRuleFrom(s),
  });
}

export async function startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult> {
  const root = db();
  const s = await getSettings(root);
  const gate = await checkoutGate(root, s);
  if (!gate.open) return { ok: false, code: "closed", message: gate.message };

  const fieldErrors: Record<string, string> = {};
  const email = emailSchema.safeParse(input.email);
  if (!email.success) fieldErrors.email = email.error.issues[0]?.message ?? "Enter a valid email address";
  if (!input.termsAccepted) fieldErrors.terms = "Please accept the terms of sale to continue.";
  const addr = validateAddress(input.address, s.store.shipsTo);
  if (!addr.ok) Object.assign(fieldErrors, addr.errors);
  if (Object.keys(fieldErrors).length) return { ok: false, code: "invalid", message: "Check the highlighted fields.", fieldErrors };
  const address = (addr as { ok: true; address: Address }).address;

  const cart = await findCart(root, input.cartToken);
  if (!cart) return { ok: false, code: "empty", message: "Your bag is empty." };

  const provider = providerForChoice(input.choice, { stripe: s.checkout.stripeEnabled, paypal: s.checkout.paypalEnabled });
  if (!provider) return { ok: false, code: "provider_unavailable", message: "That payment method isn't available right now." };

  for (let round = 0; round < 3; round++) {
    const view = await buildCartView(root, cart, s);
    if (view.lines.length === 0) return { ok: false, code: "empty", message: "Your bag is empty." };
    if (view.checkoutBlockers.length) return { ok: false, code: "invalid", message: view.checkoutBlockers[0]! };

    const quote = await loadQuote(root, input.quoteId);
    const fp = cartFingerprint(
      view.lines.map((l) => ({ skuId: l.skuId, qty: l.qty, personalizationKey: personalizationKeyOf(l) })),
      view.discountCode,
    );
    if (!quote || quote.cartId !== cart.id) return { ok: false, code: "quote_mismatch", message: "Choose a delivery option again." };
    if (quote.expiresAt < new Date()) return { ok: false, code: "quote_expired", message: "Your delivery quote expired. We've refreshed it — please review the total." };
    if (quote.cartFingerprint !== fp || !sameDestination(quote.destination, address)) {
      return { ok: false, code: "quote_mismatch", message: "Your bag or address changed since delivery was quoted. Please review the new total." };
    }
    const rates = await ratesFor(root, address.country, view.pricing.subtotalMinor - view.pricing.discountMinor, view.currency);
    const rate = rates.find((r) => r.rateId === quote.rateId);
    if (!rate || rate.priceMinor !== quote.amountMinor) {
      return { ok: false, code: "quote_mismatch", message: "Delivery options changed. Please choose delivery again." };
    }
    const pricing = await priceForCheckout(root, view, quote.amountMinor, s);
    if (pricing.totalMinor !== input.acknowledgedTotalMinor) {
      return { ok: false, code: "total_changed", message: "Your total changed. Please review it before paying.", newTotalMinor: pricing.totalMinor };
    }

    let phase1: { kind: "ready"; order: OrderRow; attempt: AttemptRow } | { kind: "close"; attempt: AttemptRow } | { kind: "stop"; result: StartCheckoutResult };
    try {
      phase1 = await root.transaction(async (tx) => {
        const [locked] = await tx.select().from(carts).where(eq(carts.id, cart.id)).for("update");
        if (!locked) return { kind: "stop" as const, result: { ok: false as const, code: "empty" as const, message: "Your bag is empty." } };
        let order: OrderRow | null = null;
        if (locked.pendingOrderId) {
          const [pending] = await tx.select().from(orders).where(eq(orders.id, locked.pendingOrderId)).for("update");
          if (pending && (pending.paymentStatus === "paid" || pending.paymentStatus === "processing")) {
            return {
              kind: "stop" as const,
              result: { ok: false as const, code: "already_paid" as const, message: "This order is already paid or being confirmed.", orderId: pending.id },
            };
          }
          if (pending && pending.paymentStatus === "unpaid") {
            const [active] = await tx
              .select()
              .from(paymentAttempts)
              .where(and(eq(paymentAttempts.orderId, pending.id), inArray(paymentAttempts.status, [...ACTIVE_ATTEMPT])))
              .for("update");
            if (active) {
              if (active.status === "creating" && active.createdAt > new Date(Date.now() - 2 * 60_000)) {
                return { kind: "stop" as const, result: { ok: false as const, code: "busy" as const, message: "A payment is already starting. Wait a moment and try again." } };
              }
              return { kind: "close" as const, attempt: active };
            }
            const reusable =
              pending.cartFingerprint === fp &&
              pending.quoteId === quote.id &&
              pending.email === email.data &&
              sameAddress(pending.shippingAddress, address) &&
              pending.totalMinor === pricing.totalMinor;
            if (reusable) {
              order = pending;
            } else {
              await tx.update(orders).set({ paymentStatus: "cancelled", cancelledAt: new Date(), updatedAt: new Date() }).where(eq(orders.id, pending.id));
              await releaseReservations(tx, pending.id);
              await addOrderEvent(tx, pending.id, "replaced", "Customer changed the bag or address; this unpaid order was replaced.");
            }
          }
        }
        const holdUntil = new Date(Date.now() + s.checkout.reservationMinutes * 60_000);
        if (!order) {
          order = await createOrderSnapshot(tx, { cart: locked, view, pricing, quoteId: quote.id, fingerprint: fp, address, email: email.data!, settings: s, customerNote: input.customerNote ?? null, holdUntil });
        } else {
          await tx.update(orders).set({ reservationExpiresAt: holdUntil, updatedAt: new Date() }).where(eq(orders.id, order.id));
        }
        const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, order.id));
        await reserveStock(
          tx,
          order.id,
          lines.filter((l) => l.fulfillmentMode === "stocked" && l.skuId).map((l) => ({ skuId: l.skuId!, qty: l.qty })),
          holdUntil,
        );
        await tx.update(carts).set({ pendingOrderId: order.id, email: email.data!, updatedAt: new Date() }).where(eq(carts.id, locked.id));
        const [attempt] = await tx
          .insert(paymentAttempts)
          .values({
            orderId: order.id,
            provider: provider.id,
            status: "creating",
            amountMinor: order.totalMinor,
            currency: order.currency,
            expiresAt: new Date(Date.now() + s.checkout.attemptMinutes * 60_000),
          })
          .returning();
        await addOrderEvent(tx, order.id, "attempt_created", `Payment attempt started with ${provider.label}.`, { attemptId: attempt!.id, provider: provider.id });
        return { kind: "ready" as const, order, attempt: attempt! };
      });
    } catch (err) {
      if (err instanceof OutOfStockError) {
        const details = await loadSkuDetails(root, err.shortages.map((x) => x.skuId));
        return {
          ok: false,
          code: "out_of_stock",
          message: "Part of your bag sold out while you were checking out. Nothing was charged.",
          shortages: err.shortages.map((x) => {
            const d = details.find((dd) => dd.skuId === x.skuId);
            return { ...x, label: d ? `${d.productName} — ${d.colorName}, ${d.size}` : x.skuId };
          }),
        };
      }
      if (String((err as { code?: string }).code) === "23505") {
        return { ok: false, code: "busy", message: "A payment is already starting for this order. Wait a moment and try again." };
      }
      throw err;
    }

    if (phase1.kind === "stop") return phase1.result;
    if (phase1.kind === "close") {
      const closed = await closeAttempt(phase1.attempt.id, "replaced by a new checkout");
      if (closed === "paid") {
        return { ok: false, code: "already_paid", message: "Your earlier payment went through. No new payment was started.", orderId: phase1.attempt.orderId };
      }
      if (closed === "error") {
        return { ok: false, code: "provider_error", message: "We couldn't close your previous payment attempt yet. Try again in a minute." };
      }
      continue; // previous attempt is no longer payable; build a fresh one
    }

    const { order, attempt } = phase1;
    const lines = await root.select().from(orderLines).where(eq(orderLines.orderId, order.id));
    const q = `attempt=${attempt.id}`;
    try {
      const created = await provider.createCheckout({
        order,
        lines,
        attempt,
        successUrl: appUrl(`/checkout/complete?${q}`),
        cancelUrl: appUrl(`/checkout/cancel?${q}`),
        returnUrl: appUrl(`/checkout/return?${q}`),
        locale: s.store.locale,
      });
      await root
        .update(paymentAttempts)
        .set({ status: "open", providerRef: created.providerRef, redirectUrl: created.redirectUrl, updatedAt: new Date() })
        .where(and(eq(paymentAttempts.id, attempt.id), eq(paymentAttempts.status, "creating")));
      return { ok: true, redirectUrl: created.redirectUrl, orderId: order.id, attemptId: attempt.id };
    } catch (err) {
      await root
        .update(paymentAttempts)
        .set({ status: "failed", failureReason: String((err as Error).message).slice(0, 500), closedAt: new Date(), updatedAt: new Date() })
        .where(eq(paymentAttempts.id, attempt.id));
      await addOrderEvent(root, order.id, "attempt_failed", `Could not start ${provider.label}: ${(err as Error).message}`);
      return { ok: false, code: "provider_error", message: `We couldn't reach ${provider.label} just now. Nothing was charged — please try again.` };
    }
  }
  return { ok: false, code: "busy", message: "Please try again." };
}

/** Same key the quote step uses, so a quote always matches the bag it was made for. */
const personalizationKeyOf = (l: CartView["lines"][number]): string => personalizationKey(l.personalization);

async function createOrderSnapshot(
  tx: Tx,
  o: {
    cart: CartRow;
    view: CartView;
    pricing: PricingSnapshot;
    quoteId: string;
    fingerprint: string;
    address: Address;
    email: string;
    settings: Settings;
    customerNote: string | null;
    holdUntil: Date;
  },
): Promise<OrderRow> {
  const lines = o.view.lines.filter((l) => l.status === "ok");
  const details = await loadSkuDetails(tx, lines.map((l) => l.skuId));
  const variantIds = [...new Set(details.map((d) => d.variantId))];
  const prints = variantIds.length
    ? await tx
        .select({ variantId: variantPrints.variantId, placement: variantPrints.placement, method: variantPrints.method, methodApproved: variantPrints.methodApproved, artworkId: artworks.id, code: artworks.code, version: artworks.version, title: artworks.title })
        .from(variantPrints)
        .innerJoin(artworks, eq(artworks.id, variantPrints.artworkId))
        .where(inArray(variantPrints.variantId, variantIds))
    : [];
  const media = variantIds.length
    ? await tx.select().from(mediaAssets).where(and(inArray(mediaAssets.variantId, variantIds), eq(mediaAssets.kind, "front")))
    : [];
  const templateIds = [...new Set(details.map((d) => d.personalizationTemplateId).filter((x): x is string => Boolean(x)))];
  const templates = templateIds.length ? await tx.select().from(printTemplates).where(inArray(printTemplates.id, templateIds)) : [];
  const seq = await tx.execute<{ n: string }>(sql`select nextval('order_number_seq') as n`);
  const number = `${brand.monogram}-${seq.rows[0]!.n}`;
  const shippingMethod = (await loadQuote(tx, o.quoteId))!.rateSnapshot;

  const [order] = await tx
    .insert(orders)
    .values({
      number,
      cartId: o.cart.id,
      email: o.email,
      currency: o.pricing.currency,
      market: o.settings.store.market,
      subtotalMinor: o.pricing.subtotalMinor,
      discountMinor: o.pricing.discountMinor,
      shippingMinor: o.pricing.shippingMinor,
      taxMinor: o.pricing.taxMinor,
      totalMinor: o.pricing.totalMinor,
      taxSnapshot: o.pricing.tax,
      pricingSnapshot: o.pricing,
      shippingAddress: o.address,
      shippingMethod,
      quoteId: o.quoteId,
      cartFingerprint: o.fingerprint,
      discountCode: o.view.discountCode,
      sellerSnapshot: o.settings.seller,
      termsVersion: o.settings.checkout.termsVersion,
      termsAcceptedAt: new Date(),
      paymentStatus: "unpaid",
      reservationExpiresAt: o.holdUntil,
      customerNote: o.customerNote,
      isTest: showDevData(),
    })
    .returning();

  let lineNo = 0;
  for (const l of lines) {
    const d = details.find((x) => x.skuId === l.skuId)!;
    const p = o.pricing.lines.find((x) => x.key === l.id)!;
    let snapshot = null;
    if (l.personalization && d.personalizationTemplateId) {
      const t = templates.find((x) => x.id === d.personalizationTemplateId)! as TemplateLike;
      snapshot = buildSnapshot(l.personalization, t, d.personalizationPriceMinor ?? 0, d.personalizationProductionDays ?? null);
    }
    const img = media.find((m) => m.variantId === d.variantId);
    lineNo += 1;
    await tx.insert(orderLines).values({
      orderId: order!.id,
      lineNo,
      skuId: d.skuId,
      skuCode: d.skuCode,
      productId: d.productId,
      productName: d.productName,
      productSlug: d.productSlug,
      categoryLabel: d.categoryLabel,
      variantCode: d.variantCode,
      variantLabel: d.optionLabel ? `${d.colorName} / ${d.optionLabel}` : d.colorName,
      colorName: d.colorName,
      size: d.size,
      qty: p.qty,
      unitPriceMinor: p.unitPriceMinor,
      personalizationUnitMinor: p.personalizationUnitMinor,
      lineSubtotalMinor: p.lineSubtotalMinor,
      discountMinor: p.discountMinor,
      taxMinor: p.taxMinor,
      lineTotalMinor: p.lineTotalMinor,
      personalization: snapshot,
      prints: prints
        .filter((pr) => pr.variantId === d.variantId)
        .map((pr) => ({ artworkId: pr.artworkId, code: pr.code, version: pr.version, title: pr.title, placement: pr.placement, method: pr.methodApproved ? pr.method : null })),
      fulfillmentMode: d.fulfillmentMode,
      leadTime: l.leadTime,
      withdrawalRule: l.withdrawalRule,
      imageKey: img?.storageKey ?? null,
    });
  }
  await addOrderEvent(tx, order!.id, "created", `Order ${number} created from the bag (unpaid).`, { totalMinor: o.pricing.totalMinor });
  return order!;
}

export { reconcileAttempt };

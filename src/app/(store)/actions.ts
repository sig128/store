"use server";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { dropSignups, orders } from "@/server/db/schema";
import {
  addLine,
  buildCartView,
  CartError,
  createCart,
  findCart,
  removeLine,
  setDiscountCode,
  updateLine,
  taxRuleFrom,
  type CartView,
} from "@/server/cart";
import { loadSkuDetails, isSellable, skuAvailability } from "@/server/catalog";
import { priceCart } from "@/server/pricing";
import { getSettings } from "@/server/settings";
import { cartFingerprint, createQuote, ratesFor, validateAddress } from "@/server/shipping";
import { priceForCheckout, startCheckout, type StartCheckoutResult } from "@/server/orders/checkout";
import { getCartToken, grantOrderAccess, setCartToken } from "@/server/http/session";
import { clientKey, hit } from "@/server/http/ratelimit";
import { enqueue } from "@/server/jobs/queue";
import { activeBundles } from "@/server/cart";
import { personalizationKey } from "@/server/personalization";
import type { PersonalizationInput, PricingSnapshot, ShippingMethodSnapshot } from "@/lib/types";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string> };

const uuid = z.string().uuid();
const personalizationSchema = z
  .object({
    fields: z.record(z.string(), z.string().max(40)),
    colorId: z.string().max(40),
    spellingConfirmed: z.boolean(),
  })
  .nullable()
  .optional();

async function currentCart() {
  return findCart(db(), await getCartToken());
}

async function ensureCart() {
  const existing = await currentCart();
  if (existing) return existing;
  const s = await getSettings();
  const { cart, token } = await createCart(db(), s.store.currency);
  await setCartToken(token);
  return cart;
}

function fail(err: unknown): { ok: false; error: string; code?: string; fieldErrors?: Record<string, string> } {
  if (err instanceof CartError) return { ok: false, error: err.message, code: err.code, fieldErrors: err.fieldErrors };
  console.error(err);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function fetchCartAction(): Promise<CartView> {
  return buildCartView(db(), await currentCart());
}

export async function addToCartAction(input: { skuId: string; qty: number; personalization?: PersonalizationInput | null; outfitId?: string | null }): Promise<ActionResult<CartView>> {
  const parsed = z
    .object({ skuId: uuid, qty: z.number().int().min(1).max(10), personalization: personalizationSchema, outfitId: uuid.nullable().optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a size first.", code: "invalid" };
  try {
    const cart = await ensureCart();
    await addLine(db(), cart, parsed.data);
    return { ok: true, data: await buildCartView(db(), cart) };
  } catch (err) {
    return fail(err);
  }
}

export async function addFitAction(input: { outfitId: string; skuIds: string[] }): Promise<{ cart: CartView; results: { skuId: string; ok: boolean; error?: string }[] }> {
  const parsed = z.object({ outfitId: uuid, skuIds: z.array(uuid).min(1).max(6) }).safeParse(input);
  if (!parsed.success) return { cart: await fetchCartAction(), results: [] };
  const cart = await ensureCart();
  const results: { skuId: string; ok: boolean; error?: string }[] = [];
  // Each piece is added on its own: one sold-out size never blocks the rest of the fit.
  for (const skuId of parsed.data.skuIds) {
    try {
      await addLine(db(), cart, { skuId, qty: 1, outfitId: parsed.data.outfitId });
      results.push({ skuId, ok: true });
    } catch (err) {
      results.push({ skuId, ok: false, error: err instanceof CartError ? err.message : "Could not add this item." });
    }
  }
  return { cart: await buildCartView(db(), cart), results };
}

export async function updateLineAction(input: { lineId: string; qty?: number; skuId?: string; personalization?: PersonalizationInput | null }): Promise<ActionResult<CartView>> {
  const parsed = z
    .object({ lineId: uuid, qty: z.number().int().min(1).max(10).optional(), skuId: uuid.optional(), personalization: personalizationSchema })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That change isn't valid." };
  try {
    const cart = await currentCart();
    if (!cart) return { ok: false, error: "Your bag has expired. Please add the item again." };
    await updateLine(db(), cart, parsed.data.lineId, parsed.data);
    return { ok: true, data: await buildCartView(db(), cart) };
  } catch (err) {
    return fail(err);
  }
}

export async function removeLineAction(lineId: string): Promise<ActionResult<CartView>> {
  if (!uuid.safeParse(lineId).success) return { ok: false, error: "Invalid item." };
  const cart = await currentCart();
  if (!cart) return { ok: true, data: await buildCartView(db(), null) };
  await removeLine(db(), cart, lineId);
  return { ok: true, data: await buildCartView(db(), cart) };
}

export async function applyCodeAction(code: string | null): Promise<ActionResult<CartView>> {
  const clean = code === null ? null : z.string().trim().max(40).safeParse(code).data ?? null;
  const cart = await currentCart();
  if (!cart) return { ok: false, error: "Add something to your bag first." };
  const err = await setDiscountCode(db(), cart, clean);
  if (err) return { ok: false, error: err, fieldErrors: { code: err } };
  return { ok: true, data: await buildCartView(db(), cart) };
}

export interface FitPreview {
  lines: { skuId: string; priceMinor: number; discountMinor: number; totalMinor: number; available: boolean; reason: string | null }[];
  subtotalMinor: number;
  savingMinor: number;
  savingLabel: string | null;
  totalMinor: number;
  currency: string;
}

/** Server-priced preview of a fit (same pricing engine as the bag and checkout). */
export async function previewFitAction(input: { outfitId: string; skuIds: string[] }): Promise<ActionResult<FitPreview>> {
  const parsed = z.object({ outfitId: uuid, skuIds: z.array(uuid).max(6) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid selection" };
  const s = await getSettings();
  const details = await loadSkuDetails(db(), parsed.data.skuIds);
  const avail = await skuAvailability(db(), parsed.data.skuIds);
  const bundles = (await activeBundles(db())).filter((b) => b.ref === parsed.data.outfitId);
  const usable = details.filter((d) => isSellable(d).ok && (d.fulfillmentMode === "made_to_order" || (avail.get(d.skuId) ?? 0) > 0));
  const pricing = priceCart({
    currency: s.store.currency,
    lines: usable.map((d) => ({ key: d.skuId, skuId: d.skuId, productId: d.productId, qty: 1, unitPriceMinor: d.priceMinor, personalizationUnitMinor: 0 })),
    bundles,
    tax: taxRuleFrom(s),
  });
  const bundle = pricing.discounts.find((x) => x.kind === "bundle");
  return {
    ok: true,
    data: {
      lines: details.map((d) => {
        const p = pricing.lines.find((l) => l.skuId === d.skuId);
        const sell = isSellable(d);
        const available = Boolean(p);
        return {
          skuId: d.skuId,
          priceMinor: d.priceMinor,
          discountMinor: p?.discountMinor ?? 0,
          totalMinor: p?.lineTotalMinor ?? d.priceMinor,
          available,
          reason: available ? null : sell.ok ? `Size ${d.size} is sold out` : sell.reason,
        };
      }),
      subtotalMinor: pricing.subtotalMinor,
      savingMinor: pricing.discountMinor,
      savingLabel: bundle?.label ?? null,
      totalMinor: pricing.totalMinor,
      currency: pricing.currency,
    },
  };
}

export interface CheckoutQuote {
  rates: ShippingMethodSnapshot[];
  selectedRateId: string;
  quoteId: string;
  quoteExpiresAt: string;
  pricing: PricingSnapshot;
}

export async function quoteCheckoutAction(input: { address: unknown; rateId?: string | null }): Promise<ActionResult<CheckoutQuote>> {
  const s = await getSettings();
  const addr = validateAddress(input.address, s.store.shipsTo);
  if (!addr.ok) return { ok: false, error: "Check your delivery address.", fieldErrors: addr.errors };
  const cart = await currentCart();
  if (!cart) return { ok: false, error: "Your bag is empty." };
  const view = await buildCartView(db(), cart, s);
  if (view.checkoutBlockers.length) return { ok: false, error: view.checkoutBlockers[0]!, code: "blocked" };
  const rates = await ratesFor(db(), addr.address.country, view.pricing.subtotalMinor - view.pricing.discountMinor, view.currency);
  if (!rates.length) return { ok: false, error: "We don't deliver to this address yet.", fieldErrors: { country: "No delivery options for this country" } };
  const selected = rates.find((r) => r.rateId === input.rateId) ?? rates[0]!;
  const fp = cartFingerprint(
    view.lines.map((l) => ({ skuId: l.skuId, qty: l.qty, personalizationKey: personalizationKey(l.personalization) })),
    view.discountCode,
  );
  const quote = await createQuote(db(), { cartId: cart.id, fingerprint: fp, address: addr.address, method: selected, ttlMinutes: s.checkout.quoteMinutes });
  const pricing = await priceForCheckout(db(), view, selected.priceMinor, s);
  return { ok: true, data: { rates, selectedRateId: selected.rateId, quoteId: quote.id, quoteExpiresAt: quote.expiresAt.toISOString(), pricing } };
}

export async function startPaymentAction(input: {
  email: string;
  address: unknown;
  quoteId: string;
  choice: "card" | "paypal";
  termsAccepted: boolean;
  acknowledgedTotalMinor: number;
  customerNote?: string | null;
}): Promise<StartCheckoutResult> {
  const parsed = z
    .object({
      email: z.string().max(200),
      address: z.unknown(),
      quoteId: uuid,
      choice: z.enum(["card", "paypal"]),
      termsAccepted: z.boolean(),
      acknowledgedTotalMinor: z.number().int().min(0),
      customerNote: z.string().max(500).nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid", message: "Please complete the form." };
  const result = await startCheckout({ ...parsed.data, cartToken: await getCartToken() });
  if (result.ok) await grantOrderAccess(result.orderId);
  else if (result.code === "already_paid" && result.orderId) await grantOrderAccess(result.orderId);
  return result;
}

export async function dropSignupAction(input: { email: string; consent: boolean }): Promise<ActionResult<{ message: string }>> {
  if (!hit(await clientKey("signup"), 5, 10 * 60_000)) return { ok: false, error: "Too many attempts. Try again later." };
  const email = z.string().trim().toLowerCase().email().max(200).safeParse(input.email);
  if (!email.success) return { ok: false, error: "Enter a valid email address.", fieldErrors: { email: "Enter a valid email address." } };
  if (!input.consent) return { ok: false, error: "Tick the box to agree to drop emails.", fieldErrors: { consent: "Required" } };
  const s = await getSettings();
  if (!s.features.dropSignup) return { ok: false, error: "Signups are closed right now." };
  const token = randomBytes(24).toString("base64url");
  const consentText = "Email me when a new drop or restock goes live. Unsubscribe any time.";
  const [row] = await db()
    .insert(dropSignups)
    .values({ email: email.data, status: "pending", consentText, consentVersion: "v1", tokenHash: createHash("sha256").update(token).digest("hex") })
    .onConflictDoNothing({ target: dropSignups.email })
    .returning();
  if (row) {
    await enqueue(db(), { type: "email.signup_confirm", payload: { signupId: row.id, token }, dedupeKey: `signup:${row.id}` });
  }
  // Same answer whether or not the address was already signed up.
  return { ok: true, data: { message: "Check your inbox to confirm. We only email about drops and restocks." } };
}

export async function orderLinkAction(input: { email: string; number: string }): Promise<ActionResult<{ message: string }>> {
  if (!hit(await clientKey("orderlink"), 5, 10 * 60_000)) return { ok: false, error: "Too many attempts. Try again later." };
  const email = z.string().trim().toLowerCase().email().safeParse(input.email);
  const number = z.string().trim().toUpperCase().max(30).safeParse(input.number);
  if (!email.success || !number.success) return { ok: false, error: "Enter your email and order number." };
  const [order] = await db()
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.number, number.data), sql`lower(${orders.email}) = ${email.data}`));
  if (order) {
    await enqueue(db(), { type: "email.order_link", payload: { orderId: order.id }, dedupeKey: `order_link:${order.id}:${Math.floor(Date.now() / 600_000)}`, orderId: order.id });
  }
  return { ok: true, data: { message: "If that order exists, we've emailed a secure link to the address used at checkout." } };
}

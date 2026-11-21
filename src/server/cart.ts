import "./guard";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Executor } from "./db";
import { cartLines, carts, discountCodes, mediaAssets, outfitItems, outfits, printTemplates, skus } from "./db/schema";
import { isSellable, loadSkuDetails, showDevData, skuAvailability, type SkuDetail } from "./catalog";
import { personalizationKey, validatePersonalization, type TemplateLike } from "./personalization";
import { priceCart, type BundleRule, type CodeRule, type TaxRule } from "./pricing";
import { getSetting, getSettings, type Settings } from "./settings";
import { ratesFor } from "./shipping";
import { mediaUrl } from "./storage";
import type { PersonalizationInput, PricingSnapshot } from "@/lib/types";

export const CART_COOKIE = "aha_cart";
export const CART_TTL_DAYS = 90;
export const MAX_LINE_QTY = 10;

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

export type CartRow = typeof carts.$inferSelect;

export async function findCart(exec: Executor, token: string | null | undefined): Promise<CartRow | null> {
  if (!token || token.length < 20) return null;
  const [c] = await exec.select().from(carts).where(eq(carts.tokenHash, hashToken(token)));
  return c ?? null;
}

export async function createCart(exec: Executor, currency: string): Promise<{ cart: CartRow; token: string }> {
  const token = newToken();
  const [cart] = await exec.insert(carts).values({ tokenHash: hashToken(token), currency }).returning();
  return { cart: cart!, token };
}

export function taxRuleFrom(s: Settings): TaxRule & { unconfigured: boolean } {
  if (s.tax.mode === "unconfigured") {
    return { mode: "vat_inclusive", label: s.tax.label, rateBps: s.tax.rateBps, shippingTaxable: s.tax.shippingTaxable, unconfigured: true };
  }
  return { mode: s.tax.mode, label: s.tax.label, rateBps: s.tax.rateBps, shippingTaxable: s.tax.shippingTaxable, unconfigured: false };
}

export async function activeBundles(exec: Executor): Promise<BundleRule[]> {
  const dev = showDevData();
  const rows = await exec.select().from(outfits).where(eq(outfits.status, "active"));
  const eligible = rows.filter((o) => o.bundleDiscountBps && (o.bundleApproved || dev));
  if (eligible.length === 0) return [];
  const items = await exec.select().from(outfitItems).where(inArray(outfitItems.outfitId, eligible.map((o) => o.id)));
  return eligible.map((o) => ({
    ref: o.id,
    label: o.title,
    bps: o.bundleDiscountBps!,
    minItems: o.bundleMinItems,
    productIds: [...new Set(items.filter((i) => i.outfitId === o.id).map((i) => i.productId))],
  }));
}

export async function codeRule(exec: Executor, code: string | null, currency: string): Promise<{ rule: CodeRule | null; error: string | null }> {
  if (!code) return { rule: null, error: null };
  const [d] = await exec.select().from(discountCodes).where(eq(discountCodes.code, code.toUpperCase()));
  const now = new Date();
  if (!d || !d.active) return { rule: null, error: "That code isn't valid." };
  if ((d.startsAt && d.startsAt > now) || (d.endsAt && d.endsAt < now)) return { rule: null, error: "That code isn't active right now." };
  if (d.usageLimit != null && d.usedCount >= d.usageLimit) return { rule: null, error: "That code has been fully used." };
  if (d.kind === "amount" && d.currency && d.currency !== currency) return { rule: null, error: "That code can't be used in this currency." };
  return { rule: { code: d.code, kind: d.kind, value: d.value, minSubtotalMinor: d.minSubtotalMinor }, error: null };
}

async function templatesById(exec: Executor, ids: string[]): Promise<Map<string, TemplateLike & { status: string; supplierApproved: boolean }>> {
  if (ids.length === 0) return new Map();
  const rows = await exec.select().from(printTemplates).where(inArray(printTemplates.id, ids));
  return new Map(rows.map((t) => [t.id, t]));
}

export interface CartLineView {
  id: string;
  skuId: string;
  skuCode: string;
  qty: number;
  productId: string;
  productName: string;
  productSlug: string;
  categoryLabel: string;
  variantId: string;
  variantLabel: string;
  size: string;
  unitPriceMinor: number;
  personalization: PersonalizationInput | null;
  personalizationLabel: string | null;
  personalizationUnitMinor: number;
  lineSubtotalMinor: number;
  discountMinor: number;
  lineTotalMinor: number;
  image: { url: string; width: number; height: number; alt: string } | null;
  status: "ok" | "sold_out" | "insufficient" | "unavailable" | "invalid_personalization";
  issue: string | null;
  available: number | null;
  fulfillmentMode: "stocked" | "made_to_order";
  leadTime: { minDays: number; maxDays: number } | null;
  personalizationProductionDays: number | null;
  withdrawalRule: "standard" | "personalized_exempt";
  sizeOptions: { skuId: string; size: string; available: boolean }[];
}

export interface CartView {
  id: string | null;
  currency: string;
  lines: CartLineView[];
  itemCount: number;
  pricing: PricingSnapshot;
  shippingFromMinor: number | null;
  discountCode: string | null;
  discountError: string | null;
  taxUnconfigured: boolean;
  checkoutBlockers: string[];
  pendingOrderId: string | null;
}

export function emptyCartView(currency: string): CartView {
  return {
    id: null,
    currency,
    lines: [],
    itemCount: 0,
    pricing: { currency, lines: [], subtotalMinor: 0, discountMinor: 0, shippingMinor: 0, taxMinor: 0, totalMinor: 0, discounts: [], tax: { mode: "vat_inclusive", label: "", lines: [] } },
    shippingFromMinor: null,
    discountCode: null,
    discountError: null,
    taxUnconfigured: false,
    checkoutBlockers: [],
    pendingOrderId: null,
  };
}

export async function buildCartView(exec: Executor, cart: CartRow | null, settingsIn?: Settings): Promise<CartView> {
  const s = settingsIn ?? (await getSettings(exec));
  if (!cart) return emptyCartView(s.store.currency);
  const rows = await exec.select().from(cartLines).where(eq(cartLines.cartId, cart.id)).orderBy(asc(cartLines.createdAt));
  const details = await loadSkuDetails(exec, rows.map((r) => r.skuId));
  const byId = new Map(details.map((d) => [d.skuId, d]));
  // all sibling SKUs (for in-cart size changes)
  const variantIds = [...new Set(details.map((d) => d.variantId))];
  const siblings = variantIds.length
    ? await exec
        .select({ id: skus.id, variantId: skus.variantId, size: skus.size })
        .from(skus)
        .where(and(eq(skus.status, "active"), inArray(skus.variantId, variantIds)))
        .orderBy(asc(skus.sizeSort))
    : [];
  const siblingIds = siblings.map((r) => r.id);
  const avail = await skuAvailability(exec, [...new Set([...rows.map((r) => r.skuId), ...siblingIds])]);
  const templates = await templatesById(exec, [...new Set(details.map((d) => d.personalizationTemplateId).filter((x): x is string => Boolean(x)))]);
  const media = variantIds.length
    ? await exec
        .select()
        .from(mediaAssets)
        .where(and(inArray(mediaAssets.variantId, variantIds), sql`${mediaAssets.archivedAt} is null`))
        .orderBy(asc(mediaAssets.sort))
    : [];
  const dev = showDevData();

  const lines: CartLineView[] = [];
  const qtyBySku = new Map<string, number>();
  for (const r of rows) qtyBySku.set(r.skuId, (qtyBySku.get(r.skuId) ?? 0) + r.qty);

  for (const r of rows) {
    const d = byId.get(r.skuId);
    if (!d) continue;
    const mto = d.fulfillmentMode === "made_to_order";
    const sell = isSellable(d);
    const available = mto ? null : (avail.get(d.skuId) ?? 0);
    let status: CartLineView["status"] = "ok";
    let issue: string | null = null;
    if (!sell.ok) {
      status = "unavailable";
      issue = sell.reason;
    } else if (!mto && (available ?? 0) === 0) {
      status = "sold_out";
      issue = "This size has sold out.";
    } else if (!mto && (qtyBySku.get(d.skuId) ?? 0) > (available ?? 0)) {
      status = "insufficient";
      issue = `We can only hold ${available} of this size right now.`;
    }
    let personalizationUnit = 0;
    let label: string | null = null;
    if (r.personalization) {
      const t = d.personalizationTemplateId ? templates.get(d.personalizationTemplateId) : undefined;
      const allowed = s.features.personalization && d.personalizationEnabled && t && (dev || (t.status === "approved" && t.supplierApproved && d.personalizationProductionDays != null));
      const v = t ? validatePersonalization(r.personalization, t, d.personalizationArea) : null;
      if (!allowed || !v?.ok) {
        status = "invalid_personalization";
        issue = "Personalisation for this item is no longer available. Remove it or edit the line.";
      } else {
        personalizationUnit = d.personalizationPriceMinor ?? 0;
        const color = t.colors.find((c) => c.id === r.personalization!.colorId);
        label = `Locker Tag: ${Object.values(r.personalization.fields).filter(Boolean).join(" · ")}${color ? ` (${color.name})` : ""}`;
      }
    }
    const img = media.find((m) => m.variantId === d.variantId && m.kind === "front") ?? media.find((m) => m.variantId === d.variantId);
    lines.push({
      id: r.id,
      skuId: d.skuId,
      skuCode: d.skuCode,
      qty: r.qty,
      productId: d.productId,
      productName: d.productName,
      productSlug: d.productSlug,
      categoryLabel: d.categoryLabel,
      variantId: d.variantId,
      variantLabel: d.optionLabel ? `${d.colorName} / ${d.optionLabel}` : d.colorName,
      size: d.size,
      unitPriceMinor: d.priceMinor,
      personalization: r.personalization ?? null,
      personalizationLabel: label,
      personalizationUnitMinor: personalizationUnit,
      lineSubtotalMinor: 0,
      discountMinor: 0,
      lineTotalMinor: 0,
      image: img ? { url: mediaUrl(img.storageKey), width: img.width, height: img.height, alt: img.alt } : null,
      status,
      issue,
      available,
      fulfillmentMode: d.fulfillmentMode,
      leadTime:
        mto && d.leadTimeMinDays != null && d.leadTimeMaxDays != null && (d.leadTimeApproved || dev)
          ? { minDays: d.leadTimeMinDays, maxDays: d.leadTimeMaxDays }
          : null,
      personalizationProductionDays: r.personalization ? d.personalizationProductionDays : null,
      withdrawalRule: r.personalization && d.personalizationNoWithdrawal ? "personalized_exempt" : "standard",
      sizeOptions: siblings
        .filter((sb) => sb.variantId === d.variantId)
        .map((sb) => ({ skuId: sb.id, size: sb.size, available: mto || (avail.get(sb.id) ?? 0) > 0 })),
    });
  }

  const bundles = await activeBundles(exec);
  const { rule, error: discountError } = await codeRule(exec, cart.discountCode, cart.currency);
  const tax = taxRuleFrom(s);
  const priceable = lines.filter((l) => l.status === "ok");
  const pricing = priceCart({
    currency: cart.currency,
    lines: priceable.map((l) => ({
      key: l.id,
      skuId: l.skuId,
      productId: l.productId,
      qty: l.qty,
      unitPriceMinor: l.unitPriceMinor,
      personalizationUnitMinor: l.personalizationUnitMinor,
    })),
    bundles,
    code: rule,
    shippingMinor: 0,
    tax,
  });
  for (const l of lines) {
    const p = pricing.lines.find((x) => x.key === l.id);
    l.lineSubtotalMinor = p?.lineSubtotalMinor ?? (l.unitPriceMinor + l.personalizationUnitMinor) * l.qty;
    l.discountMinor = p?.discountMinor ?? 0;
    l.lineTotalMinor = p?.lineTotalMinor ?? l.lineSubtotalMinor;
  }
  const rates = await ratesFor(exec, s.store.market, pricing.subtotalMinor - pricing.discountMinor, cart.currency);
  const blockers: string[] = [];
  if (lines.some((l) => l.status !== "ok")) blockers.push("Some items need your attention before checkout.");
  if (priceable.length === 0) blockers.push("Your bag is empty.");
  return {
    id: cart.id,
    currency: cart.currency,
    lines,
    itemCount: lines.reduce((n, l) => n + l.qty, 0),
    pricing,
    shippingFromMinor: rates.length ? Math.min(...rates.map((r) => r.priceMinor)) : null,
    discountCode: cart.discountCode,
    discountError,
    taxUnconfigured: tax.unconfigured,
    checkoutBlockers: blockers,
    pendingOrderId: cart.pendingOrderId,
  };
}

/* ───────────────────────────── mutations ───────────────────────────── */

export class CartError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_found"
      | "unavailable"
      | "sold_out"
      | "insufficient"
      | "invalid_personalization"
      | "invalid_qty"
      | "invalid",
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "CartError";
  }
}

/** Sellable + enough unreserved stock for the total quantity of this SKU in the bag. */
async function checkAddable(exec: Executor, d: SkuDetail | undefined, wantedTotal: number) {
  if (!d) throw new CartError("We couldn't find that item.", "not_found");
  const sell = isSellable(d);
  if (!sell.ok) throw new CartError(sell.reason, "unavailable");
  if (d.fulfillmentMode === "made_to_order") return;
  const available = (await skuAvailability(exec, [d.skuId])).get(d.skuId) ?? 0;
  if (available <= 0) throw new CartError(`Size ${d.size} has just sold out. Choose another size.`, "sold_out");
  if (wantedTotal > available) {
    throw new CartError(`We can only hold ${available} of size ${d.size} right now.`, "insufficient");
  }
}

async function normalizePersonalization(exec: Executor, d: SkuDetail, p: PersonalizationInput | null | undefined) {
  if (!p) return null;
  if (!d.personalizationEnabled || !d.personalizationTemplateId) throw new CartError("This item can't be personalised.", "invalid_personalization");
  if (!(await getSetting("features", exec)).personalization) throw new CartError("Personalisation isn't available right now.", "invalid_personalization");
  const t = (await templatesById(exec, [d.personalizationTemplateId])).get(d.personalizationTemplateId);
  if (!t || (!showDevData() && !(t.status === "approved" && t.supplierApproved && d.personalizationProductionDays != null))) {
    throw new CartError("Personalisation isn't available right now.", "invalid_personalization");
  }
  const v = validatePersonalization(p, t, d.personalizationArea);
  if (!v.ok) throw new CartError(Object.values(v.errors)[0] ?? "Check your personalisation.", "invalid_personalization", v.errors);
  return v.normalized;
}

export async function addLine(
  exec: Executor,
  cart: CartRow,
  input: { skuId: string; qty: number; personalization?: PersonalizationInput | null; outfitId?: string | null },
): Promise<void> {
  const qty = Math.floor(Number(input.qty));
  if (!Number.isFinite(qty) || qty < 1) throw new CartError("Choose a quantity.", "invalid_qty");
  const [d] = await loadSkuDetails(exec, [input.skuId]);
  if (!d) throw new CartError("We couldn't find that size.", "not_found");
  const p = await normalizePersonalization(exec, d, input.personalization);
  const key = personalizationKey(p);
  const existing = await exec
    .select()
    .from(cartLines)
    .where(and(eq(cartLines.cartId, cart.id), eq(cartLines.skuId, d.skuId)));
  const sameLine = existing.find((l) => l.personalizationKey === key);
  const lineQty = (sameLine?.qty ?? 0) + qty;
  if (lineQty > MAX_LINE_QTY) throw new CartError(`You can add up to ${MAX_LINE_QTY} of one item.`, "invalid_qty");
  await checkAddable(exec, d, existing.reduce((n, l) => n + l.qty, 0) + qty);
  if (sameLine) {
    const next = lineQty;
    await exec.update(cartLines).set({ qty: next, updatedAt: new Date() }).where(eq(cartLines.id, sameLine.id));
  } else {
    await exec.insert(cartLines).values({
      cartId: cart.id,
      skuId: d.skuId,
      qty,
      personalization: p,
      personalizationKey: key,
      outfitId: input.outfitId ?? null,
    });
  }
  await touch(exec, cart.id);
}

export async function updateLine(
  exec: Executor,
  cart: CartRow,
  lineId: string,
  patch: { qty?: number; skuId?: string; personalization?: PersonalizationInput | null },
): Promise<void> {
  const [line] = await exec.select().from(cartLines).where(and(eq(cartLines.id, lineId), eq(cartLines.cartId, cart.id)));
  if (!line) throw new CartError("That item is no longer in your bag.", "not_found");
  const skuId = patch.skuId ?? line.skuId;
  const qty = patch.qty != null ? Math.floor(Number(patch.qty)) : line.qty;
  if (qty < 1 || qty > MAX_LINE_QTY) throw new CartError(`Choose between 1 and ${MAX_LINE_QTY}.`, "invalid_qty");
  const [d] = await loadSkuDetails(exec, [skuId]);
  if (!d) throw new CartError("We couldn't find that size.", "not_found");
  if (patch.skuId && patch.skuId !== line.skuId) {
    const [old] = await loadSkuDetails(exec, [line.skuId]);
    if (!old || old.variantId !== d.variantId) throw new CartError("You can only change the size here.", "invalid");
  }
  const personalization = patch.personalization !== undefined ? await normalizePersonalization(exec, d, patch.personalization) : line.personalization;
  if (patch.personalization === undefined && personalization && skuId !== line.skuId) {
    // re-validate an existing tag against the new size's variant area (same variant, so same area)
    await normalizePersonalization(exec, d, { ...personalization, spellingConfirmed: true });
  }
  const others = await exec
    .select()
    .from(cartLines)
    .where(and(eq(cartLines.cartId, cart.id), eq(cartLines.skuId, skuId)));
  const otherQty = others.filter((o) => o.id !== line.id).reduce((n, o) => n + o.qty, 0);
  await checkAddable(exec, d, otherQty + qty);
  const key = personalizationKey(personalization);
  const clash = others.find((o) => o.id !== line.id && o.personalizationKey === key);
  if (clash) {
    // merge into the identical line
    const merged = Math.min(MAX_LINE_QTY, clash.qty + qty);
    await exec.update(cartLines).set({ qty: merged, updatedAt: new Date() }).where(eq(cartLines.id, clash.id));
    await exec.delete(cartLines).where(eq(cartLines.id, line.id));
  } else {
    await exec
      .update(cartLines)
      .set({ skuId, qty, personalization, personalizationKey: key, updatedAt: new Date() })
      .where(eq(cartLines.id, line.id));
  }
  await touch(exec, cart.id);
}

export async function removeLine(exec: Executor, cart: CartRow, lineId: string): Promise<void> {
  await exec.delete(cartLines).where(and(eq(cartLines.id, lineId), eq(cartLines.cartId, cart.id)));
  await touch(exec, cart.id);
}

export async function setDiscountCode(exec: Executor, cart: CartRow, code: string | null): Promise<string | null> {
  const clean = code?.trim().toUpperCase() || null;
  if (clean) {
    const { error } = await codeRule(exec, clean, cart.currency);
    if (error) return error;
  }
  await exec.update(carts).set({ discountCode: clean, updatedAt: new Date() }).where(eq(carts.id, cart.id));
  return null;
}

async function touch(exec: Executor, cartId: string) {
  // Any change to the bag invalidates a pending (unpaid) order built from it.
  await exec.update(carts).set({ updatedAt: new Date(), lastSeenAt: new Date() }).where(eq(carts.id, cartId));
}


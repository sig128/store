/**
 * Server-side pricing. Pure functions: the browser never sends prices, only SKU
 * ids, quantities and personalisation input; everything here is recomputed on
 * the server from catalog data and operator configuration.
 */
import { allocate } from "@/lib/money";
import type { AppliedDiscount, PriceBreakdownLine, PricingSnapshot, TaxSnapshot } from "@/lib/types";

export interface PricingLineInput {
  key: string;
  skuId: string;
  productId: string;
  qty: number;
  unitPriceMinor: number;
  personalizationUnitMinor: number;
}

export interface BundleRule {
  ref: string; // outfit id
  label: string;
  bps: number;
  minItems: number;
  productIds: string[];
}

export interface CodeRule {
  code: string;
  kind: "percent" | "amount";
  value: number;
  minSubtotalMinor: number;
}

export interface TaxRule {
  mode: "vat_inclusive" | "not_registered" | "unconfigured";
  label: string;
  rateBps: number;
  shippingTaxable: boolean;
}

export interface PricingInput {
  currency: string;
  lines: PricingLineInput[];
  bundles?: BundleRule[];
  code?: CodeRule | null;
  shippingMinor?: number;
  tax: TaxRule;
}

/** VAT contained in a VAT-inclusive amount, rounded to the nearest minor unit. */
export function includedTax(grossMinor: number, rateBps: number): number {
  if (rateBps <= 0 || grossMinor <= 0) return 0;
  return Math.round((grossMinor * rateBps) / (10000 + rateBps));
}

export function priceCart(input: PricingInput): PricingSnapshot {
  const lines = input.lines.filter((l) => l.qty > 0);
  const subtotal = lines.reduce((s, l) => s + (l.unitPriceMinor + l.personalizationUnitMinor) * l.qty, 0);
  const lineDiscount = new Map<string, number>(lines.map((l) => [l.key, 0]));
  const discounts: AppliedDiscount[] = [];

  // 1. Bundle savings: one unit of each distinct outfit piece, when enough pieces are in the bag.
  const usedUnits = new Map<string, number>(); // line key -> units already discounted
  for (const b of input.bundles ?? []) {
    if (b.bps <= 0) continue;
    const matched: PricingLineInput[] = [];
    for (const pid of b.productIds) {
      const line = lines.find((l) => l.productId === pid && (usedUnits.get(l.key) ?? 0) < l.qty);
      if (line) matched.push(line);
    }
    if (matched.length < b.minItems) continue;
    let total = 0;
    for (const l of matched) {
      const d = Math.round((l.unitPriceMinor * b.bps) / 10000);
      lineDiscount.set(l.key, (lineDiscount.get(l.key) ?? 0) + d);
      usedUnits.set(l.key, (usedUnits.get(l.key) ?? 0) + 1);
      total += d;
    }
    if (total > 0) discounts.push({ kind: "bundle", ref: b.ref, label: `Fit saving — ${b.label}`, amountMinor: total });
  }

  // 2. Discount code on what remains, allocated across lines.
  const afterBundles = subtotal - [...lineDiscount.values()].reduce((a, b) => a + b, 0);
  if (input.code && afterBundles >= input.code.minSubtotalMinor && afterBundles > 0) {
    const amount =
      input.code.kind === "percent"
        ? Math.round((afterBundles * input.code.value) / 10000)
        : Math.min(input.code.value, afterBundles);
    if (amount > 0) {
      const weights = lines.map((l) => (l.unitPriceMinor + l.personalizationUnitMinor) * l.qty - (lineDiscount.get(l.key) ?? 0));
      const parts = allocate(amount, weights);
      lines.forEach((l, i) => lineDiscount.set(l.key, (lineDiscount.get(l.key) ?? 0) + (parts[i] ?? 0)));
      discounts.push({ kind: "code", ref: input.code.code, label: `Code ${input.code.code}`, amountMinor: amount });
    }
  }

  const shipping = Math.max(0, input.shippingMinor ?? 0);
  const vat = input.tax.mode === "not_registered" ? 0 : input.tax.rateBps;
  const breakdown: PriceBreakdownLine[] = lines.map((l) => {
    const lineSubtotal = (l.unitPriceMinor + l.personalizationUnitMinor) * l.qty;
    const discount = Math.min(lineSubtotal, lineDiscount.get(l.key) ?? 0);
    const lineTotal = lineSubtotal - discount;
    return {
      key: l.key,
      skuId: l.skuId,
      qty: l.qty,
      unitPriceMinor: l.unitPriceMinor,
      personalizationUnitMinor: l.personalizationUnitMinor,
      lineSubtotalMinor: lineSubtotal,
      discountMinor: discount,
      lineTotalMinor: lineTotal,
      taxMinor: includedTax(lineTotal, vat),
    };
  });
  const goodsTotal = breakdown.reduce((s, l) => s + l.lineTotalMinor, 0);
  const goodsTax = breakdown.reduce((s, l) => s + l.taxMinor, 0);
  const shippingTax = input.tax.shippingTaxable ? includedTax(shipping, vat) : 0;
  const discountTotal = breakdown.reduce((s, l) => s + l.discountMinor, 0);

  const tax: TaxSnapshot =
    input.tax.mode === "not_registered"
      ? { mode: "not_registered", label: "No VAT charged", lines: [] }
      : {
          mode: "vat_inclusive",
          label: input.tax.label,
          lines: [
            { label: `${input.tax.label} ${(vat / 100).toFixed(vat % 100 ? 2 : 0)}% on goods`, rateBps: vat, taxableMinor: goodsTotal, taxMinor: goodsTax },
            ...(shipping > 0 && input.tax.shippingTaxable
              ? [{ label: `${input.tax.label} ${(vat / 100).toFixed(vat % 100 ? 2 : 0)}% on shipping`, rateBps: vat, taxableMinor: shipping, taxMinor: shippingTax }]
              : []),
          ],
        };

  return {
    currency: input.currency,
    lines: breakdown,
    subtotalMinor: subtotal,
    discountMinor: discountTotal,
    shippingMinor: shipping,
    taxMinor: goodsTax + shippingTax,
    totalMinor: goodsTotal + shipping,
    discounts,
    tax,
  };
}

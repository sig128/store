import { describe, expect, it } from "vitest";
import { includedTax, priceCart, type PricingLineInput, type TaxRule } from "@/server/pricing";
import { allocate } from "@/lib/money";

const VAT: TaxRule = { mode: "vat_inclusive", label: "MVA", rateBps: 2500, shippingTaxable: true };
const line = (key: string, productId: string, unit: number, qty = 1, pers = 0): PricingLineInput => ({ key, skuId: `sku-${key}`, productId, qty, unitPriceMinor: unit, personalizationUnitMinor: pers });

describe("VAT-inclusive pricing", () => {
  it("extracts included VAT instead of adding it", () => {
    expect(includedTax(54900, 2500)).toBe(10980);
    expect(includedTax(0, 2500)).toBe(0);
    const p = priceCart({ currency: "NOK", lines: [line("a", "p1", 54900)], shippingMinor: 14900, tax: VAT });
    expect(p.totalMinor).toBe(54900 + 14900);
    expect(p.taxMinor).toBe(includedTax(54900, 2500) + includedTax(14900, 2500));
    expect(p.tax.lines.reduce((s, l) => s + l.taxMinor, 0)).toBe(p.taxMinor);
  });

  it("charges and shows no VAT when the seller is not registered", () => {
    const p = priceCart({ currency: "NOK", lines: [line("a", "p1", 54900)], shippingMinor: 7900, tax: { ...VAT, mode: "not_registered" } });
    expect(p.taxMinor).toBe(0);
    expect(p.tax.lines).toEqual([]);
    expect(p.totalMinor).toBe(62800);
  });
});

describe("fit bundle saving", () => {
  const bundle = { ref: "fit1", label: "Training", bps: 1000, minItems: 3, productIds: ["tee", "stringer", "shorts"] };

  it("takes the saving off one unit of each distinct piece", () => {
    const p = priceCart({ currency: "NOK", lines: [line("a", "tee", 54900, 2), line("b", "stringer", 39900), line("c", "shorts", 49900)], bundles: [bundle], tax: VAT });
    expect(p.discounts).toEqual([{ kind: "bundle", ref: "fit1", label: "Fit saving — Training", amountMinor: 5490 + 3990 + 4990 }]);
    expect(p.lines.find((l) => l.key === "a")!.discountMinor).toBe(5490); // only one of the two tees
  });

  it("doesn't apply with too few pieces", () => {
    const p = priceCart({ currency: "NOK", lines: [line("a", "tee", 54900), line("b", "stringer", 39900)], bundles: [bundle], tax: VAT });
    expect(p.discountMinor).toBe(0);
  });
});

describe("discount codes", () => {
  it("allocates a percent code across lines to the exact minor unit", () => {
    const p = priceCart({ currency: "NOK", lines: [line("a", "p1", 33333), line("b", "p2", 66667, 3), line("c", "p3", 101, 1, 14900)], code: { code: "X", kind: "percent", value: 1250, minSubtotalMinor: 0 }, shippingMinor: 7900, tax: VAT });
    const code = p.discounts.find((d) => d.kind === "code")!;
    expect(p.lines.reduce((s, l) => s + l.discountMinor, 0)).toBe(code.amountMinor);
    expect(p.totalMinor).toBe(p.lines.reduce((s, l) => s + l.lineTotalMinor, 0) + 7900);
  });

  it("an amount code never makes the goods negative and respects its minimum", () => {
    const small = priceCart({ currency: "NOK", lines: [line("a", "p1", 5000)], code: { code: "BIG", kind: "amount", value: 100000, minSubtotalMinor: 0 }, tax: VAT });
    expect(small.totalMinor).toBe(0);
    const below = priceCart({ currency: "NOK", lines: [line("a", "p1", 5000)], code: { code: "MIN", kind: "amount", value: 1000, minSubtotalMinor: 10000 }, tax: VAT });
    expect(below.discountMinor).toBe(0);
  });

  it("random carts always add up", () => {
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 48271) % 2147483647) % n);
    for (let i = 0; i < 300; i++) {
      const lines = Array.from({ length: 1 + rnd(5) }, (_, j) => line(`l${j}`, `p${rnd(4)}`, 100 + rnd(200000), 1 + rnd(4), rnd(2) ? 14900 : 0));
      const p = priceCart({
        currency: "NOK",
        lines,
        bundles: [{ ref: "b", label: "B", bps: 1000 + rnd(1500), minItems: 2, productIds: ["p0", "p1", "p2"] }],
        code: rnd(2) ? { code: "C", kind: rnd(2) ? "percent" : "amount", value: 1 + rnd(5000), minSubtotalMinor: 0 } : null,
        shippingMinor: rnd(3) * 7900,
        tax: VAT,
      });
      const goods = p.lines.reduce((s, l) => s + l.lineTotalMinor, 0);
      expect(p.totalMinor).toBe(goods + p.shippingMinor);
      expect(p.subtotalMinor - p.discountMinor).toBe(goods);
      expect(p.discounts.reduce((s, d) => s + d.amountMinor, 0)).toBe(p.discountMinor);
      for (const l of p.lines) expect(l.lineTotalMinor).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("allocate", () => {
  it("splits exactly and deterministically", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    expect(allocate(7, [0, 0])).toEqual([0, 0]);
  });
});

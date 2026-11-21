import type { AttemptRow, OrderLineRow, OrderRow } from "@/server/payments/types";

/** A two-line order snapshot (one personalised line, one discounted line that doesn't divide evenly). */
export function orderFixture() {
  const order = {
    id: "0b6a7c2e-5d1f-4f3a-9a77-1c2d3e4f5a6b",
    number: "AHA-10042",
    email: "buyer@example.com",
    currency: "NOK",
    market: "NO",
    subtotalMinor: 54900 * 2 + 44900 + 14900,
    discountMinor: 1,
    shippingMinor: 14900,
    taxMinor: 0,
    totalMinor: 0,
    shippingAddress: { name: "Kari Nordmann", line1: "Storgata 1", line2: null, postalCode: "0155", city: "Oslo", country: "NO", phone: "+47 400 00 000" },
    shippingMethod: { rateId: "r1", name: "Home delivery", carrier: "Posten/Bring", service: null, priceMinor: 14900, currency: "NOK", minDays: null, maxDays: null },
  } as unknown as OrderRow;
  const lines = [
    {
      lineNo: 1,
      skuCode: "LS-WBLK-M",
      productName: "LAST SET",
      variantLabel: "Washed Black",
      size: "M",
      qty: 2,
      lineTotalMinor: 54900 * 2 - 1, // 109799: doesn't divide by 2
      personalization: null,
    },
    {
      lineNo: 2,
      skuCode: "HC-ASPH-M",
      productName: "HEAT CHECK",
      variantLabel: "Asphalt",
      size: "M",
      qty: 1,
      lineTotalMinor: 44900 + 14900,
      personalization: { displayText: "NORD · 13" },
    },
  ] as unknown as OrderLineRow[];
  (order as { totalMinor: number }).totalMinor = lines.reduce((s, l) => s + l.lineTotalMinor, 0) + order.shippingMinor;
  const attempt = {
    id: "5f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f",
    orderId: order.id,
    provider: "stripe",
    status: "creating",
    amountMinor: order.totalMinor,
    currency: "NOK",
    providerRef: "ORDER-PP-1",
    expiresAt: new Date("2026-11-16T12:30:00Z"),
  } as unknown as AttemptRow;
  return { order, lines, attempt };
}

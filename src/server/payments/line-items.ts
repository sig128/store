import type { OrderLineRow, OrderRow } from "./types";
import { ProviderError } from "./types";

export interface ProviderLine {
  name: string;
  sku: string;
  quantity: number;
  unitAmountMinor: number;
}

/**
 * Provider line items whose sum equals the order's goods total exactly.
 * Discounts are already allocated per line; when a discounted line total does not
 * divide evenly by its quantity, it is sent as one line ("2 × …") instead of
 * rounding unit prices.
 */
export function checkoutLineItems(order: OrderRow, lines: OrderLineRow[]): { lines: ProviderLine[]; goodsTotalMinor: number } {
  const out: ProviderLine[] = [];
  for (const l of [...lines].sort((a, b) => a.lineNo - b.lineNo)) {
    const label = `${l.productName} — ${l.variantLabel}, ${l.size}${l.personalization ? ` (Locker Tag: ${l.personalization.displayText})` : ""}`.slice(0, 120);
    if (l.lineTotalMinor % l.qty === 0) {
      out.push({ name: label, sku: l.skuCode, quantity: l.qty, unitAmountMinor: l.lineTotalMinor / l.qty });
    } else {
      out.push({ name: `${l.qty} × ${label}`.slice(0, 120), sku: l.skuCode, quantity: 1, unitAmountMinor: l.lineTotalMinor });
    }
  }
  const goods = out.reduce((s, l) => s + l.unitAmountMinor * l.quantity, 0);
  if (goods + order.shippingMinor !== order.totalMinor) {
    throw new ProviderError(`Line items (${goods}) + shipping (${order.shippingMinor}) do not equal order total (${order.totalMinor}).`);
  }
  return { lines: out, goodsTotalMinor: goods };
}

/** "549.00" for PayPal-style decimal strings (2-decimal currencies only). */
export function toDecimal(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Parse a provider decimal string into minor units without floating-point error. */
export function fromDecimal(value: string): number {
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) throw new ProviderError(`Unexpected amount format: ${value}`);
  const minor = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  return m[1] ? -minor : minor;
}

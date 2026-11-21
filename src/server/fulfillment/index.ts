import "../guard";
import { asc, eq, inArray } from "drizzle-orm";
import { db, type Executor } from "../db";
import { artworks, fulfillmentRequests, orderLines, orders } from "../db/schema";
import { env } from "../env";
import type { Address, ShippingMethodSnapshot } from "@/lib/types";

/**
 * Fulfilment: manual packing is the working path from day one. A print/POD
 * provider plugs in behind FulfillmentAdapter later. A supplier order is never
 * shown as placed unless the provider confirmed it (or the operator recorded
 * their own supplier reference for a manual order).
 */

export interface ProductionLine {
  lineNo: number;
  sku: string;
  product: string;
  variant: string;
  color: string;
  size: string;
  qty: number;
  fulfillmentMode: string;
  prints: { artworkCode: string; version: number; placement: string; printFileKey: string | null; method: string | null }[];
  personalization: null | {
    text: Record<string, string>;
    displayText: string;
    template: string;
    templateVersion: number;
    placement: string;
    areaMm: { widthMm: number; heightMm: number; offsetFromCollarMm: number };
    font: { id: string; name: string; version: string };
    color: { id: string; name: string; hex: string };
    customerConfirmedAt: string;
  };
}
export interface ProductionPayload {
  schema: "aha.production/v1";
  orderId: string;
  orderNumber: string;
  placedAt: string;
  shipTo: Address;
  shippingMethod: ShippingMethodSnapshot;
  lines: ProductionLine[];
  customerNote: string | null;
}

export interface FulfillmentAdapter {
  id: "manual" | "pod";
  label: string;
  connection(): "manual" | "connected" | "not_connected";
  submit(payload: ProductionPayload): Promise<{ status: "draft" | "submitted" | "confirmed" | "not_connected" | "failed"; providerRef?: string; error?: string }>;
}

const manual: FulfillmentAdapter = {
  id: "manual",
  label: "Manual (packing slip + supplier sheet)",
  connection: () => "manual",
  async submit() {
    return { status: "draft" };
  },
};

/** Placeholder adapter for a future print-on-demand / printer API. */
const pod: FulfillmentAdapter = {
  id: "pod",
  label: "Print-on-demand provider",
  connection: () => (env().POD_API_KEY && env().POD_API_BASE ? "connected" : "not_connected"),
  async submit() {
    if (!env().POD_API_KEY || !env().POD_API_BASE) return { status: "not_connected", error: "Not connected" };
    // Implement the provider's documented order API here. Until then, nothing is sent.
    return { status: "failed", error: "POD adapter not implemented for this provider yet" };
  },
};

export function fulfillmentAdapter(): FulfillmentAdapter {
  return env().FULFILLMENT_PROVIDER === "pod" ? pod : manual;
}

export async function buildProductionPayload(exec: Executor, orderId: string): Promise<ProductionPayload> {
  const [o] = await exec.select().from(orders).where(eq(orders.id, orderId));
  if (!o) throw new Error("Order not found");
  const lines = await exec.select().from(orderLines).where(eq(orderLines.orderId, orderId)).orderBy(asc(orderLines.lineNo));
  const artIds = [...new Set(lines.flatMap((l) => l.prints.map((p) => p.artworkId)))];
  const arts = artIds.length ? await exec.select().from(artworks).where(inArray(artworks.id, artIds)) : [];
  return {
    schema: "aha.production/v1",
    orderId: o.id,
    orderNumber: o.number,
    placedAt: (o.paidAt ?? o.createdAt).toISOString(),
    shipTo: o.shippingAddress,
    shippingMethod: o.shippingMethod,
    customerNote: o.customerNote,
    lines: lines.map((l) => ({
      lineNo: l.lineNo,
      sku: l.skuCode,
      product: l.productName,
      variant: l.variantLabel,
      color: l.colorName,
      size: l.size,
      qty: l.qty,
      fulfillmentMode: l.fulfillmentMode,
      prints: l.prints.map((p) => ({
        artworkCode: p.code,
        version: p.version,
        placement: p.placement,
        printFileKey: arts.find((a) => a.id === p.artworkId)?.printFileKey ?? null,
        method: p.method,
      })),
      personalization: l.personalization
        ? {
            text: l.personalization.fields,
            displayText: l.personalization.displayText,
            template: l.personalization.templateCode,
            templateVersion: l.personalization.templateVersion,
            placement: l.personalization.placement,
            areaMm: l.personalization.areaMm,
            font: l.personalization.font,
            color: l.personalization.color,
            customerConfirmedAt: l.personalization.approvedAt,
          }
        : null,
    })),
  };
}

/** Called once per paid order (deduplicated job): stores the structured production data. */
export async function prepareFulfillment(orderId: string): Promise<void> {
  const payload = await buildProductionPayload(db(), orderId);
  const adapter = fulfillmentAdapter();
  await db()
    .insert(fulfillmentRequests)
    .values({ orderId, provider: adapter.id, status: adapter.id === "manual" ? "draft" : "not_connected", payload: payload as unknown as Record<string, unknown> })
    .onConflictDoNothing({ target: [fulfillmentRequests.orderId, fulfillmentRequests.provider] });
}

export async function submitFulfillment(orderId: string): Promise<string> {
  const adapter = fulfillmentAdapter();
  const payload = await buildProductionPayload(db(), orderId);
  const res = await adapter.submit(payload);
  await db()
    .insert(fulfillmentRequests)
    .values({ orderId, provider: adapter.id, status: res.status, providerRef: res.providerRef ?? null, payload: payload as unknown as Record<string, unknown>, error: res.error ?? null, submittedAt: res.status === "submitted" || res.status === "confirmed" ? new Date() : null, confirmedAt: res.status === "confirmed" ? new Date() : null })
    .onConflictDoUpdate({
      target: [fulfillmentRequests.orderId, fulfillmentRequests.provider],
      set: { status: res.status, providerRef: res.providerRef ?? null, error: res.error ?? null, updatedAt: new Date(), ...(res.status === "confirmed" ? { confirmedAt: new Date() } : {}) },
    });
  if (res.status === "failed") throw new Error(res.error ?? "Fulfilment submission failed");
  return res.status;
}

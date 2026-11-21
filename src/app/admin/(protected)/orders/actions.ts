"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema";
import { assertAdmin } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { CARRIERS } from "@/config/carriers";
import { enqueue } from "@/server/jobs/queue";
import { reconcileAttempt } from "@/server/orders/payment-ops";
import { callProvider, issueRefund } from "@/server/orders/refunds";
import {
  cancelOrder,
  closeReturn,
  createReturn,
  markShipped,
  receiveReturn,
  recordSupplierOrder,
  resolveReview,
  setFulfillment,
  shipExchange,
} from "@/server/orders/operations";
import type { Permission } from "@/server/auth/rbac";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (id: string, kind: "msg" | "err", text: string): never => redirect(`/admin/orders/${id}?${kind}=${encodeURIComponent(text)}#${kind === "err" ? "top" : "top"}`);

/** Parse "149", "149.5" or "149,50" into minor units. */
function toMinorUnits(v: string): number | null {
  const m = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(v.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

async function run(permission: Permission, orderId: string, fn: (actor: Awaited<ReturnType<typeof assertAdmin>>["actor"]) => Promise<string>) {
  const a = await assertAdmin(permission);
  let msg: string;
  try {
    msg = await fn(a.actor);
  } catch (err) {
    back(orderId, "err", (err as Error).message);
    return;
  }
  revalidatePath(`/admin/orders/${orderId}`);
  back(orderId, "msg", msg!);
}

export async function fulfilAction(f: FormData) {
  const id = s(f, "orderId");
  const to = s(f, "to") as "in_production" | "packed" | "delivered";
  await run("orders:fulfil", id, async (actor) => {
    await setFulfillment(id, to, actor);
    return `Marked ${to.replace("_", " ")}.`;
  });
}

export async function shipAction(f: FormData) {
  const id = s(f, "orderId");
  await run("orders:fulfil", id, async (actor) => {
    const carrier = CARRIERS.find((c) => c.id === s(f, "carrierId"));
    if (!carrier) throw new Error("Choose a carrier.");
    const tracking = s(f, "trackingNumber");
    if (!tracking && f.get("untracked") !== "on") throw new Error("Enter a tracking number, or tick 'ship without tracking'.");
    await markShipped(id, { carrierId: carrier.id, carrierName: carrier.id === "other" ? s(f, "carrierName") || "Other" : carrier.name, trackingNumber: tracking || null, trackingUrl: s(f, "trackingUrl") || null, notify: f.get("notify") === "on" }, actor);
    return f.get("notify") === "on" ? "Marked shipped. Shipping email queued." : "Marked shipped (no email sent).";
  });
}

export async function supplierRefAction(f: FormData) {
  const id = s(f, "orderId");
  await run("orders:fulfil", id, async (actor) => {
    await recordSupplierOrder(id, s(f, "reference"), actor);
    return "Supplier order reference recorded.";
  });
}

export async function refundAction(f: FormData) {
  const id = s(f, "orderId");
  await run("refunds:issue", id, async (actor) => {
    const amount = toMinorUnits(s(f, "amount"));
    if (amount == null || amount <= 0) throw new Error("Enter a refund amount, e.g. 549 or 149.50.");
    if (f.get("confirm") !== "on") throw new Error("Tick the confirmation box to issue a refund.");
    const r = await issueRefund({ orderId: id, paymentId: s(f, "paymentId") || null, amountMinor: amount, reason: s(f, "reason") || "Refund", note: s(f, "note") || null, idempotencyKey: s(f, "key"), returnId: s(f, "returnId") || null }, actor);
    if (!r.ok) throw new Error(r.error);
    return `Refund ${r.status}.`;
  });
}

export async function retryRefundAction(f: FormData) {
  const id = s(f, "orderId");
  await run("refunds:issue", id, async (actor) => {
    const r = await callProvider(s(f, "refundId"), actor);
    if (!r.ok) throw new Error(r.error);
    return `Refund ${r.status}.`;
  });
}

export async function cancelAction(f: FormData) {
  const id = s(f, "orderId");
  await run("refunds:issue", id, async (actor) => {
    if (f.get("confirm") !== "on") throw new Error("Tick the confirmation box to cancel.");
    await cancelOrder(id, s(f, "reason") || "Cancelled by staff", actor, s(f, "key"));
    return "Order cancelled.";
  });
}

export async function createReturnAction(f: FormData) {
  const id = s(f, "orderId");
  await run("returns:write", id, async (actor) => {
    const lineIds = f.getAll("lineId").map(String);
    const lines = lineIds
      .map((lid) => ({ orderLineId: lid, qty: Number(f.get(`qty_${lid}`) ?? 0), exchangeSkuId: String(f.get(`exchange_${lid}`) ?? "") || null }))
      .filter((l) => l.qty > 0);
    const type = s(f, "type") === "exchange" ? "exchange" : "return";
    await createReturn({ orderId: id, type, reason: s(f, "reason") || "Not specified", customerNote: s(f, "customerNote") || null, lines }, actor);
    return `${type === "exchange" ? "Exchange" : "Return"} recorded.`;
  });
}

export async function receiveReturnAction(f: FormData) {
  const id = s(f, "orderId");
  await run("returns:write", id, async (actor) => {
    const ids = f.getAll("returnLineId").map(String);
    await receiveReturn(s(f, "returnId"), ids.map((x) => ({ returnLineId: x, condition: s(f, `condition_${x}`), restock: f.get(`restock_${x}`) === "on" })), actor);
    return "Return received.";
  });
}

export async function shipExchangeAction(f: FormData) {
  const id = s(f, "orderId");
  await run("returns:write", id, async (actor) => {
    const carrier = CARRIERS.find((c) => c.id === s(f, "carrierId")) ?? CARRIERS[0]!;
    await shipExchange(s(f, "returnId"), { carrierId: carrier.id, carrierName: carrier.name, trackingNumber: s(f, "trackingNumber") || null, notify: f.get("notify") === "on" }, actor);
    return "Replacement shipped.";
  });
}

export async function closeReturnAction(f: FormData) {
  const id = s(f, "orderId");
  await run("returns:write", id, async (actor) => {
    await closeReturn(s(f, "returnId"), s(f, "status") === "rejected" ? "rejected" : "closed", s(f, "note"), actor);
    return "Return updated.";
  });
}

export async function resolveReviewAction(f: FormData) {
  const id = s(f, "orderId");
  await run("orders:edit", id, async (actor) => {
    if (!s(f, "note")) throw new Error("Explain how the flag was resolved.");
    await resolveReview(id, Number(s(f, "index")), s(f, "note"), actor);
    return "Flag resolved.";
  });
}

export async function noteAction(f: FormData) {
  const id = s(f, "orderId");
  await run("orders:edit", id, async (actor) => {
    await db().update(orders).set({ internalNote: s(f, "note") || null, updatedAt: new Date() }).where(eq(orders.id, id));
    await audit(db(), actor, "order.note", "order", id, "Internal note updated");
    return "Note saved.";
  });
}

export async function reconcileAction(f: FormData) {
  const id = s(f, "orderId");
  await run("orders:edit", id, async () => {
    const st = await reconcileAttempt(s(f, "attemptId"));
    return `Checked with the provider: ${st}.`;
  });
}

export async function resendEmailAction(f: FormData) {
  const id = s(f, "orderId");
  await run("orders:edit", id, async (actor) => {
    const t = s(f, "template");
    if (t !== "email.order_confirmation") throw new Error("Unsupported email.");
    await enqueue(db(), { type: "email.order_link", payload: { orderId: id }, dedupeKey: `resend:${id}:${randomUUID()}`, orderId: id });
    await audit(db(), actor, "email.resend", "order", id, "Sent a fresh order link to the customer");
    return "A fresh secure order link is queued for the customer.";
  });
}

import "../guard";
import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { dropSignups, jobs, orderLines, orders, refunds, shipments } from "../db/schema";
import { appUrl } from "../env";
import { sendOnce } from "../email";
import * as T from "../email/templates";
import { issueOrderToken } from "../orders/access";
import { captureApprovedAttempt, closeAttempt, reconcileAttempt } from "../orders/payment-ops";
import { prepareFulfillment, submitFulfillment } from "../fulfillment";
import { getSettings } from "../settings";

type Job = typeof jobs.$inferSelect;

async function loadOrder(orderId: string) {
  const [o] = await db().select().from(orders).where(eq(orders.id, orderId));
  if (!o) throw new Error(`Order ${orderId} not found`);
  const lines = await db().select().from(orderLines).where(eq(orderLines.orderId, orderId)).orderBy(asc(orderLines.lineNo));
  return { o, lines };
}

async function orderLink(orderId: string) {
  const s = await getSettings();
  const token = await issueOrderToken(db(), orderId, s.support.orderLinkDays);
  return { link: appUrl(`/o/${token}`), days: s.support.orderLinkDays, s };
}

export const HANDLERS: Record<string, (job: Job) => Promise<void>> = {
  async "email.order_confirmation"(job) {
    const { o, lines } = await loadOrder(String(job.payload.orderId));
    if (o.paymentStatus !== "paid") return; // never confirm an unpaid order
    const { link, days, s } = await orderLink(o.id);
    const m = T.orderConfirmation(o, lines, link, days, s.support.supportEmail, s.support.withdrawalDays);
    await sendOnce({ ...m, to: o.email, dedupeKey: `order_confirmation:${o.id}`, template: "order_confirmation", orderId: o.id, jobId: job.id });
  },
  async "email.shipped"(job) {
    const [sh] = await db().select().from(shipments).where(eq(shipments.id, String(job.payload.shipmentId)));
    if (!sh) throw new Error("Shipment not found");
    const { o } = await loadOrder(sh.orderId);
    const { link, s } = await orderLink(o.id);
    const m = T.shippedEmail(o, sh, link, s.support.supportEmail);
    await sendOnce({ ...m, to: o.email, dedupeKey: `shipped:${sh.id}`, template: "shipped", orderId: o.id, jobId: job.id });
  },
  async "email.cancelled"(job) {
    const { o } = await loadOrder(String(job.payload.orderId));
    const s = await getSettings();
    const m = T.cancelledEmail(o, String(job.payload.reason ?? ""), Boolean(job.payload.refunded), s.support.supportEmail);
    await sendOnce({ ...m, to: o.email, dedupeKey: `cancelled:${o.id}`, template: "cancelled", orderId: o.id, jobId: job.id });
  },
  async "email.refunded"(job) {
    const [r] = await db().select().from(refunds).where(eq(refunds.id, String(job.payload.refundId)));
    if (!r) throw new Error("Refund not found");
    if (r.status !== "succeeded") throw new Error(`Refund is ${r.status}; email waits until it succeeds`);
    const { o } = await loadOrder(r.orderId);
    const s = await getSettings();
    const m = T.refundedEmail(o, r.amountMinor, r.currency, s.support.supportEmail);
    await sendOnce({ ...m, to: o.email, dedupeKey: `refunded:${r.id}`, template: "refunded", orderId: o.id, jobId: job.id });
  },
  async "email.order_link"(job) {
    const { o } = await loadOrder(String(job.payload.orderId));
    const { link, days } = await orderLink(o.id);
    const m = T.orderLinkEmail(o, link, days);
    await sendOnce({ ...m, to: o.email, dedupeKey: `order_link:${job.id}`, template: "order_link", orderId: o.id, jobId: job.id });
  },
  async "email.signup_confirm"(job) {
    const [s] = await db().select().from(dropSignups).where(eq(dropSignups.id, String(job.payload.signupId)));
    if (!s || s.status !== "pending") return;
    const token = encodeURIComponent(String(job.payload.token ?? ""));
    if (!token) return; // already sent and scrubbed
    const m = T.signupConfirmEmail(appUrl(`/signup/confirm?token=${token}`), appUrl(`/signup/unsubscribe?token=${token}`));
    await sendOnce({ ...m, to: s.email, dedupeKey: `signup:${s.id}`, template: "signup_confirm", jobId: job.id });
    // The raw token is only needed to build the email; don't keep it in the queue afterwards.
    await db().update(jobs).set({ payload: { signupId: s.id } }).where(eq(jobs.id, job.id));
  },
  async "payment.reconcile"(job) {
    await reconcileAttempt(String(job.payload.attemptId));
  },
  async "payment.capture_paypal"(job) {
    const r = await captureApprovedAttempt(String(job.payload.attemptId));
    if (r.outcome === "declined_retry") return; // buyer must pick another funding source; nothing to retry here
  },
  async "payment.close_attempt"(job) {
    const r = await closeAttempt(String(job.payload.attemptId), String(job.payload.reason ?? "closed by job"));
    if (r === "error") throw new Error("Provider did not confirm the attempt was closed");
  },
  async "fulfillment.prepare"(job) {
    await prepareFulfillment(String(job.payload.orderId));
  },
  async "fulfillment.submit"(job) {
    await submitFulfillment(String(job.payload.orderId));
  },
};

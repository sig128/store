import "../guard";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { simulatorSessions } from "../db/schema";
import { env, simulatorEnabled } from "../env";
import {
  ProviderError,
  WebhookVerificationError,
  type AttemptRow,
  type CheckoutContext,
  type CloseResult,
  type CreatedCheckout,
  type NormalizedEvent,
  type PaymentProvider,
  type PaymentRow,
  type ProviderStatus,
  type RefundResult,
  type VerifiedPayment,
} from "./types";

/**
 * LOCAL PAYMENT SIMULATOR — a test double for hosted checkouts, used when no
 * Stripe/PayPal sandbox credentials are configured. It keeps its own
 * "provider-side" state, signs its webhooks and goes through exactly the same
 * order transitions as the real providers. No money moves. It refuses to run
 * when APP_ENV=production.
 */
export type SimFlavor = "card" | "wallet";

const secret = () => `${env().COOKIE_SECRET}:simulator-webhooks`;

export function signSimulatorPayload(raw: string): string {
  return createHmac("sha256", secret()).update(raw).digest("hex");
}

export class SimulatorProvider implements PaymentProvider {
  readonly id = "simulator" as const;
  readonly label: string;
  readonly flow: "hosted" | "approve_capture";

  constructor(private flavor: SimFlavor) {
    this.label = flavor === "card" ? "Card (test simulator)" : "Wallet (test simulator)";
    this.flow = flavor === "card" ? "hosted" : "approve_capture";
  }

  private guard() {
    if (!simulatorEnabled()) throw new ProviderError("The payment simulator is disabled");
  }
  configured() {
    return simulatorEnabled();
  }
  mode() {
    return simulatorEnabled() ? ("simulator" as const) : ("not_connected" as const);
  }

  async createCheckout(ctx: CheckoutContext): Promise<CreatedCheckout> {
    this.guard();
    const ref = `sim_${this.flavor}_${randomBytes(9).toString("hex")}`;
    await db()
      .insert(simulatorSessions)
      .values({
        ref,
        attemptId: ctx.attempt.id,
        flavor: this.flavor,
        amountMinor: ctx.order.totalMinor,
        currency: ctx.order.currency,
        reference: { orderId: ctx.order.id, attemptId: ctx.attempt.id },
        shipping: ctx.order.shippingAddress,
      });
    const q = new URLSearchParams({ success: ctx.successUrl, cancel: ctx.cancelUrl, ret: ctx.returnUrl });
    return { providerRef: ref, redirectUrl: `/dev/simulator/${ref}?${q.toString()}` };
  }

  async closeCheckout(attempt: AttemptRow): Promise<CloseResult> {
    this.guard();
    const s = await this.session(attempt.providerRef);
    if (!s) return { status: "not_found" };
    if (s.status === "paid" || s.status === "processing") return { status: "already_completed" };
    await db().update(simulatorSessions).set({ status: "cancelled", updatedAt: new Date() }).where(eq(simulatorSessions.ref, s.ref));
    return { status: "closed" };
  }

  private async session(ref: string | null) {
    if (!ref) return null;
    const [s] = await db().select().from(simulatorSessions).where(eq(simulatorSessions.ref, ref));
    return s ?? null;
  }

  private payment(s: typeof simulatorSessions.$inferSelect, id: string, status: VerifiedPayment["status"]): VerifiedPayment {
    return {
      providerPaymentId: id,
      status,
      amountMinor: s.amountMinor,
      currency: s.currency,
      reference: s.reference,
      capturedAt: new Date(),
      shippingAddress: s.shipping ?? null,
      details: { simulator: true, ref: s.ref },
    };
  }

  async retrieve(attempt: AttemptRow): Promise<ProviderStatus> {
    this.guard();
    const s = await this.session(attempt.providerRef);
    if (!s) return { state: "failed", payments: [] };
    const map: Record<string, ProviderStatus["state"]> = {
      open: "open",
      approved: "approved",
      processing: "processing",
      paid: "succeeded",
      failed: "failed",
      expired: "expired",
      cancelled: "cancelled",
    };
    const status = map[s.status] ?? "open";
    return {
      state: status,
      payments: s.paymentIds.map((id) => this.payment(s, id, s.status === "processing" ? "processing" : "succeeded")),
      amountMinor: s.amountMinor,
      currency: s.currency,
      reference: s.reference,
      shippingAddress: s.shipping ?? null,
    };
  }

  async capture(attempt: AttemptRow): Promise<ProviderStatus> {
    this.guard();
    const s = await this.session(attempt.providerRef);
    if (!s) throw new ProviderError("Unknown simulator session");
    if (s.status === "approved") {
      const id = `simpay_${randomBytes(8).toString("hex")}`;
      await db()
        .update(simulatorSessions)
        .set({ status: "paid", paymentIds: [...s.paymentIds, id], updatedAt: new Date() })
        .where(eq(simulatorSessions.ref, s.ref));
    }
    return this.retrieve(attempt);
  }

  async refund(_payment: PaymentRow, _amountMinor: number, idempotencyKey: string, _reason?: string, _ourRefundId?: string): Promise<RefundResult> {
    this.guard();
    return { providerRefundId: `simre_${createHmac("sha256", secret()).update(idempotencyKey).digest("hex").slice(0, 16)}`, status: "succeeded" };
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<NormalizedEvent> {
    this.guard();
    const sig = headers.get("x-simulator-signature") ?? "";
    const expected = signSimulatorPayload(rawBody);
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      throw new WebhookVerificationError("Invalid simulator signature");
    }
    const body = JSON.parse(rawBody) as {
      id: string;
      type: string;
      ref: string;
      payment?: VerifiedPayment;
      refund?: NormalizedEvent["refund"];
      reason?: string;
    };
    const s = await this.session(body.ref);
    const kinds: Record<string, NormalizedEvent["kind"]> = {
      "payment.succeeded": "payment_succeeded",
      "payment.processing": "payment_processing",
      "payment.failed": "payment_failed",
      "checkout.expired": "checkout_expired",
      "checkout.approved": "checkout_approved",
      "refund.updated": "refund_updated",
    };
    return {
      provider: "simulator",
      eventId: body.id,
      type: body.type,
      kind: kinds[body.type] ?? "ignored",
      checkoutRef: body.ref,
      attemptId: s?.attemptId ?? null,
      payment: body.payment ? { ...body.payment, capturedAt: body.payment.capturedAt ? new Date(body.payment.capturedAt) : new Date() } : undefined,
      refund: body.refund,
      failureReason: body.reason ?? null,
      summary: { type: body.type, ref: body.ref, simulator: true },
    };
  }
}

/* ───────── controls used by the simulator page (dev only) ───────── */

export type SimAction = "pay" | "pay_async" | "async_succeeds" | "async_fails" | "decline" | "approve" | "cancel" | "expire" | "duplicate_capture" | "wrong_amount";

/** Applies a buyer action at the "provider" and returns the webhook events it would send. */
export async function simulatorAct(ref: string, action: SimAction): Promise<{ events: object[]; redirect: "success" | "cancel" | "return" | null }> {
  if (!simulatorEnabled()) throw new ProviderError("The payment simulator is disabled");
  const [s] = await db().select().from(simulatorSessions).where(eq(simulatorSessions.ref, ref));
  if (!s) throw new ProviderError("Unknown simulator session");
  const evId = () => `simevt_${randomBytes(8).toString("hex")}`;
  const set = (patch: Partial<typeof simulatorSessions.$inferInsert>) =>
    db().update(simulatorSessions).set({ ...patch, updatedAt: new Date() }).where(eq(simulatorSessions.ref, ref));
  const pay = (id: string, status: VerifiedPayment["status"], amount = s.amountMinor) => ({
    providerPaymentId: id,
    status,
    amountMinor: amount,
    currency: s.currency,
    reference: s.reference,
    shippingAddress: s.shipping,
    details: { simulator: true },
  });
  const terminal = ["paid", "failed", "expired", "cancelled"].includes(s.status);
  switch (action) {
    case "pay": {
      if (terminal && s.status !== "paid") throw new ProviderError(`Session is ${s.status}`);
      const id = s.paymentIds[0] ?? `simpay_${randomBytes(8).toString("hex")}`;
      await set({ status: "paid", paymentIds: s.paymentIds.length ? s.paymentIds : [id] });
      return { events: [{ id: evId(), type: "payment.succeeded", ref, payment: pay(id, "succeeded") }], redirect: "success" };
    }
    case "pay_async": {
      const id = `simpay_${randomBytes(8).toString("hex")}`;
      await set({ status: "processing", paymentIds: [id] });
      return { events: [{ id: evId(), type: "payment.processing", ref, payment: pay(id, "processing") }], redirect: "success" };
    }
    case "async_succeeds": {
      const id = s.paymentIds[0];
      if (!id || s.status !== "processing") throw new ProviderError("No processing payment");
      await set({ status: "paid" });
      return { events: [{ id: evId(), type: "payment.succeeded", ref, payment: pay(id, "succeeded") }], redirect: null };
    }
    case "async_fails": {
      const id = s.paymentIds[0];
      if (!id || s.status !== "processing") throw new ProviderError("No processing payment");
      await set({ status: "failed" });
      return { events: [{ id: evId(), type: "payment.failed", ref, payment: pay(id, "failed"), reason: "Bank declined the delayed payment" }], redirect: null };
    }
    case "decline":
      return { events: [], redirect: null };
    case "approve":
      await set({ status: "approved" });
      return { events: [{ id: evId(), type: "checkout.approved", ref }], redirect: "return" };
    case "cancel":
      await set({ status: "cancelled" });
      return { events: [], redirect: "cancel" };
    case "expire":
      await set({ status: "expired" });
      return { events: [{ id: evId(), type: "checkout.expired", ref }], redirect: null };
    case "duplicate_capture": {
      const id = `simpay_${randomBytes(8).toString("hex")}`;
      await set({ status: "paid", paymentIds: [...s.paymentIds, id] });
      return { events: [{ id: evId(), type: "payment.succeeded", ref, payment: pay(id, "succeeded") }], redirect: null };
    }
    case "wrong_amount": {
      const id = `simpay_${randomBytes(8).toString("hex")}`;
      await set({ status: "paid", paymentIds: [id] });
      return { events: [{ id: evId(), type: "payment.succeeded", ref, payment: pay(id, "succeeded", s.amountMinor - 100) }], redirect: "success" };
    }
  }
}

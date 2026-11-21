import "../guard";
import Stripe from "stripe";
import { brand } from "@/config/brand";
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
import { checkoutLineItems } from "./line-items";

export interface StripeConfig {
  secretKey?: string;
  webhookSecret?: string;
  /** e.g. ["card"]. Empty → payment methods configured in the Stripe Dashboard. */
  paymentMethodTypes?: string[];
}

/**
 * Stripe-hosted Checkout. Card data never touches this application.
 * Sessions are created server-side from the order snapshot; the shipping address is
 * passed in (not collected by Stripe) so the buyer cannot change the destination
 * after shipping was quoted.
 */
export class StripeProvider implements PaymentProvider {
  readonly id = "stripe" as const;
  readonly label = "Card";
  readonly flow = "hosted" as const;
  private client: Stripe | null;

  constructor(
    private cfg: StripeConfig,
    client?: Stripe,
  ) {
    this.client = client ?? null;
  }

  configured() {
    return Boolean(this.cfg.secretKey && this.cfg.webhookSecret);
  }
  mode() {
    if (!this.configured()) return "not_connected" as const;
    return this.cfg.secretKey!.startsWith("sk_live_") || this.cfg.secretKey!.startsWith("rk_live_") ? ("live" as const) : ("sandbox" as const);
  }
  private stripe(): Stripe {
    if (!this.client) {
      if (!this.cfg.secretKey) throw new ProviderError("Stripe is not configured");
      this.client = new Stripe(this.cfg.secretKey, { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: brand.name } });
    }
    return this.client;
  }

  async createCheckout(ctx: CheckoutContext): Promise<CreatedCheckout> {
    const { order, attempt } = ctx;
    const items = checkoutLineItems(ctx.order, ctx.lines);
    const currency = order.currency.toLowerCase();
    const a = order.shippingAddress;
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      client_reference_id: order.id,
      customer_email: order.email,
      line_items: items.lines.map((l) => ({
        quantity: l.quantity,
        price_data: { currency, unit_amount: l.unitAmountMinor, product_data: { name: l.name, metadata: { sku: l.sku } } },
      })),
      shipping_options:
        order.shippingMinor >= 0
          ? [
              {
                shipping_rate_data: {
                  type: "fixed_amount",
                  display_name: order.shippingMethod.name,
                  fixed_amount: { amount: order.shippingMinor, currency },
                },
              },
            ]
          : undefined,
      metadata: { order_id: order.id, attempt_id: attempt.id, order_number: order.number },
      payment_intent_data: {
        description: `Order ${order.number}`,
        metadata: { order_id: order.id, attempt_id: attempt.id, order_number: order.number },
        shipping: {
          name: a.name,
          phone: a.phone ?? undefined,
          address: { line1: a.line1, line2: a.line2 ?? undefined, postal_code: a.postalCode, city: a.city, country: a.country },
        },
      },
      expires_at: Math.floor(attempt.expiresAt.getTime() / 1000),
      success_url: ctx.successUrl,
      cancel_url: ctx.cancelUrl,
      locale: "auto",
    };
    if (this.cfg.paymentMethodTypes?.length) {
      // Filters the dynamically computed set (cards include eligible wallets such as Apple Pay / Google Pay).
      params.allowed_payment_method_types = this.cfg.paymentMethodTypes as Stripe.Checkout.SessionCreateParams.AllowedPaymentMethodType[];
    }
    const session = await this.stripe().checkout.sessions.create(params, { idempotencyKey: `checkout-${attempt.id}` });
    if (session.amount_total !== order.totalMinor) {
      // Never let a session with a different total stay payable.
      await this.stripe().checkout.sessions.expire(session.id).catch(() => undefined);
      throw new ProviderError(`Stripe session total ${session.amount_total} does not match order total ${order.totalMinor}`);
    }
    if (!session.url) throw new ProviderError("Stripe did not return a checkout URL");
    return { providerRef: session.id, redirectUrl: session.url };
  }

  async closeCheckout(attempt: AttemptRow): Promise<CloseResult> {
    if (!attempt.providerRef) return { status: "not_found" };
    try {
      await this.stripe().checkout.sessions.expire(attempt.providerRef);
      return { status: "closed" };
    } catch (err) {
      try {
        const s = await this.stripe().checkout.sessions.retrieve(attempt.providerRef);
        if (s.status === "complete") return { status: "already_completed" };
        if (s.status === "expired") return { status: "closed" };
      } catch {
        /* fall through */
      }
      return { status: "error", error: (err as Error).message };
    }
  }

  async retrieve(attempt: AttemptRow): Promise<ProviderStatus> {
    if (!attempt.providerRef) return { state: "failed", payments: [] };
    const s = await this.stripe().checkout.sessions.retrieve(attempt.providerRef, { expand: ["payment_intent"] });
    return mapSession(s);
  }

  async refund(payment: PaymentRow, amountMinor: number, idempotencyKey: string, reason: string, ourRefundId?: string): Promise<RefundResult> {
    const r = await this.stripe().refunds.create(
      {
        payment_intent: payment.providerPaymentId,
        amount: amountMinor,
        reason: reason === "duplicate" ? "duplicate" : "requested_by_customer",
        metadata: { order_id: payment.orderId, payment_id: payment.id, ...(ourRefundId ? { refund_id: ourRefundId } : {}) },
      },
      { idempotencyKey },
    );
    return { providerRefundId: r.id, status: mapRefundStatus(r.status), failureReason: r.failure_reason ?? null };
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<NormalizedEvent> {
    const sig = headers.get("stripe-signature");
    if (!sig || !this.cfg.webhookSecret) throw new WebhookVerificationError("Missing Stripe signature or webhook secret");
    let event: Stripe.Event;
    try {
      event = await this.stripe().webhooks.constructEventAsync(rawBody, sig, this.cfg.webhookSecret);
    } catch (err) {
      throw new WebhookVerificationError(`Invalid Stripe signature: ${(err as Error).message}`);
    }
    return normalizeStripeEvent(event);
  }

  dashboardUrl(kind: "payment" | "checkout", id: string) {
    const base = this.mode() === "live" ? "https://dashboard.stripe.com" : "https://dashboard.stripe.com/test";
    return kind === "payment" ? `${base}/payments/${id}` : `${base}/checkout/sessions/${id}`;
  }
}

function mapRefundStatus(s: string | null | undefined): RefundResult["status"] {
  if (s === "succeeded") return "succeeded";
  if (s === "failed" || s === "canceled") return "failed";
  return "pending";
}

function sessionPayment(s: Stripe.Checkout.Session, status: VerifiedPayment["status"]): VerifiedPayment | null {
  const pi = s.payment_intent;
  const piId = typeof pi === "string" ? pi : pi?.id;
  if (!piId) return null;
  const amount = typeof pi === "object" && pi && pi.amount_received ? pi.amount_received : (s.amount_total ?? 0);
  return {
    providerPaymentId: piId,
    status,
    amountMinor: amount,
    currency: (s.currency ?? "").toUpperCase(),
    reference: { orderId: s.metadata?.order_id ?? s.client_reference_id ?? null, attemptId: s.metadata?.attempt_id ?? null },
    capturedAt: new Date(),
    details: { checkoutSession: s.id, paymentStatus: s.payment_status },
  };
}

export function mapSession(s: Stripe.Checkout.Session): ProviderStatus {
  const reference = { orderId: s.metadata?.order_id ?? s.client_reference_id ?? null, attemptId: s.metadata?.attempt_id ?? null };
  if (s.status === "open") return { state: "open", payments: [], reference };
  if (s.status === "expired") return { state: "expired", payments: [], reference };
  if (s.payment_status === "paid") {
    const p = sessionPayment(s, "succeeded");
    return { state: "succeeded", payments: p ? [p] : [], amountMinor: s.amount_total ?? undefined, currency: s.currency?.toUpperCase(), reference };
  }
  const p = sessionPayment(s, "processing");
  return { state: "processing", payments: p ? [p] : [], reference };
}

export function normalizeStripeEvent(event: Stripe.Event): NormalizedEvent {
  const base = { provider: "stripe" as const, eventId: event.id, type: event.type, summary: { type: event.type, created: event.created, livemode: event.livemode } };
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const s = event.data.object as Stripe.Checkout.Session;
      const ids = { checkoutRef: s.id, attemptId: s.metadata?.attempt_id ?? null, orderId: s.metadata?.order_id ?? s.client_reference_id ?? null };
      const summary = { ...base.summary, session: s.id, payment_status: s.payment_status, amount_total: s.amount_total, currency: s.currency };
      if (event.type === "checkout.session.expired") return { ...base, ...ids, summary, kind: "checkout_expired" };
      if (event.type === "checkout.session.async_payment_failed") {
        return { ...base, ...ids, summary, kind: "payment_failed", failureReason: "Delayed payment failed", payment: sessionPayment(s, "failed") ?? undefined };
      }
      if (s.payment_status === "paid") {
        const p = sessionPayment(s, "succeeded");
        return { ...base, ...ids, summary, kind: p ? "payment_succeeded" : "ignored", payment: p ?? undefined };
      }
      if (s.payment_status === "unpaid") {
        return { ...base, ...ids, summary, kind: "payment_processing", payment: sessionPayment(s, "processing") ?? undefined };
      }
      return { ...base, ...ids, summary, kind: "ignored" };
    }
    case "refund.created":
    case "refund.updated":
    case "refund.failed": {
      const r = event.data.object as Stripe.Refund;
      return {
        ...base,
        summary: { ...base.summary, refund: r.id, status: r.status, amount: r.amount },
        kind: "refund_updated",
        refund: {
          providerRefundId: r.id,
          providerPaymentId: typeof r.payment_intent === "string" ? r.payment_intent : (r.payment_intent?.id ?? null),
          ourRefundId: r.metadata?.refund_id ?? null,
          amountMinor: r.amount,
          currency: r.currency.toUpperCase(),
          status: r.status === "succeeded" ? "succeeded" : r.status === "failed" ? "failed" : r.status === "canceled" ? "cancelled" : "pending",
        },
      };
    }
    case "charge.dispute.created": {
      const d = event.data.object as Stripe.Dispute;
      const piId = typeof d.payment_intent === "string" ? d.payment_intent : (d.payment_intent?.id ?? null);
      return {
        ...base,
        summary: { ...base.summary, dispute: d.id, reason: d.reason },
        kind: "dispute_opened",
        payment: piId ? { providerPaymentId: piId, status: "succeeded", amountMinor: d.amount, currency: d.currency.toUpperCase(), reference: {} } : undefined,
      };
    }
    default:
      return { ...base, kind: "ignored" };
  }
}

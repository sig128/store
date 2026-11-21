import "../guard";
import { brand } from "@/config/brand";
import type { Address } from "@/lib/types";
import { checkoutLineItems, fromDecimal, toDecimal } from "./line-items";
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

export interface PayPalConfig {
  env: "sandbox" | "live";
  clientId?: string;
  clientSecret?: string;
  webhookId?: string;
  /** Override for tests. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/* Minimal shapes of the documented Orders v2 / Payments v2 resources we read. */
interface PPMoney {
  currency_code: string;
  value: string;
}
interface PPCapture {
  id: string;
  status: "COMPLETED" | "PENDING" | "DECLINED" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED";
  amount: PPMoney;
  custom_id?: string;
  invoice_id?: string;
  create_time?: string;
  status_details?: { reason?: string };
  supplementary_data?: { related_ids?: { order_id?: string } };
}
interface PPAddress {
  address_line_1?: string;
  address_line_2?: string;
  admin_area_2?: string;
  postal_code?: string;
  country_code?: string;
}
interface PPPurchaseUnit {
  reference_id?: string;
  custom_id?: string;
  amount?: PPMoney;
  shipping?: { name?: { full_name?: string }; address?: PPAddress };
  payments?: { captures?: PPCapture[] };
}
interface PPOrder {
  id: string;
  status: "CREATED" | "SAVED" | "APPROVED" | "VOIDED" | "COMPLETED" | "PAYER_ACTION_REQUIRED";
  purchase_units?: PPPurchaseUnit[];
  links?: { href: string; rel: string; method?: string }[];
}

class PayPalApiError extends ProviderError {
  constructor(
    message: string,
    public readonly status: number,
    public readonly issues: string[],
    public readonly debugId: string | null,
  ) {
    super(message, status >= 500 || status === 429);
  }
}

/**
 * PayPal Checkout via the documented server-side Orders v2 API:
 *   create order (intent CAPTURE, our address with SET_PROVIDED_ADDRESS)
 *   → buyer approves on PayPal (approval is NOT payment)
 *   → we verify the approved order, then capture server-side (idempotent request id)
 *   → the capture result and the webhooks both go through the same order transition.
 */
export class PayPalProvider implements PaymentProvider {
  readonly id = "paypal" as const;
  readonly label = "PayPal";
  readonly flow = "approve_capture" as const;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private cfg: PayPalConfig) {}

  configured() {
    return Boolean(this.cfg.clientId && this.cfg.clientSecret && this.cfg.webhookId);
  }
  mode() {
    if (!this.configured()) return "not_connected" as const;
    return this.cfg.env === "live" ? ("live" as const) : ("sandbox" as const);
  }
  private base() {
    return this.cfg.baseUrl ?? (this.cfg.env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");
  }
  private f() {
    return this.cfg.fetchImpl ?? fetch;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    if (!this.cfg.clientId || !this.cfg.clientSecret) throw new ProviderError("PayPal is not configured");
    const res = await this.f()(`${this.base()}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new PayPalApiError(`PayPal auth failed (${res.status})`, res.status, [], res.headers.get("paypal-debug-id"));
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }

  private async api<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    const token = await this.accessToken();
    const res = await this.f()(`${this.base()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!res.ok) {
      const details = (json.details as { issue?: string; description?: string }[] | undefined) ?? [];
      const issues = details.map((d) => d.issue ?? "").filter(Boolean);
      throw new PayPalApiError(
        `PayPal ${method} ${path} failed (${res.status}${issues.length ? `: ${issues.join(", ")}` : ""})`,
        res.status,
        issues,
        res.headers.get("paypal-debug-id"),
      );
    }
    return json as T;
  }

  async createCheckout(ctx: CheckoutContext): Promise<CreatedCheckout> {
    const { order, attempt } = ctx;
    const items = checkoutLineItems(order, ctx.lines);
    const cur = order.currency.toUpperCase();
    const a = order.shippingAddress;
    const body = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: order.id,
          custom_id: attempt.id,
          invoice_id: `${order.number}-${attempt.id.slice(0, 8)}`,
          description: `${brand.name} order ${order.number}`.slice(0, 127),
          amount: {
            currency_code: cur,
            value: toDecimal(order.totalMinor),
            breakdown: {
              item_total: { currency_code: cur, value: toDecimal(items.goodsTotalMinor) },
              shipping: { currency_code: cur, value: toDecimal(order.shippingMinor) },
            },
          },
          items: items.lines.map((l) => ({
            name: l.name.slice(0, 127),
            sku: l.sku.slice(0, 127),
            quantity: String(l.quantity),
            unit_amount: { currency_code: cur, value: toDecimal(l.unitAmountMinor) },
            category: "PHYSICAL_GOODS",
          })),
          shipping: {
            type: "SHIPPING",
            name: { full_name: a.name.slice(0, 300) },
            address: {
              address_line_1: a.line1,
              address_line_2: a.line2 ?? undefined,
              admin_area_2: a.city,
              postal_code: a.postalCode,
              country_code: a.country,
            },
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: brand.name.slice(0, 127),
            shipping_preference: "SET_PROVIDED_ADDRESS",
            user_action: "PAY_NOW",
            return_url: ctx.returnUrl,
            cancel_url: ctx.cancelUrl,
          },
        },
      },
    };
    const created = await this.api<PPOrder>("POST", "/v2/checkout/orders", body, { "PayPal-Request-Id": `create-${attempt.id}` });
    const approve = created.links?.find((l) => l.rel === "payer-action" || l.rel === "approve");
    if (!approve) throw new ProviderError("PayPal did not return an approval link");
    return { providerRef: created.id, redirectUrl: approve.href };
  }

  async closeCheckout(attempt: AttemptRow): Promise<CloseResult> {
    // Orders created with intent CAPTURE only move money when *we* capture them, so an
    // attempt we stop tracking can no longer charge. Check it was not completed first.
    if (!attempt.providerRef) return { status: "not_found" };
    try {
      const o = await this.api<PPOrder>("GET", `/v2/checkout/orders/${encodeURIComponent(attempt.providerRef)}`);
      return o.status === "COMPLETED" ? { status: "already_completed" } : { status: "closed" };
    } catch (err) {
      if (err instanceof PayPalApiError && err.status === 404) return { status: "not_found" };
      return { status: "error", error: (err as Error).message };
    }
  }

  async retrieve(attempt: AttemptRow): Promise<ProviderStatus> {
    if (!attempt.providerRef) return { state: "failed", payments: [] };
    const o = await this.api<PPOrder>("GET", `/v2/checkout/orders/${encodeURIComponent(attempt.providerRef)}`);
    return mapOrder(o);
  }

  async capture(attempt: AttemptRow): Promise<ProviderStatus & { declinedRetryable?: boolean }> {
    if (!attempt.providerRef) throw new ProviderError("Attempt has no PayPal order id");
    try {
      const o = await this.api<PPOrder>(
        "POST",
        `/v2/checkout/orders/${encodeURIComponent(attempt.providerRef)}/capture`,
        {},
        { "PayPal-Request-Id": `capture-${attempt.id}` },
      );
      return mapOrder(o);
    } catch (err) {
      if (err instanceof PayPalApiError) {
        if (err.issues.includes("ORDER_ALREADY_CAPTURED")) return this.retrieve(attempt);
        if (err.issues.includes("INSTRUMENT_DECLINED")) {
          // Documented recovery: send the buyer back to PayPal to choose another funding source.
          const current = await this.retrieve(attempt);
          return { ...current, state: "open", declinedRetryable: true };
        }
      }
      throw err;
    }
  }

  async refund(payment: PaymentRow, amountMinor: number, idempotencyKey: string, _reason?: string, ourRefundId?: string): Promise<RefundResult> {
    const r = await this.api<{ id: string; status: string; status_details?: { reason?: string } }>(
      "POST",
      `/v2/payments/captures/${encodeURIComponent(payment.providerPaymentId)}/refund`,
      { amount: { currency_code: payment.currency, value: toDecimal(amountMinor) }, ...(ourRefundId ? { custom_id: ourRefundId } : {}) },
      { "PayPal-Request-Id": idempotencyKey },
    );
    const status = r.status === "COMPLETED" ? "succeeded" : r.status === "PENDING" ? "pending" : "failed";
    return { providerRefundId: r.id, status, failureReason: r.status_details?.reason ?? null };
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<NormalizedEvent> {
    if (!this.cfg.webhookId) throw new WebhookVerificationError("PAYPAL_WEBHOOK_ID is not configured");
    let event: { id: string; event_type: string; resource: Record<string, unknown>; create_time?: string };
    try {
      event = JSON.parse(rawBody);
    } catch {
      throw new WebhookVerificationError("Body is not JSON");
    }
    const h = (k: string) => headers.get(k) ?? "";
    // Documented postback verification. The event body is passed back exactly as received.
    const verification = await this.api<{ verification_status: string }>("POST", "/v1/notifications/verify-webhook-signature", {
      auth_algo: h("paypal-auth-algo"),
      cert_url: h("paypal-cert-url"),
      transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"),
      transmission_time: h("paypal-transmission-time"),
      webhook_id: this.cfg.webhookId,
      webhook_event: event,
    });
    if (verification.verification_status !== "SUCCESS") throw new WebhookVerificationError("PayPal webhook signature verification failed");
    return normalizePayPalEvent(event);
  }

  dashboardUrl(kind: "payment" | "checkout", id: string) {
    const base = this.cfg.env === "live" ? "https://www.paypal.com" : "https://www.sandbox.paypal.com";
    return kind === "payment" ? `${base}/activity/payment/${id}` : null;
  }
}

function mapAddress(a: PPAddress | undefined, name?: string): Address | null {
  if (!a) return null;
  return {
    name: name ?? "",
    line1: a.address_line_1 ?? "",
    line2: a.address_line_2 ?? null,
    postalCode: a.postal_code ?? "",
    city: a.admin_area_2 ?? "",
    country: a.country_code ?? "",
  };
}

function capturePayment(c: PPCapture, pu: PPPurchaseUnit | undefined, orderId: string): VerifiedPayment {
  return {
    providerPaymentId: c.id,
    status: c.status === "COMPLETED" || c.status === "REFUNDED" || c.status === "PARTIALLY_REFUNDED" ? "succeeded" : c.status === "PENDING" ? "processing" : "failed",
    amountMinor: fromDecimal(c.amount.value),
    currency: c.amount.currency_code.toUpperCase(),
    reference: { orderId: pu?.reference_id ?? null, attemptId: c.custom_id ?? pu?.custom_id ?? null },
    capturedAt: c.create_time ? new Date(c.create_time) : new Date(),
    shippingAddress: pu?.shipping ? mapAddress(pu.shipping.address, pu.shipping.name?.full_name) : null,
    details: { paypalOrderId: orderId, captureStatus: c.status, reason: c.status_details?.reason ?? null },
  };
}

export function mapOrder(o: PPOrder): ProviderStatus {
  const pu = o.purchase_units?.[0];
  const reference = { orderId: pu?.reference_id ?? null, attemptId: pu?.custom_id ?? null };
  const shippingAddress = pu?.shipping ? mapAddress(pu.shipping.address, pu.shipping.name?.full_name) : null;
  const amount = pu?.amount ? { amountMinor: fromDecimal(pu.amount.value), currency: pu.amount.currency_code.toUpperCase() } : {};
  const payerActionUrl = o.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href ?? null;
  const caps = pu?.payments?.captures ?? [];
  const payments = caps.map((c) => capturePayment(c, pu, o.id));
  let state: ProviderStatus["state"];
  if (o.status === "APPROVED") state = "approved";
  else if (o.status === "VOIDED") state = "cancelled";
  else if (o.status === "COMPLETED") {
    state = payments.some((p) => p.status === "succeeded") ? "succeeded" : payments.some((p) => p.status === "processing") ? "processing" : "failed";
  } else state = "open";
  return { state, payments, shippingAddress, reference, payerActionUrl, ...amount };
}

export function normalizePayPalEvent(event: { id: string; event_type: string; resource: Record<string, unknown> }): NormalizedEvent {
  const base = { provider: "paypal" as const, eventId: event.id, type: event.event_type, summary: { type: event.event_type } };
  const r = event.resource;
  switch (event.event_type) {
    case "CHECKOUT.ORDER.APPROVED": {
      const o = r as unknown as PPOrder;
      return { ...base, kind: "checkout_approved", checkoutRef: o.id, attemptId: o.purchase_units?.[0]?.custom_id ?? null, orderId: o.purchase_units?.[0]?.reference_id ?? null, summary: { ...base.summary, order: o.id } };
    }
    case "PAYMENT.CAPTURE.COMPLETED":
    case "PAYMENT.CAPTURE.PENDING":
    case "PAYMENT.CAPTURE.DENIED":
    case "PAYMENT.CAPTURE.DECLINED": {
      const c = r as unknown as PPCapture;
      const paypalOrderId = c.supplementary_data?.related_ids?.order_id ?? null;
      const payment = capturePayment(c, undefined, paypalOrderId ?? "");
      const kind = event.event_type === "PAYMENT.CAPTURE.COMPLETED" ? "payment_succeeded" : event.event_type === "PAYMENT.CAPTURE.PENDING" ? "payment_processing" : "payment_failed";
      return {
        ...base,
        kind,
        checkoutRef: paypalOrderId,
        attemptId: c.custom_id ?? null,
        payment,
        failureReason: kind === "payment_failed" ? (c.status_details?.reason ?? "Capture declined") : null,
        summary: { ...base.summary, capture: c.id, status: c.status, amount: c.amount },
      };
    }
    case "PAYMENT.CAPTURE.REFUNDED": {
      const refund = r as { id: string; status: string; amount: PPMoney; custom_id?: string; links?: { href: string; rel: string }[] };
      const up = refund.links?.find((l) => l.rel === "up")?.href ?? "";
      const captureId = /\/captures\/([^/]+)/.exec(up)?.[1] ?? null;
      return {
        ...base,
        kind: "refund_updated",
        refund: {
          providerRefundId: refund.id,
          providerPaymentId: captureId,
          ourRefundId: refund.custom_id ?? null,
          amountMinor: fromDecimal(refund.amount.value),
          currency: refund.amount.currency_code.toUpperCase(),
          status: refund.status === "COMPLETED" ? "succeeded" : refund.status === "PENDING" ? "pending" : refund.status === "CANCELLED" ? "cancelled" : "failed",
        },
        summary: { ...base.summary, refund: refund.id, status: refund.status },
      };
    }
    case "PAYMENT.CAPTURE.REVERSED":
    case "CUSTOMER.DISPUTE.CREATED": {
      const captureId =
        (r as { id?: string }).id && event.event_type === "PAYMENT.CAPTURE.REVERSED"
          ? (r as { id: string }).id
          : ((r as { disputed_transactions?: { seller_transaction_id?: string }[] }).disputed_transactions?.[0]?.seller_transaction_id ?? null);
      return {
        ...base,
        kind: "dispute_opened",
        payment: captureId ? { providerPaymentId: captureId, status: "succeeded", amountMinor: 0, currency: "", reference: {} } : undefined,
      };
    }
    default:
      return { ...base, kind: "ignored" };
  }
}

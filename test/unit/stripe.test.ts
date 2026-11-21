import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { normalizeStripeEvent, StripeProvider } from "@/server/payments/stripe";
import { WebhookVerificationError, type CheckoutContext } from "@/server/payments/types";
import { orderFixture } from "./fixtures";

const SECRET = "whsec_test_secret_for_unit_tests";

function stripeWith(handler: (url: string, init: RequestInit) => { status?: number; body: unknown }) {
  const calls: { url: string; method: string; body: string; headers: Record<string, string> }[] = [];
  const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers: Record<string, string> = {};
    new Headers(init?.headers as HeadersInit).forEach((v, k) => (headers[k.toLowerCase()] = v));
    calls.push({ url, method: init?.method ?? "GET", body: String(init?.body ?? ""), headers });
    const r = handler(url, init ?? {});
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json", "request-id": "req_test" } });
  };
  const client = new Stripe("sk_test_unit", { httpClient: Stripe.createFetchHttpClient(fetchFn as typeof fetch), maxNetworkRetries: 0 });
  return { client, calls };
}

const ctx = (): CheckoutContext => {
  const { order, lines, attempt } = orderFixture();
  return { order, lines, attempt, successUrl: "https://shop.test/checkout/complete?attempt=a", cancelUrl: "https://shop.test/checkout/cancel?attempt=a", returnUrl: "https://shop.test/checkout/return?attempt=a", locale: "en-GB" };
};

describe("Stripe Checkout session creation", () => {
  it("creates the session server-side from the order snapshot, idempotently, with our references", async () => {
    const c = ctx();
    const { client, calls } = stripeWith(() => ({ body: { id: "cs_test_1", object: "checkout.session", url: "https://checkout.stripe.com/c/pay/cs_test_1", amount_total: c.order.totalMinor } }));
    const p = new StripeProvider({ secretKey: "sk_test_unit", webhookSecret: SECRET, paymentMethodTypes: ["card"] }, client);
    const out = await p.createCheckout(c);
    expect(out).toEqual({ providerRef: "cs_test_1", redirectUrl: "https://checkout.stripe.com/c/pay/cs_test_1" });
    const call = calls[0]!;
    expect(call.url).toContain("/v1/checkout/sessions");
    expect(call.headers["idempotency-key"]).toBe(`checkout-${c.attempt.id}`);
    const form = new URLSearchParams(call.body);
    expect(form.get("mode")).toBe("payment");
    expect(form.get("metadata[order_id]")).toBe(c.order.id);
    expect(form.get("metadata[attempt_id]")).toBe(c.attempt.id);
    expect(form.get("client_reference_id")).toBe(c.order.id);
    expect(form.get("line_items[0][price_data][currency]")).toBe("nok");
    expect(form.get("shipping_options[0][shipping_rate_data][fixed_amount][amount]")).toBe(String(c.order.shippingMinor));
    expect(form.get("payment_intent_data[shipping][address][postal_code]")).toBe("0155");
    expect(form.get("expires_at")).toBe(String(Math.floor(c.attempt.expiresAt.getTime() / 1000)));
    expect(form.get("allowed_payment_method_types[0]")).toBe("card");
    // amounts sent = order total
    let goods = 0;
    for (let i = 0; form.has(`line_items[${i}][quantity]`); i++) goods += Number(form.get(`line_items[${i}][quantity]`)) * Number(form.get(`line_items[${i}][price_data][unit_amount]`));
    expect(goods + c.order.shippingMinor).toBe(c.order.totalMinor);
    // never sends card data or prices from the browser: nothing but our snapshot is in the request
    expect(call.body).not.toMatch(/card\[number\]/);
  });

  it("expires a session whose total doesn't match the order, and refuses to use it", async () => {
    const c = ctx();
    const { client, calls } = stripeWith((url) => (url.endsWith("/expire") ? { body: { id: "cs_bad", object: "checkout.session", status: "expired" } } : { body: { id: "cs_bad", object: "checkout.session", url: "https://x", amount_total: c.order.totalMinor + 1 } }));
    const p = new StripeProvider({ secretKey: "sk_test_unit", webhookSecret: SECRET }, client);
    await expect(p.createCheckout(c)).rejects.toThrow(/does not match/);
    expect(calls.some((x) => x.url.includes("/v1/checkout/sessions/cs_bad/expire"))).toBe(true);
  });
});

describe("Stripe webhook verification", () => {
  const session = (over: Partial<Stripe.Checkout.Session> = {}) => ({
    id: "cs_test_1",
    object: "checkout.session",
    payment_status: "paid",
    status: "complete",
    amount_total: 69800,
    currency: "nok",
    payment_intent: "pi_test_1",
    client_reference_id: "order-1",
    metadata: { order_id: "order-1", attempt_id: "attempt-1" },
    ...over,
  });
  const eventBody = (type: string, object: unknown, id = "evt_test_1") => JSON.stringify({ id, object: "event", type, created: 1763300000, livemode: false, data: { object } });
  const provider = new StripeProvider({ secretKey: "sk_test_unit", webhookSecret: SECRET }, new Stripe("sk_test_unit"));
  const signed = (payload: string, opts: { secret?: string; timestamp?: number } = {}) =>
    new Headers({ "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? SECRET, timestamp: opts.timestamp }) });

  it("accepts a correctly signed event and normalises it", async () => {
    const raw = eventBody("checkout.session.completed", session());
    const ev = await provider.parseWebhook(raw, signed(raw));
    expect(ev).toMatchObject({
      provider: "stripe",
      eventId: "evt_test_1",
      kind: "payment_succeeded",
      checkoutRef: "cs_test_1",
      attemptId: "attempt-1",
      payment: { providerPaymentId: "pi_test_1", amountMinor: 69800, currency: "NOK", reference: { orderId: "order-1", attemptId: "attempt-1" } },
    });
  });

  it("rejects a missing, wrong-secret, tampered or stale signature", async () => {
    const raw = eventBody("checkout.session.completed", session());
    await expect(provider.parseWebhook(raw, new Headers())).rejects.toBeInstanceOf(WebhookVerificationError);
    await expect(provider.parseWebhook(raw, signed(raw, { secret: "whsec_other" }))).rejects.toBeInstanceOf(WebhookVerificationError);
    await expect(provider.parseWebhook(raw.replace("69800", "1"), signed(raw))).rejects.toBeInstanceOf(WebhookVerificationError);
    await expect(provider.parseWebhook(raw, signed(raw, { timestamp: Math.floor(Date.now() / 1000) - 3600 }))).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it("maps delayed, failed, expired, refund and dispute events", () => {
    const ev = (type: string, object: unknown) => normalizeStripeEvent(JSON.parse(eventBody(type, object)) as Stripe.Event);
    expect(ev("checkout.session.completed", session({ payment_status: "unpaid" })).kind).toBe("payment_processing");
    expect(ev("checkout.session.async_payment_succeeded", session()).kind).toBe("payment_succeeded");
    expect(ev("checkout.session.async_payment_failed", session({ payment_status: "unpaid" })).kind).toBe("payment_failed");
    expect(ev("checkout.session.expired", session({ status: "expired", payment_status: "unpaid", payment_intent: null })).kind).toBe("checkout_expired");
    const refund = ev("refund.updated", { id: "re_1", object: "refund", amount: 1000, currency: "nok", status: "succeeded", payment_intent: "pi_test_1", metadata: { refund_id: "11111111-1111-4111-8111-111111111111" } });
    expect(refund).toMatchObject({ kind: "refund_updated", refund: { providerRefundId: "re_1", providerPaymentId: "pi_test_1", ourRefundId: "11111111-1111-4111-8111-111111111111", status: "succeeded", currency: "NOK" } });
    expect(ev("charge.dispute.created", { id: "dp_1", object: "dispute", amount: 69800, currency: "nok", payment_intent: "pi_test_1", reason: "fraudulent" }).kind).toBe("dispute_opened");
    expect(ev("customer.created", { id: "cus_1" }).kind).toBe("ignored");
  });
});

import { describe, expect, it } from "vitest";
import { PayPalProvider } from "@/server/payments/paypal";
import { WebhookVerificationError } from "@/server/payments/types";
import { orderFixture } from "./fixtures";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function paypal(routes: (c: Call) => { status?: number; body: unknown } | undefined) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const raw = init?.body ? String(init.body) : "";
    const call: Call = { url, method: init?.method ?? "GET", headers, body: raw.startsWith("{") ? JSON.parse(raw) : raw };
    calls.push(call);
    if (url.endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "A21AA-test", expires_in: 32400 }), { status: 200 });
    const r = routes(call) ?? { status: 404, body: { name: "RESOURCE_NOT_FOUND" } };
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "paypal-debug-id": "dbg_1" } });
  }) as typeof fetch;
  const p = new PayPalProvider({ env: "sandbox", clientId: "cid", clientSecret: "secret", webhookId: "WH-1", baseUrl: "https://api-m.sandbox.paypal.test", fetchImpl });
  return { p, calls };
}

const completedOrder = (amount: string, extra: Record<string, unknown> = {}) => ({
  id: "ORDER-PP-1",
  status: "COMPLETED",
  purchase_units: [
    {
      reference_id: orderFixture().order.id,
      custom_id: orderFixture().attempt.id,
      shipping: { address: { postal_code: "0155", country_code: "NO", address_line_1: "Storgata 1", admin_area_2: "Oslo" } },
      payments: { captures: [{ id: "CAP-1", status: "COMPLETED", amount: { currency_code: "NOK", value: amount }, custom_id: orderFixture().attempt.id, ...extra }] },
    },
  ],
});

describe("PayPal Orders v2", () => {
  it("creates the order server-side: intent CAPTURE, our address, exact breakdown, idempotent request id", async () => {
    const { order, lines, attempt } = orderFixture();
    const { p, calls } = paypal((c) => (c.url.endsWith("/v2/checkout/orders") ? { status: 201, body: { id: "ORDER-PP-1", status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-PP-1" }] } } : undefined));
    const out = await p.createCheckout({ order, lines, attempt, successUrl: "s", cancelUrl: "https://shop.test/cancel", returnUrl: "https://shop.test/return", locale: "en-GB" });
    expect(out).toEqual({ providerRef: "ORDER-PP-1", redirectUrl: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-PP-1" });
    const create = calls.find((c) => c.url.endsWith("/v2/checkout/orders"))!;
    expect(create.headers["paypal-request-id"]).toBe(`create-${attempt.id}`);
    const body = create.body as { intent: string; purchase_units: { custom_id: string; amount: { value: string; breakdown: { item_total: { value: string }; shipping: { value: string } } }; items: { quantity: string; unit_amount: { value: string } }[] }[]; payment_source: { paypal: { experience_context: { shipping_preference: string } } } };
    expect(body.intent).toBe("CAPTURE");
    const pu = body.purchase_units[0]!;
    expect(pu.custom_id).toBe(attempt.id);
    expect(body.payment_source.paypal.experience_context.shipping_preference).toBe("SET_PROVIDED_ADDRESS");
    const items = pu.items.reduce((s, i) => s + Number(i.quantity) * Math.round(Number(i.unit_amount.value) * 100), 0);
    expect(items).toBe(Math.round(Number(pu.amount.breakdown.item_total.value) * 100));
    expect(Math.round(Number(pu.amount.value) * 100)).toBe(order.totalMinor);
  });

  it("approval is not payment: capture happens on our server and is mapped from the capture result", async () => {
    const { attempt, order } = orderFixture();
    const { p, calls } = paypal((c) => (c.url.endsWith("/capture") ? { status: 201, body: completedOrder((order.totalMinor / 100).toFixed(2)) } : undefined));
    const st = await p.capture!(attempt);
    expect(calls.find((c) => c.url.endsWith("/capture"))!.headers["paypal-request-id"]).toBe(`capture-${attempt.id}`);
    expect(st.state).toBe("succeeded");
    expect(st.payments[0]).toMatchObject({ providerPaymentId: "CAP-1", status: "succeeded", amountMinor: order.totalMinor, currency: "NOK", reference: { attemptId: attempt.id } });
  });

  it("a pending capture is processing, not paid", async () => {
    const { attempt, order } = orderFixture();
    const { p } = paypal((c) => (c.url.endsWith("/capture") ? { status: 201, body: completedOrder((order.totalMinor / 100).toFixed(2), { status: "PENDING", status_details: { reason: "PENDING_REVIEW" } }) } : undefined));
    const st = await p.capture!(attempt);
    expect(st.payments[0]!.status).toBe("processing");
    expect(st.state).not.toBe("succeeded");
  });

  it("an already-captured order is read back instead of captured twice", async () => {
    const { attempt, order } = orderFixture();
    const { p, calls } = paypal((c) =>
      c.url.endsWith("/capture")
        ? { status: 422, body: { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "ORDER_ALREADY_CAPTURED" }] } }
        : c.method === "GET" && c.url.includes("/v2/checkout/orders/ORDER-PP-1")
          ? { body: completedOrder((order.totalMinor / 100).toFixed(2)) }
          : undefined,
    );
    const st = await p.capture!(attempt);
    expect(st.state).toBe("succeeded");
    expect(calls.filter((c) => c.url.endsWith("/capture"))).toHaveLength(1);
  });

  it("verifies webhooks with PayPal's verify-webhook-signature API", async () => {
    const body = JSON.stringify({ id: "WH-EVT-1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP-1", status: "COMPLETED", amount: { currency_code: "NOK", value: "100.00" }, custom_id: "5f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f", supplementary_data: { related_ids: { order_id: "ORDER-PP-1" } } } });
    const headers = new Headers({ "paypal-transmission-id": "t1", "paypal-transmission-sig": "sig", "paypal-transmission-time": "2026-11-16T10:00:00Z", "paypal-cert-url": "https://api.sandbox.paypal.com/cert", "paypal-auth-algo": "SHA256withRSA" });
    const good = paypal((c) => (c.url.endsWith("/v1/notifications/verify-webhook-signature") ? { body: { verification_status: "SUCCESS" } } : undefined));
    const ev = await good.p.parseWebhook(body, headers);
    expect(ev).toMatchObject({ provider: "paypal", eventId: "WH-EVT-1", kind: "payment_succeeded", payment: { providerPaymentId: "CAP-1", amountMinor: 10000, currency: "NOK" } });
    const verify = good.calls.find((c) => c.url.endsWith("/verify-webhook-signature"))!.body as { webhook_id: string; transmission_sig: string };
    expect(verify).toMatchObject({ webhook_id: "WH-1", transmission_sig: "sig" });

    const bad = paypal((c) => (c.url.endsWith("/v1/notifications/verify-webhook-signature") ? { body: { verification_status: "FAILURE" } } : undefined));
    await expect(bad.p.parseWebhook(body, headers)).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it("refunds use the capture, a request id and our refund reference", async () => {
    const { p, calls } = paypal((c) => (c.url.includes("/v2/payments/captures/CAP-1/refund") ? { status: 201, body: { id: "RF-1", status: "COMPLETED" } } : undefined));
    const r = await p.refund({ providerPaymentId: "CAP-1", currency: "NOK" } as never, 2500, "refund:key:1", "requested_by_customer", "11111111-1111-4111-8111-111111111111");
    expect(r).toMatchObject({ providerRefundId: "RF-1", status: "succeeded" });
    const call = calls.find((c) => c.url.includes("/refund"))!;
    expect(call.headers["paypal-request-id"]).toBe("refund:key:1");
    expect(call.body).toMatchObject({ amount: { currency_code: "NOK", value: "25.00" }, custom_id: "11111111-1111-4111-8111-111111111111" });
  });
});

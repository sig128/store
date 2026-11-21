import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The same seeded catalogue, evaluated as if APP_ENV=production: nothing is
 * sellable, the simulator is off and checkout is closed until an operator has
 * completed the launch checklist.
 */
describe("production mode", () => {
  beforeAll(() => {
    process.env.APP_ENV = "production";
    vi.resetModules();
  });
  afterAll(async () => {
    const { closeDb } = await import("@/server/db");
    await closeDb();
    process.env.APP_ENV = "test";
    vi.resetModules();
  });

  it("keeps checkout closed and lists what is missing", async () => {
    const { checkoutGate } = await import("@/server/readiness");
    const gate = await checkoutGate();
    expect(gate.open).toBe(false);
    const ids = gate.failing.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["seller", "support", "tax", "shipping", "policy_terms", "payments_live", "email", "products_on_sale"]));
  });

  it("never offers the payment simulator", async () => {
    const { simulatorEnabled } = await import("@/server/env");
    const { providerForChoice } = await import("@/server/payments");
    expect(simulatorEnabled()).toBe(false);
    expect(providerForChoice("card", { stripe: true, paypal: true })).toBeNull();
    expect(providerForChoice("paypal", { stripe: true, paypal: true })).toBeNull();
  });

  it("refuses to start a checkout, whatever the browser sends", async () => {
    const { startCheckout } = await import("@/server/orders/checkout");
    const r = await startCheckout({ cartToken: "anything", email: "a@b.no", address: {}, quoteId: "00000000-0000-4000-8000-000000000000", choice: "card", termsAccepted: true, acknowledgedTotalMinor: 1 });
    expect(r).toMatchObject({ ok: false, code: "closed" });
  });

  it("shows unapproved products as not on sale and hides unapproved Locker Tag templates, sample sizes and unapproved delivery rates", async () => {
    const { listProducts, getProductDetail } = await import("@/server/catalog");
    const { ratesFor } = await import("@/server/shipping");
    const { db } = await import("@/server/db");
    const list = await listProducts();
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((p) => !p.purchasable)).toBe(true);
    expect(list.every((p) => !p.personalizable)).toBe(true);
    const singlet = await getProductDetail("heat-check-training-singlet");
    expect(singlet!.personalization).toBeNull();
    expect(singlet!.sizeChart).toEqual([]); // seeded charts are sample data
    expect(await ratesFor(db(), "NO", 0, "NOK")).toEqual([]); // seeded rates aren't approved
  });
});

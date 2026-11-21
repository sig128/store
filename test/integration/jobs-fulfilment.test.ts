import { afterAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, db } from "@/server/db";
import { emailDeliveries, fulfillmentRequests, jobs, shipments } from "@/server/db/schema";
import { runJobsOnce } from "@/server/jobs/worker";
import { retryJob } from "@/server/jobs/queue";
import { markShipped, setFulfillment } from "@/server/orders/operations";
import { buildProductionPayload } from "@/server/fulfillment";
import { checkout, event, newCart, paymentFor, reload, send, setStock } from "../helpers";

const actor = { id: "test", email: "packer@test.invalid", role: "fulfillment" };

async function paidOrder(lines: Parameters<typeof newCart>[0]) {
  for (const l of lines) await setStock(l.code, 10);
  const { cart, token } = await newCart(lines);
  const { order, attempt } = await checkout(token, cart.id);
  await send(event(attempt!, "payment_succeeded", { payment: paymentFor(attempt!) }));
  return reload(order!.id);
}

const drain = async () => {
  for (let i = 0; i < 10; i++) if ((await runJobsOnce("test-worker", 50)) === 0) break;
};

afterAll(async () => {
  await closeDb();
});

describe("background jobs", () => {
  it("sends the confirmation once, with a private link that isn't stored in plain text", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const o = await paidOrder([{ code: "LS-WBLK-XL" }]);
    await drain();
    const mails = await db().select().from(emailDeliveries).where(eq(emailDeliveries.orderId, o.id));
    const conf = mails.filter((m) => m.template === "order_confirmation");
    expect(conf).toHaveLength(1);
    expect(conf[0]!.status).toBe("sent");
    expect(conf[0]!.toAddress).toBe("buyer@example.com");
    expect(conf[0]!.bodyText).toContain("/o/[private link]");
    expect(conf[0]!.bodyText).not.toMatch(/\/o\/[A-Za-z0-9_-]{20,}/);
    // the email that went out did contain a working link
    expect(log.mock.calls.flat().join("\n")).toMatch(/\/o\/[A-Za-z0-9_-]{40,}/);
    log.mockRestore();

    // Retrying a finished job is refused; re-running the worker sends nothing new.
    const [job] = await db().select().from(jobs).where(and(eq(jobs.orderId, o.id), eq(jobs.type, "email.order_confirmation")));
    expect(job!.status).toBe("succeeded");
    expect(await retryJob(db(), job!.id)).toBe(false);
    await drain();
    expect((await db().select().from(emailDeliveries).where(eq(emailDeliveries.orderId, o.id))).filter((m) => m.template === "order_confirmation")).toHaveLength(1);
  });

  it("a failed email job backs off, and an operator retry doesn't duplicate a delivered email", async () => {
    const o = await paidOrder([{ code: "LS-WBLK-XS" }]);
    const log = vi.spyOn(console, "log").mockImplementationOnce(() => {
      throw new Error("SMTP connection refused");
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await runJobsOnce("test-worker", 50);
    let [job] = await db().select().from(jobs).where(and(eq(jobs.orderId, o.id), eq(jobs.type, "email.order_confirmation")));
    expect(job!.status).toBe("failed");
    expect(job!.lastError).toMatch(/SMTP/);
    expect(job!.runAt.getTime()).toBeGreaterThan(Date.now()); // backoff
    const [failed] = await db().select().from(emailDeliveries).where(and(eq(emailDeliveries.orderId, o.id), eq(emailDeliveries.template, "order_confirmation")));
    expect(failed!.status).toBe("failed");

    expect(await retryJob(db(), job!.id)).toBe(true);
    log.mockImplementation(() => undefined);
    await drain();
    [job] = await db().select().from(jobs).where(eq(jobs.id, job!.id));
    expect(job!.status).toBe("succeeded");
    const all = await db().select().from(emailDeliveries).where(and(eq(emailDeliveries.orderId, o.id), eq(emailDeliveries.template, "order_confirmation")));
    expect(all).toHaveLength(1);
    expect(all[0]!.status).toBe("sent");
    log.mockRestore();
    err.mockRestore();
  });
});

describe("manual fulfilment", () => {
  it("prepares structured production data, then ships with tracking and one shipping email", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const o = await paidOrder([{ code: "HC-ASPH-S", personalization: { fields: { name: "KARI", number: "7" }, colorId: "bone", spellingConfirmed: true } }, { code: "NR-CHAR-L" }]);
    await drain();
    const [req] = await db().select().from(fulfillmentRequests).where(eq(fulfillmentRequests.orderId, o.id));
    expect(req!.provider).toBe("manual");
    const payload = await buildProductionPayload(db(), o.id);
    const tagged = payload.lines.find((l) => l.sku === "HC-ASPH-S")!;
    expect(tagged.personalization).toMatchObject({ text: { name: "KARI", number: "7" }, color: { hex: "#ebe3d2" }, template: "LT-SINGLET-UB" });
    expect(payload.lines.find((l) => l.sku === "NR-CHAR-L")!.personalization).toBeNull();

    await setFulfillment(o.id, "in_production", actor);
    await setFulfillment(o.id, "packed", actor);
    await markShipped(o.id, { carrierId: "posten-bring", carrierName: "Posten/Bring", trackingNumber: "70701234567890123", trackingUrl: null, notify: true }, actor);
    await expect(markShipped(o.id, { carrierId: "posten-bring", carrierName: "Posten/Bring", trackingNumber: "70701234567890123", trackingUrl: null, notify: true }, actor)).rejects.toThrow();
    await drain();
    const shipped = await reload(o.id);
    expect(shipped.fulfillmentStatus).toBe("shipped");
    const ships = await db().select().from(shipments).where(eq(shipments.orderId, o.id));
    expect(ships).toHaveLength(1);
    expect(ships[0]!.trackingUrl).toBe("https://sporing.posten.no/sporing/70701234567890123");
    const mails = await db().select().from(emailDeliveries).where(and(eq(emailDeliveries.orderId, o.id), eq(emailDeliveries.template, "shipped")));
    expect(mails).toHaveLength(1);
    expect(mails[0]!.bodyText).toContain("70701234567890123");
    log.mockRestore();
  });

  it("orders flagged for review can't be fulfilled until the flag is resolved", async () => {
    await setStock("FW-TEAL-S", 3);
    const { cart, token } = await newCart([{ code: "FW-TEAL-S" }]);
    const { order, attempt } = await checkout(token, cart.id);
    await send(event(attempt!, "payment_succeeded", { payment: paymentFor(attempt!, { amountMinor: attempt!.amountMinor - 1 }) }));
    await expect(setFulfillment(order!.id, "in_production", actor)).rejects.toThrow(/Only paid orders|flagged/);
  });
});

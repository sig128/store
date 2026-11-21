"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { discountCodes, shippingRates, shippingZones } from "@/server/db/schema";
import { assertAdmin } from "@/server/auth/session";
import { audit, type Actor } from "@/server/audit";
import { getSetting, saveSetting, type SettingsKey } from "@/server/settings";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const int = (f: FormData, k: string) => (s(f, k) === "" ? null : Math.round(Number(s(f, k))));
const minor = (v: string) => {
  if (v === "") return null;
  const m = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(v);
  if (!m) throw new Error(`"${v}" is not an amount (use 149 or 149.00).`);
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
};
const on = (f: FormData, k: string) => f.get(k) === "on";

async function act(anchor: string, fn: (actor: Actor) => Promise<string>) {
  const a = await assertAdmin("settings:write");
  let msg: string;
  try {
    msg = await fn(a.actor);
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    redirect(`/admin/settings?err=${encodeURIComponent(m)}#${anchor}`);
  }
  revalidatePath("/", "layout");
  redirect(`/admin/settings?msg=${encodeURIComponent(msg!)}#${anchor}`);
}

async function save<K extends SettingsKey>(key: K, value: unknown, actor: Actor) {
  const before = await getSetting(key);
  const after = await saveSetting(key, value, actor.email);
  await audit(db(), actor, "settings.save", "settings", key, `Saved ${key} settings`, { before, after });
}

export async function saveStoreAction(f: FormData) {
  await act("store", async (actor) => {
    await save(
      "store",
      {
        market: s(f, "market").toUpperCase(),
        currency: s(f, "currency").toUpperCase(),
        locale: s(f, "locale"),
        timeZone: s(f, "timeZone"),
        shipsTo: s(f, "shipsTo").toUpperCase().split(/[\s,]+/).filter(Boolean),
      },
      actor,
    );
    return "Store settings saved.";
  });
}

export async function saveSellerAction(f: FormData) {
  await act("seller", async (actor) => {
    await save(
      "seller",
      {
        legalName: s(f, "legalName"),
        tradingName: s(f, "tradingName"),
        orgNumber: s(f, "orgNumber"),
        vatNumber: s(f, "vatNumber"),
        addressLines: s(f, "address").split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
        country: s(f, "country").toUpperCase(),
        email: s(f, "email"),
        phone: s(f, "phone"),
      },
      actor,
    );
    return "Seller identity saved. New orders snapshot it; past receipts are unchanged.";
  });
}

export async function saveTaxAction(f: FormData) {
  await act("tax", async (actor) => {
    const mode = s(f, "mode");
    if (mode !== "unconfigured" && !on(f, "confirm")) throw new Error("Confirm that your accountant has approved the tax setup.");
    await save(
      "tax",
      { mode, label: s(f, "label"), rateBps: Math.round(Number(s(f, "ratePct").replace(",", ".")) * 100), shippingTaxable: on(f, "shippingTaxable"), dutiesNote: s(f, "dutiesNote") },
      actor,
    );
    return "Tax settings saved. Only new orders use them.";
  });
}

export async function saveCheckoutAction(f: FormData) {
  await act("checkout", async (actor) => {
    const attempt = int(f, "attemptMinutes") ?? 30;
    const reservation = int(f, "reservationMinutes") ?? 40;
    if (reservation <= attempt) throw new Error("Stock must be held longer than a payment session lasts.");
    await save(
      "checkout",
      { termsVersion: s(f, "termsVersion"), reservationMinutes: reservation, attemptMinutes: attempt, quoteMinutes: int(f, "quoteMinutes") ?? 30, stripeEnabled: on(f, "stripeEnabled"), paypalEnabled: on(f, "paypalEnabled") },
      actor,
    );
    return "Checkout settings saved.";
  });
}

export async function saveSupportAction(f: FormData) {
  await act("support", async (actor) => {
    await save("support", { supportEmail: s(f, "supportEmail"), orderLinkDays: int(f, "orderLinkDays") ?? 30, withdrawalDays: int(f, "withdrawalDays") ?? 14, dispatchNote: s(f, "dispatchNote"), returnShippingNote: s(f, "returnShippingNote") }, actor);
    return "Support settings saved.";
  });
}

export async function saveFeaturesAction(f: FormData) {
  await act("features", async (actor) => {
    await save("features", { personalization: on(f, "personalization"), dropSignup: on(f, "dropSignup"), productFeed: on(f, "productFeed") }, actor);
    return "Features saved.";
  });
}

export async function zoneAction(f: FormData) {
  await act("shipping", async (actor) => {
    const countries = s(f, "countries").toUpperCase().split(/[\s,]+/).filter(Boolean);
    if (!s(f, "name") || !countries.length || countries.some((c) => !/^[A-Z]{2}$/.test(c))) throw new Error("A zone needs a name and two-letter country codes.");
    const id = s(f, "zoneId");
    if (id) await db().update(shippingZones).set({ name: s(f, "name"), countries, active: on(f, "active"), updatedAt: new Date() }).where(eq(shippingZones.id, id));
    else await db().insert(shippingZones).values({ name: s(f, "name"), countries, active: true });
    await audit(db(), actor, "shipping.zone", "shipping_zone", id || null, `${id ? "Updated" : "Created"} zone ${s(f, "name")} (${countries.join(", ")})`);
    return "Zone saved.";
  });
}

export async function rateAction(f: FormData) {
  await act("shipping", async (actor) => {
    const price = minor(s(f, "price"));
    if (price == null) throw new Error("Enter the shipping price.");
    const minDays = int(f, "minDays");
    const maxDays = int(f, "maxDays");
    if ((minDays == null) !== (maxDays == null) || (minDays != null && maxDays != null && minDays > maxDays)) throw new Error("Give both delivery-day numbers (min ≤ max), or neither.");
    const approved = on(f, "approved");
    if (approved && !on(f, "confirm")) throw new Error("Tick the confirmation that the carrier, price and estimate are agreed.");
    const values = {
      name: s(f, "name"),
      carrier: s(f, "carrier"),
      service: s(f, "service") || null,
      priceMinor: price,
      currency: s(f, "currency").toUpperCase() || "NOK",
      freeOverMinor: minor(s(f, "freeOver")),
      minDays,
      maxDays,
      approved,
      active: on(f, "active"),
      sort: int(f, "sort") ?? 0,
    };
    if (!values.name || !values.carrier) throw new Error("A rate needs a name and a carrier.");
    const id = s(f, "rateId");
    if (id) await db().update(shippingRates).set({ ...values, updatedAt: new Date() }).where(and(eq(shippingRates.id, id), eq(shippingRates.zoneId, s(f, "zoneId"))));
    else await db().insert(shippingRates).values({ ...values, zoneId: s(f, "zoneId") });
    await audit(db(), actor, "shipping.rate", "shipping_rate", id || null, `${id ? "Updated" : "Created"} rate ${values.name}: ${price / 100} ${values.currency}, approved ${approved}`);
    return "Rate saved. Open quotes keep the price they were given.";
  });
}

export async function discountAction(f: FormData) {
  await act("discounts", async (actor) => {
    const code = s(f, "code").toUpperCase();
    if (!/^[A-Z0-9-]{3,30}$/.test(code)) throw new Error("Codes are 3–30 letters, numbers or dashes.");
    const kind = s(f, "kind") === "amount" ? "amount" : "percent";
    const value = kind === "percent" ? Math.round(Number(s(f, "value").replace(",", ".")) * 100) : minor(s(f, "value"));
    if (!value || value <= 0 || (kind === "percent" && value > 10000)) throw new Error("Enter a positive discount.");
    const id = s(f, "id");
    const values = {
      code,
      kind: kind as "percent" | "amount",
      value,
      currency: kind === "amount" ? s(f, "currency").toUpperCase() || "NOK" : null,
      minSubtotalMinor: minor(s(f, "minSubtotal")) ?? 0,
      startsAt: s(f, "startsAt") ? new Date(s(f, "startsAt")) : null,
      endsAt: s(f, "endsAt") ? new Date(s(f, "endsAt")) : null,
      usageLimit: int(f, "usageLimit"),
      active: on(f, "active"),
    };
    if (id) await db().update(discountCodes).set(values).where(eq(discountCodes.id, id));
    else await db().insert(discountCodes).values(values);
    await audit(db(), actor, "discount.save", "discount_code", code, `Saved code ${code} (${kind} ${value}, active ${values.active})`);
    return `Code ${code} saved.`;
  });
}

import "./guard";
import { createHash } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "./db";
import { shippingQuotes, shippingRates, shippingZones } from "./db/schema";
import { showDevData } from "./catalog";
import type { Address, ShippingMethodSnapshot } from "@/lib/types";

const POSTAL: Record<string, RegExp> = {
  NO: /^\d{4}$/,
  SE: /^\d{3}\s?\d{2}$/,
  DK: /^\d{4}$/,
  FI: /^\d{5}$/,
};

export const addressSchema = z.object({
  name: z.string().trim().min(2, "Enter the recipient's full name").max(80),
  line1: z.string().trim().min(2, "Enter a street address").max(100),
  line2: z.string().trim().max(100).optional().nullable(),
  postalCode: z.string().trim().min(2, "Enter a postal code").max(12),
  city: z.string().trim().min(1, "Enter a city").max(60),
  country: z.string().trim().length(2).toUpperCase(),
  phone: z
    .string()
    .trim()
    .max(24)
    .regex(/^[+\d][\d\s-]{5,22}$/, "Enter a valid phone number")
    .optional()
    .nullable()
    .or(z.literal("")),
});

export function validateAddress(raw: unknown, shipsTo: string[]): { ok: true; address: Address } | { ok: false; errors: Record<string, string> } {
  const parsed = addressSchema.safeParse(raw);
  const errors: Record<string, string> = {};
  if (!parsed.success) {
    for (const i of parsed.error.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
    return { ok: false, errors };
  }
  const a = parsed.data;
  if (!shipsTo.includes(a.country)) errors.country = "We don't ship to this country yet.";
  const re = POSTAL[a.country];
  if (re && !re.test(a.postalCode)) errors.postalCode = "That postal code doesn't look right for this country.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    address: {
      name: a.name,
      line1: a.line1,
      line2: a.line2 || null,
      postalCode: a.postalCode.replace(/\s+/g, " "),
      city: a.city,
      country: a.country,
      phone: a.phone || null,
    },
  };
}

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

/** True when two addresses are the same destination for eligibility and price. */
export function sameDestination(a: Address, b: Address): boolean {
  return norm(a.country) === norm(b.country) && norm(a.postalCode).replace(/\s/g, "") === norm(b.postalCode).replace(/\s/g, "");
}

/** True when two addresses are identical for delivery purposes. */
export function sameAddress(a: Address, b: Address): boolean {
  return (
    sameDestination(a, b) &&
    norm(a.line1) === norm(b.line1) &&
    norm(a.line2) === norm(b.line2) &&
    norm(a.city) === norm(b.city) &&
    norm(a.name) === norm(b.name)
  );
}

export async function ratesFor(exec: Executor, country: string, subtotalMinor: number, currency: string): Promise<ShippingMethodSnapshot[]> {
  const dev = showDevData();
  const rows = await exec
    .select({ rate: shippingRates, zone: shippingZones })
    .from(shippingRates)
    .innerJoin(shippingZones, eq(shippingZones.id, shippingRates.zoneId))
    .where(
      and(
        eq(shippingRates.active, true),
        eq(shippingZones.active, true),
        eq(shippingRates.currency, currency),
        sql`${country} = any(${shippingZones.countries})`,
      ),
    )
    .orderBy(asc(shippingRates.sort), asc(shippingRates.priceMinor));
  return rows
    .filter((r) => r.rate.approved || dev)
    .map(({ rate }) => ({
      rateId: rate.id,
      name: rate.name,
      carrier: rate.carrier,
      service: rate.service,
      priceMinor: rate.freeOverMinor != null && subtotalMinor >= rate.freeOverMinor ? 0 : rate.priceMinor,
      currency: rate.currency,
      minDays: rate.minDays,
      maxDays: rate.maxDays,
    }));
}

export function cartFingerprint(lines: { skuId: string; qty: number; personalizationKey: string }[], discountCode: string | null): string {
  const canon = lines
    .map((l) => `${l.skuId}:${l.qty}:${l.personalizationKey}`)
    .sort()
    .join(";");
  return createHash("sha256").update(`${canon}#${discountCode ?? ""}`).digest("hex").slice(0, 32);
}

export async function createQuote(
  exec: Executor,
  o: { cartId: string; fingerprint: string; address: Address; method: ShippingMethodSnapshot; ttlMinutes: number },
) {
  const [q] = await exec
    .insert(shippingQuotes)
    .values({
      cartId: o.cartId,
      cartFingerprint: o.fingerprint,
      destination: o.address,
      rateId: o.method.rateId,
      rateSnapshot: o.method,
      amountMinor: o.method.priceMinor,
      currency: o.method.currency,
      expiresAt: new Date(Date.now() + o.ttlMinutes * 60_000),
    })
    .returning();
  return q!;
}

export async function loadQuote(exec: Executor, quoteId: string) {
  const [q] = await exec.select().from(shippingQuotes).where(eq(shippingQuotes.id, quoteId));
  return q ?? null;
}

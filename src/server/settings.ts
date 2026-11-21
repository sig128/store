import "./guard";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, type Executor } from "./db";
import { settings } from "./db/schema";

/**
 * Operator settings. Everything a lawyer, accountant or carrier would need to
 * confirm lives here — never hard-coded in the storefront — and production
 * checkout is blocked until the required values are filled in (see readiness.ts).
 */

export const storeSettingsSchema = z.object({
  market: z.string().length(2).default("NO"),
  currency: z.string().length(3).default("NOK"),
  /** Locale used to format prices and dates for this market. */
  locale: z.string().default("en-GB"),
  /** Time zone for reports and dates on receipts. */
  timeZone: z.string().default("Europe/Oslo"),
  /** ISO country codes we ship to. Must be covered by an active shipping zone. */
  shipsTo: z.array(z.string().length(2)).default(["NO"]),
});

export const sellerSchema = z.object({
  legalName: z.string().default(""),
  tradingName: z.string().default(""),
  orgNumber: z.string().default(""),
  vatNumber: z.string().default(""),
  addressLines: z.array(z.string()).default([]),
  country: z.string().default("NO"),
  email: z.string().default(""),
  phone: z.string().default(""),
});

export const taxSchema = z.object({
  /**
   * unconfigured  — not decided yet (production checkout blocked)
   * vat_inclusive — prices include VAT at `rateBps`; VAT is shown as included
   * not_registered — seller is not VAT registered; no VAT is charged or shown
   */
  mode: z.enum(["unconfigured", "vat_inclusive", "not_registered"]).default("unconfigured"),
  label: z.string().default("VAT (MVA)"),
  rateBps: z.number().int().min(0).max(5000).default(2500),
  shippingTaxable: z.boolean().default(true),
  /** Free-text disclosure about duties/import charges, shown at checkout when set. */
  dutiesNote: z.string().default(""),
});

export const checkoutSchema = z.object({
  termsVersion: z.string().default("draft-1"),
  /** Stock is held this long after a payment attempt starts. */
  reservationMinutes: z.number().int().min(31).max(180).default(40),
  /** Provider checkout lifetime. Stripe requires >= 30 minutes. */
  attemptMinutes: z.number().int().min(30).max(120).default(30),
  quoteMinutes: z.number().int().min(5).max(120).default(30),
  stripeEnabled: z.boolean().default(true),
  paypalEnabled: z.boolean().default(true),
});

export const featuresSchema = z.object({
  personalization: z.boolean().default(true),
  dropSignup: z.boolean().default(true),
  productFeed: z.boolean().default(false),
});

export const supportSchema = z.object({
  supportEmail: z.string().default(""),
  orderLinkDays: z.number().int().min(1).max(365).default(30),
  withdrawalDays: z.number().int().min(14).max(100).default(14),
  /** Shown on product pages when set, e.g. "Ships from Oslo within 2 working days". Never invented. */
  dispatchNote: z.string().default(""),
  /** Who pays return shipping and how much — shown on the returns page. */
  returnShippingNote: z.string().default(""),
});

const schemas = {
  store: storeSettingsSchema,
  seller: sellerSchema,
  tax: taxSchema,
  checkout: checkoutSchema,
  features: featuresSchema,
  support: supportSchema,
} as const;

export type SettingsKey = keyof typeof schemas;
export type Settings = { [K in SettingsKey]: z.infer<(typeof schemas)[K]> };

export async function getSettings(exec: Executor = db()): Promise<Settings> {
  const rows = await exec.select().from(settings);
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<string, unknown>;
  for (const [key, schema] of Object.entries(schemas)) {
    const parsed = schema.safeParse(byKey.get(key) ?? {});
    out[key] = parsed.success ? parsed.data : schema.parse({});
  }
  return out as Settings;
}

export async function getSetting<K extends SettingsKey>(key: K, exec: Executor = db()): Promise<Settings[K]> {
  const [row] = await exec.select().from(settings).where(eq(settings.key, key));
  const parsed = schemas[key].safeParse(row?.value ?? {});
  return (parsed.success ? parsed.data : schemas[key].parse({})) as Settings[K];
}

export async function saveSetting<K extends SettingsKey>(
  key: K,
  value: unknown,
  actor: string,
  exec: Executor = db(),
): Promise<Settings[K]> {
  const parsed = schemas[key].parse(value) as Settings[K];
  await exec
    .insert(settings)
    .values({ key, value: parsed, updatedBy: actor, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value: parsed, updatedBy: actor, updatedAt: new Date() } });
  return parsed;
}

export function settingsSchema<K extends SettingsKey>(key: K) {
  return schemas[key];
}

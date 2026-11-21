import "./guard";
import { and, eq } from "drizzle-orm";
import { db, type Executor } from "./db";
import { policyPages, products } from "./db/schema";
import { getSettings, type Settings } from "./settings";

export const POLICY_SLUGS = ["terms", "privacy", "returns", "shipping"] as const;
export type PolicySlug = (typeof POLICY_SLUGS)[number];

export const POLICY_PLACEHOLDERS = [
  "seller.legalName",
  "seller.orgNumber",
  "seller.address",
  "support.email",
  "support.withdrawalDays",
  "support.dispatchNote",
  "store.currency",
  "store.shipsTo",
  "tax.priceNote",
  "tax.dutiesNote",
  "personalization.withdrawalNote",
  "returns.shippingCostNote",
] as const;

const NOT_SET = "[not configured]";

export function countryNames(codes: string[]): string {
  const dn = new Intl.DisplayNames(["en"], { type: "region" });
  return codes.map((c) => dn.of(c) ?? c).join(", ");
}

export function policyValues(s: Settings, o: { personalizedExempt: boolean }): Record<string, string> {
  const or = (v: string) => (v.trim() ? v.trim() : NOT_SET);
  return {
    "seller.legalName": or(s.seller.legalName),
    "seller.orgNumber": or(s.seller.orgNumber),
    "seller.address": s.seller.addressLines.length ? s.seller.addressLines.join(", ") : NOT_SET,
    "support.email": or(s.support.supportEmail),
    "support.withdrawalDays": String(s.support.withdrawalDays),
    "support.dispatchNote": s.support.dispatchNote.trim() || "Dispatch times will be stated here and in your order confirmation once they are confirmed.",
    "store.currency": s.store.currency,
    "store.shipsTo": s.store.shipsTo.length ? countryNames(s.store.shipsTo) : NOT_SET,
    "tax.priceNote":
      s.tax.mode === "vat_inclusive"
        ? `All prices include ${s.tax.label} at ${s.tax.rateBps / 100}%.`
        : s.tax.mode === "not_registered"
          ? "We are not registered for VAT, so no VAT is added to prices."
          : "[tax treatment not configured]",
    "tax.dutiesNote": s.tax.dutiesNote.trim() || "If duties or import charges could apply to your delivery, they will be stated here and at checkout before you pay.",
    "personalization.withdrawalNote": o.personalizedExempt
      ? "Items personalised with a Locker Tag are printed to your specification and are not covered by the right of withdrawal. Faults are always covered. Non-personalised items in the same order keep the normal right of withdrawal."
      : "",
    "returns.shippingCostNote": or(s.support.returnShippingNote),
  };
}

export function fillPlaceholders(body: string, values: Record<string, string>): string {
  return body.replace(/\{([a-zA-Z]+\.[a-zA-Z]+)\}/g, (m, k: string) => (k in values ? values[k]! : m));
}

export async function loadPolicy(slug: string, exec: Executor = db()) {
  const [p] = await exec.select().from(policyPages).where(eq(policyPages.slug, slug));
  if (!p) return null;
  const s = await getSettings(exec);
  const exempt = await exec
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.personalizationEnabled, true), eq(products.personalizationNoWithdrawal, true)))
    .limit(1);
  const values = policyValues(s, { personalizedExempt: exempt.length > 0 && s.features.personalization });
  return { ...p, body: fillPlaceholders(p.body, values) };
}

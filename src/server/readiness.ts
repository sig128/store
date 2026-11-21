import "./guard";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db, type Executor } from "./db";
import {
  artworks,
  inventoryLevels,
  mediaAssets,
  policyPages,
  printTemplates,
  productVariants,
  products,
  shippingRates,
  shippingZones,
  sizeCharts,
  skus,
  user,
  variantPrints,
  workerHeartbeats,
} from "./db/schema";
import { env } from "./env";
import { providerStatus } from "./payments";
import { getSettings, type Settings } from "./settings";

export interface Check {
  id: string;
  area: "business" | "payments" | "catalog" | "operations" | "legal";
  label: string;
  ok: boolean;
  /** Required checks block production checkout. */
  required: boolean;
  detail: string;
  fix: string;
}

export async function readinessChecks(exec: Executor = db(), sIn?: Settings): Promise<Check[]> {
  const s = sIn ?? (await getSettings(exec));
  const e = env();
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  // Business identity
  const seller = s.seller;
  const sellerOk = Boolean(seller.legalName && seller.orgNumber && seller.addressLines.length && seller.email);
  add({ id: "seller", area: "business", label: "Legal seller identity", ok: sellerOk, required: true, detail: sellerOk ? `${seller.legalName} (${seller.orgNumber})` : "Legal name, organisation number, address and contact email are required on receipts and policies.", fix: "/admin/settings#seller" });
  add({ id: "support", area: "business", label: "Customer support email", ok: Boolean(s.support.supportEmail), required: true, detail: s.support.supportEmail || "Not set", fix: "/admin/settings#support" });
  add({ id: "market", area: "business", label: "Market and currency", ok: Boolean(s.store.market && s.store.currency && s.store.shipsTo.length), required: true, detail: `${s.store.market} / ${s.store.currency}; ships to ${s.store.shipsTo.join(", ") || "nowhere"}`, fix: "/admin/settings#store" });

  // Tax
  add({ id: "tax", area: "legal", label: "Tax configuration", ok: s.tax.mode !== "unconfigured", required: true, detail: s.tax.mode === "unconfigured" ? "Choose VAT-inclusive pricing (registered) or not registered. Confirm with your accountant." : s.tax.mode === "vat_inclusive" ? `${s.tax.label} ${s.tax.rateBps / 100}% included in prices` : "Not VAT registered — no VAT charged", fix: "/admin/settings#tax" });

  // Shipping
  const zones = await exec.select().from(shippingZones).where(eq(shippingZones.active, true));
  const rates = await exec.select().from(shippingRates).where(and(eq(shippingRates.active, true), eq(shippingRates.approved, true), eq(shippingRates.currency, s.store.currency)));
  const uncovered = s.store.shipsTo.filter((c) => !zones.some((z) => z.countries.includes(c) && rates.some((r) => r.zoneId === z.id)));
  add({ id: "shipping", area: "operations", label: "Shipping zones and approved rates", ok: uncovered.length === 0 && s.store.shipsTo.length > 0, required: true, detail: uncovered.length ? `No approved rate for: ${uncovered.join(", ")}` : `${rates.length} approved rate(s)`, fix: "/admin/settings#shipping" });

  // Legal pages
  const pages = await exec.select().from(policyPages);
  for (const slug of ["terms", "privacy", "returns", "shipping"]) {
    const p = pages.find((x) => x.slug === slug);
    add({ id: `policy_${slug}`, area: "legal", label: `Policy reviewed: ${slug}`, ok: Boolean(p?.reviewed), required: true, detail: p ? (p.reviewed ? `Reviewed by ${p.reviewedBy ?? "operator"}` : "Draft copy — needs review before launch") : "Missing", fix: `/admin/policies/${slug}` });
  }

  // Payments
  const ps = providerStatus();
  const stripeLive = ps.stripe === "live";
  const paypalLive = ps.paypal === "live";
  add({ id: "payments_live", area: "payments", label: "A live payment provider", ok: stripeLive || paypalLive, required: true, detail: `Stripe: ${ps.stripe}; PayPal: ${ps.paypal}`, fix: "/admin/settings#payments" });
  const stripeActive = s.checkout.stripeEnabled && ps.stripe !== "not_connected";
  add({ id: "stripe_webhook", area: "payments", label: "Stripe webhook secret", ok: !stripeActive || Boolean(e.STRIPE_WEBHOOK_SECRET), required: stripeActive, detail: e.STRIPE_WEBHOOK_SECRET ? "Set" : stripeActive ? "Not set — Stripe webhooks can't be verified" : "Not needed until Stripe is connected", fix: "/admin/settings#payments" });
  const paypalActive = s.checkout.paypalEnabled && ps.paypal !== "not_connected";
  add({ id: "paypal_webhook", area: "payments", label: "PayPal webhook id", ok: !paypalActive || Boolean(e.PAYPAL_WEBHOOK_ID), required: paypalActive, detail: e.PAYPAL_WEBHOOK_ID ? "Set" : paypalActive ? "Not set — PayPal webhooks can't be verified" : "Not needed until PayPal is connected", fix: "/admin/settings#payments" });
  add({ id: "simulator_off", area: "payments", label: "Payment simulator disabled", ok: e.APP_ENV === "production" || e.PAYMENTS_SIMULATOR !== "1", required: false, detail: e.APP_ENV === "production" ? "Always disabled in production" : e.PAYMENTS_SIMULATOR === "1" ? "Enabled (development)" : "Disabled", fix: ".env" });

  // Operations
  add({ id: "email", area: "operations", label: "Transactional email provider", ok: e.EMAIL_PROVIDER !== "log" && Boolean(e.EMAIL_FROM), required: true, detail: e.EMAIL_PROVIDER === "log" ? "Emails are only logged (development)" : `${e.EMAIL_PROVIDER} from ${e.EMAIL_FROM ?? "?"}`, fix: ".env (EMAIL_PROVIDER, EMAIL_FROM)" });
  add({ id: "storage", area: "operations", label: "Durable media storage", ok: e.STORAGE_DRIVER === "s3", required: false, detail: e.STORAGE_DRIVER === "s3" ? "S3-compatible bucket" : "Local disk — fine for one server with a persistent volume, not for serverless", fix: ".env (STORAGE_DRIVER=s3)" });
  const recentRun = await exec.select({ w: workerHeartbeats.worker }).from(workerHeartbeats).where(gt(workerHeartbeats.lastSeenAt, sql`now() - interval '10 minutes'`)).limit(1);
  add({ id: "worker", area: "operations", label: "Background worker or cron running", ok: recentRun.length > 0, required: false, detail: recentRun.length ? `Worker "${recentRun[0]!.w}" checked in within the last 10 minutes` : e.CRON_SECRET ? "CRON_SECRET is set, but no worker or cron tick in 10 minutes — check the scheduler" : "No worker or cron tick in the last 10 minutes", fix: "Run `npm run worker`, or call /api/cron/tick every minute" });
  const owners = await exec.select({ id: user.id }).from(user).where(and(eq(user.role, "owner"), eq(user.disabled, false)));
  add({ id: "owner", area: "operations", label: "An owner account exists", ok: owners.length > 0, required: true, detail: `${owners.length} owner(s)`, fix: "npm run admin:create" });

  // Catalog
  const onSale = await exec.select().from(products).where(and(eq(products.status, "active"), eq(products.saleApproved, true)));
  add({ id: "products_on_sale", area: "catalog", label: "At least one product approved for sale", ok: onSale.length > 0, required: true, detail: `${onSale.length} approved`, fix: "/admin/products" });
  if (onSale.length) {
    const ids = onSale.map((p) => p.id);
    const vars = await exec.select().from(productVariants).where(and(inArray(productVariants.productId, ids), eq(productVariants.status, "active")));
    const vids = vars.map((v) => v.id);
    const skuRows = vids.length ? await exec.select({ sku: skus, level: inventoryLevels }).from(skus).leftJoin(inventoryLevels, eq(inventoryLevels.skuId, skus.id)).where(and(inArray(skus.variantId, vids), eq(skus.status, "active"))) : [];
    for (const p of onSale) {
      const pv = vars.filter((v) => v.productId === p.id);
      const ps2 = skuRows.filter((r) => pv.some((v) => v.id === r.sku.variantId));
      const problems: string[] = [];
      if (!pv.length || !ps2.length) problems.push("no active variants/sizes");
      if (p.fulfillmentMode === "stocked" && ps2.some((r) => !r.level?.verifiedAt)) problems.push("stock not verified by a count");
      if (p.fulfillmentMode === "made_to_order" && !(p.leadTimeApproved && p.leadTimeMinDays != null && p.leadTimeMaxDays != null)) problems.push("made-to-order lead time not approved");
      add({ id: `product_${p.slug}`, area: "catalog", label: `${p.name}: sale data`, ok: problems.length === 0, required: true, detail: problems.length ? problems.join("; ") : "Variants, sizes and stock rules approved", fix: `/admin/products/${p.id}` });
    }
    // Artwork rights for anything on sale
    const used = vids.length
      ? await exec.select({ a: artworks }).from(variantPrints).innerJoin(artworks, eq(artworks.id, variantPrints.artworkId)).where(inArray(variantPrints.variantId, vids))
      : [];
    const badArt = [...new Map(used.map((u) => [u.a.id, u.a])).values()].filter((a) => a.status !== "approved" || !["original_owned", "licensed"].includes(a.rightsStatus));
    add({ id: "artwork_rights", area: "legal", label: "Artwork approved with commercial rights", ok: badArt.length === 0, required: true, detail: badArt.length ? `Not cleared: ${badArt.map((a) => `${a.code} v${a.version}`).join(", ")}` : "All artwork on sale is approved and owned/licensed", fix: "/admin/artwork" });
    // Photos vs concept renders (warning)
    const photos = await exec.select({ id: mediaAssets.id }).from(mediaAssets).where(and(inArray(mediaAssets.productId, ids), eq(mediaAssets.source, "product_photo"), isNull(mediaAssets.archivedAt)));
    add({ id: "photos", area: "catalog", label: "Real product photos uploaded", ok: photos.length > 0, required: false, detail: photos.length ? `${photos.length} photo(s)` : "Only concept renders. They are labelled as renders, but customers deserve real photos.", fix: "/admin/products" });
    const charts = await exec.select().from(sizeCharts).where(and(inArray(sizeCharts.productId, ids), eq(sizeCharts.status, "approved")));
    const noChart = onSale.filter((p) => !charts.some((c) => c.productId === p.id));
    add({ id: "size_charts", area: "catalog", label: "Approved garment measurements", ok: noChart.length === 0, required: false, detail: noChart.length ? `Missing for: ${noChart.map((p) => p.name).join(", ")} (size table hidden)` : "All products on sale", fix: "/admin/products" });
    const pers = onSale.filter((p) => p.personalizationEnabled);
    if (pers.length) {
      const tids = pers.map((p) => p.personalizationTemplateId).filter((x): x is string => Boolean(x));
      const ts = tids.length ? await exec.select().from(printTemplates).where(inArray(printTemplates.id, tids)) : [];
      const notReady = pers.filter((p) => {
        const t = ts.find((x) => x.id === p.personalizationTemplateId);
        return !t || t.status !== "approved" || !t.supplierApproved || p.personalizationProductionDays == null;
      });
      add({ id: "personalization", area: "operations", label: "Locker Tag print template approved", ok: notReady.length === 0, required: false, detail: notReady.length ? `Hidden in production until the supplier approves the template and production time: ${notReady.map((p) => p.name).join(", ")}` : "Approved", fix: "/admin/artwork#templates" });
    }
  }
  return checks;
}

/** Server-side gate used by every checkout call. Only production is gated. */
export async function checkoutGate(exec: Executor = db(), s?: Settings): Promise<{ open: boolean; message: string; failing: Check[] }> {
  if (env().APP_ENV !== "production") return { open: true, message: "", failing: [] };
  const checks = await readinessChecks(exec, s);
  const failing = checks.filter((c) => c.required && !c.ok);
  return failing.length
    ? { open: false, message: "Checkout isn't open yet. Please check back soon.", failing }
    : { open: true, message: "", failing: [] };
}

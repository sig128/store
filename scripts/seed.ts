/**
 * Development seed: Drop 01 catalogue, concept media, Locker Tag template,
 * outfits, Norway shipping (unapproved), draft policies and an owner account.
 * Every commercial value seeded here is development data — see scripts/data/drop01.ts.
 *
 *   npm run db:seed                    (expects an empty, migrated database)
 *   npm run db:reset                   (drops, migrates and seeds — refuses in production)
 *   npm run db:seed -- --catalog-only  (production bootstrap: the Drop 01 products, artwork,
 *                                       template and policy drafts as DRAFTS — no stock, no
 *                                       size tables, no shipping prices, no codes, no users)
 */
import "./_env";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { closeDb, db } from "../src/server/db";
import * as t from "../src/server/db/schema";
import { saveSetting } from "../src/server/settings";
import { storage, mimeFor } from "../src/server/storage";
import { createAdminUser } from "../src/server/auth/users";
import { ARTWORKS, LOCKER_TAG_TEMPLATE, OUTFITS, PRODUCTS, SHIPPING_DEV } from "./data/drop01";
import { POLICY_DRAFTS } from "./data/policies";
import { GARMENTS, CANVAS } from "./art/garments";
import { fontVersion } from "./art/lib/fonts";
import type { MediaKind } from "../src/lib/types";

const SIZE_SORT: Record<string, number> = { XS: 10, S: 20, M: 30, L: 40, XL: 50, XXL: 60 };
const nok = (n: number) => n * 100;

async function upload(localPath: string, key: string) {
  const body = readFileSync(localPath);
  await storage().put(key, body, mimeFor(key));
  const meta = key.endsWith(".svg") ? { width: 0, height: 0 } : await sharp(body).metadata();
  return { key, width: meta.width ?? 0, height: meta.height ?? 0, bytes: body.length, mime: mimeFor(key) };
}

const KIND_ALT: Record<string, string> = {
  front: "front view",
  back: "back view",
  front_unlit: "front view, unlit",
  back_unlit: "back view, unlit",
  print_detail: "close-up of the print",
};

async function main() {
  const catalogOnly = process.argv.includes("--catalog-only");
  if (process.env.APP_ENV === "production" && !catalogOnly) throw new Error("Refusing to seed development data with APP_ENV=production. Use --catalog-only for a draft catalogue.");
  const d = db();
  const existing = await d.select({ id: t.products.id }).from(t.products).limit(1);
  if (existing.length) {
    console.log("Database already has products; skipping seed. Use `npm run db:reset` for a clean dev database.");
    return;
  }

  // ── Settings (operator configuration — deliberately incomplete) ──
  await saveSetting("store", { market: "NO", currency: "NOK", locale: "en-GB", shipsTo: ["NO"] }, "seed");
  await saveSetting("seller", {}, "seed");
  await saveSetting("tax", { mode: "unconfigured", label: "VAT (MVA)", rateBps: 2500, shippingTaxable: true, dutiesNote: "" }, "seed");
  await saveSetting("checkout", { termsVersion: "draft-1" }, "seed");
  await saveSetting("features", { personalization: true, dropSignup: true, productFeed: false }, "seed");
  await saveSetting("support", { supportEmail: "", orderLinkDays: 30, withdrawalDays: 14, dispatchNote: "" }, "seed");

  for (const p of POLICY_DRAFTS) {
    await d.insert(t.policyPages).values({ slug: p.slug, title: p.title, body: p.body, reviewed: false, updatedBy: "seed" });
  }

  const [collection] = await d.insert(t.collections).values({ slug: "drop-01", title: "Drop 01 — Last Set", description: "Six pieces for the last set of the night.", status: "active", sort: 1 }).returning();

  // ── Artwork + print files ──
  const artworkIds = new Map<string, string>();
  for (const a of ARTWORKS) {
    const file = await upload(`assets/print-files/${a.code}.v1.svg`, `print-files/${a.code}/v1.svg`);
    const [row] = await d
      .insert(t.artworks)
      .values({
        code: a.code,
        version: 1,
        family: a.family,
        title: a.title,
        status: "draft",
        rightsStatus: "original_owned",
        rightsNote: "Drawn for this project in scripts/art. Open-licensed fonts outlined. Needs designer review and colour separation before production.",
        creditedTo: "After Hours Athletics (in-house concept)",
        printFileKey: file.key,
        inkColors: [],
      })
      .returning();
    artworkIds.set(a.code, row!.id);
  }

  // ── Locker Tag template (draft until the supplier approves the print area) ──
  const [template] = await d
    .insert(t.printTemplates)
    .values({
      code: LOCKER_TAG_TEMPLATE.code,
      version: LOCKER_TAG_TEMPLATE.version,
      name: LOCKER_TAG_TEMPLATE.name,
      placement: LOCKER_TAG_TEMPLATE.placement,
      status: "draft",
      supplierApproved: false,
      areaMm: LOCKER_TAG_TEMPLATE.areaMm,
      fields: LOCKER_TAG_TEMPLATE.fields.map((f) => ({ ...f })),
      fonts: [{ id: "big-shoulders-stencil-800", name: "Big Shoulders Stencil Display ExtraBold", version: fontVersion("stencil800"), license: "SIL OFL 1.1" }],
      colors: LOCKER_TAG_TEMPLATE.colors.map((c) => ({ ...c })),
      notes: "Print area in mm is a proposal. The supplier must confirm placement, maximum size, ink and production time.",
    })
    .returning();
  const lt = GARMENTS.singlet.back.areas.locker_tag!;
  const ltArea = { x: lt.x / CANVAS.w, y: lt.y / CANVAS.h, w: lt.w / CANVAS.w, h: lt.h / CANVAS.h };

  // ── Products ──
  const variantIds = new Map<string, { productId: string; variantId: string }>();
  let sort = 0;
  for (const p of PRODUCTS) {
    sort += 10;
    const [prod] = await d
      .insert(t.products)
      .values({
        slug: p.slug,
        name: p.name,
        category: p.category,
        categoryLabel: p.categoryLabel,
        summary: p.summary,
        description: p.description,
        status: catalogOnly ? "draft" : "active",
        fulfillmentMode: p.fulfillmentMode,
        saleApproved: false,
        sort,
        heroView: p.heroView,
        seoTitle: `${p.name} — ${p.categoryLabel}`,
        seoDescription: p.summary,
        personalizationTemplateId: p.personalization ? template!.id : null,
        personalizationPriceMinor: p.personalization ? nok(p.personalization.priceNok) : null,
        personalizationProductionDays: null,
        personalizationEnabled: Boolean(p.personalization),
        personalizationNoWithdrawal: false,
      })
      .returning();
    await d.insert(t.productCollections).values({ productId: prod!.id, collectionId: collection!.id, sort });
    await d.insert(t.productSpecs).values({ productId: prod!.id, key: "fit", label: "Fit", value: p.fitNote, status: "draft", source: "Design intent — confirm against approved measurements" });
    const rows = Object.entries(p.sizeChart.rows).map(([size, values]) => ({ size, values }));
    if (!catalogOnly) await d.insert(t.sizeCharts).values({
      productId: prod!.id,
      basis: "garment",
      status: "sample",
      columns: p.sizeChart.columns,
      rows,
      toleranceMm: 15,
      note: "SAMPLE measurements for development. Replace with measured production samples before launch.",
    });

    let vsort = 0;
    for (const v of p.variants) {
      vsort += 10;
      const [variant] = await d
        .insert(t.productVariants)
        .values({
          productId: prod!.id,
          code: v.code,
          colorName: v.colorName,
          colorHex: v.colorHex,
          optionLabel: v.optionLabel ?? null,
          sort: vsort,
          personalizationArea: v.personalization ? { ...ltArea, colorIds: v.personalization.colorIds } : null,
        })
        .returning();
      variantIds.set(v.code, { productId: prod!.id, variantId: variant!.id });
      for (const pr of v.prints) {
        await d.insert(t.variantPrints).values({ variantId: variant!.id, artworkId: artworkIds.get(pr.artwork)!, placement: pr.placement, method: pr.method, methodApproved: false });
      }
      for (const size of p.sizes) {
        const [sku] = await d
          .insert(t.skus)
          .values({ variantId: variant!.id, code: `${v.code}-${size}`, size, sizeSort: SIZE_SORT[size] ?? 99, priceMinor: nok(v.priceNok), currency: "NOK" })
          .returning();
        if (p.fulfillmentMode === "stocked") {
          const qty = catalogOnly ? 0 : (v.stock[size] ?? 0);
          await d.insert(t.inventoryLevels).values({ skuId: sku!.id, onHand: qty, verifiedAt: null });
          if (qty > 0) await d.insert(t.inventoryMovements).values({ skuId: sku!.id, delta: qty, reason: "seed", actor: "seed", note: "Development stock — not counted" });
        }
      }
      // concept media
      const kinds = ["front", "back", `${p.heroView}_unlit`, "print_detail"];
      let msort = 0;
      for (const kind of kinds) {
        const local = `assets/concept/${v.code}/${kind}.webp`;
        try {
          readFileSync(local);
        } catch {
          continue;
        }
        const f = await upload(local, `products/${p.slug}/${v.code}/${kind}.webp`);
        msort += 10;
        await d.insert(t.mediaAssets).values({
          storageKey: f.key,
          mime: f.mime,
          width: f.width,
          height: f.height,
          bytes: f.bytes,
          alt: `${p.name} ${p.categoryLabel.toLowerCase()} in ${v.colorName}${v.optionLabel ? ` (${v.optionLabel})` : ""}, ${KIND_ALT[kind] ?? kind} — concept render`,
          kind: kind as MediaKind,
          source: "concept_render",
          rightsNote: "Generated concept render (scripts/art). Not a photo of produced stock.",
          productId: prod!.id,
          variantId: variant!.id,
          sort: msort,
        });
      }
    }
  }

  // ── Outfits (Build the fit) ──
  const hotspots = JSON.parse(readFileSync("assets/concept/outfits/hotspots.json", "utf8")) as Record<string, { product: string; variant: string; x: number; y: number }[]>;
  let osort = 0;
  for (const o of OUTFITS) {
    osort += 10;
    const f = await upload(`assets/concept/outfits/${o.slug}.webp`, `outfits/${o.slug}.webp`);
    const [media] = await d
      .insert(t.mediaAssets)
      .values({ storageKey: f.key, mime: f.mime, width: f.width, height: f.height, bytes: f.bytes, alt: `${o.title}: styled flat-lay of ${o.items.map((i) => i.label).join(", ")} on a concrete floor — concept render`, kind: "lookbook", source: "concept_render", rightsNote: "Composed from concept renders." })
      .returning();
    const [outfit] = await d
      .insert(t.outfits)
      .values({ slug: o.slug, title: o.title, subtitle: o.subtitle, mediaId: media!.id, status: catalogOnly ? "draft" : "active", sort: osort, bundleDiscountBps: 1000, bundleMinItems: 3, bundleApproved: false })
      .returning();
    const spots = hotspots[o.slug] ?? [];
    let isort = 0;
    for (const it of o.items) {
      isort += 10;
      const ids = variantIds.get(it.variant)!;
      const spot = spots.find((s) => s.variant === it.variant) ?? { x: 5000, y: 5000 };
      await d.insert(t.outfitItems).values({ outfitId: outfit!.id, productId: ids.productId, variantId: ids.variantId, hotspotX: spot.x, hotspotY: spot.y, label: it.label, sort: isort });
    }
  }

  // ── Shipping (development prices; not approved) ──
  const [zone] = await d.insert(t.shippingZones).values({ name: SHIPPING_DEV.zone.name, countries: SHIPPING_DEV.zone.countries, active: true }).returning();
  let rsort = 0;
  for (const r of catalogOnly ? [] : SHIPPING_DEV.rates) {
    rsort += 10;
    await d.insert(t.shippingRates).values({ zoneId: zone!.id, name: r.name, carrier: r.carrier, service: r.service, priceMinor: nok(r.priceNok), currency: "NOK", approved: false, active: true, sort: rsort });
  }

  if (!catalogOnly) await d.insert(t.discountCodes).values({ code: "DEVTEST10", kind: "percent", value: 1000, minSubtotalMinor: 0, active: true });

  if (catalogOnly) {
    console.log("Draft catalogue created (products hidden, stock 0, nothing approved). Create the first owner with `npm run admin:create -- --email you@example.com`.");
    return;
  }

  // ── Owner account ──
  const email = process.env.SEED_ADMIN_EMAIL ?? "owner@afterhours.test";
  const password = process.env.SEED_ADMIN_PASSWORD ?? `dev-${randomBytes(9).toString("base64url")}`;
  const [u] = await d.select().from(t.user).where(eq(t.user.email, email));
  if (!u) {
    await createAdminUser(d, { email, name: "Store owner", role: "owner", password });
    const shown = process.env.SEED_ADMIN_PASSWORD ? "(from SEED_ADMIN_PASSWORD)" : password;
    console.log(`\nAdmin owner created:\n  email:    ${email}\n  password: ${shown}\n  (development only — change it, or set SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD)\n`);
  }
  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

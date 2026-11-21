"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import { db } from "@/server/db";
import {
  collections,
  inventoryLevels,
  mediaAssets,
  outfitItems,
  outfits,
  productCollections,
  productSpecs,
  productVariants,
  products,
  sizeCharts,
  skus,
  variantPrints,
} from "@/server/db/schema";
import { assertAdmin } from "@/server/auth/session";
import { audit, type Actor } from "@/server/audit";
import { moveStock, recordCount } from "@/server/inventory";
import { storage } from "@/server/storage";
import type { Permission } from "@/server/auth/rbac";
import type { MediaKind, MediaSource, ProductCategory } from "@/lib/types";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const n = (f: FormData, k: string) => (s(f, k) === "" ? null : Number(s(f, k)));
const minor = (v: string) => {
  const m = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(v.trim());
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : null;
};

async function act(permission: Permission, productId: string | null, fn: (actor: Actor) => Promise<string | { redirectTo: string; msg: string }>) {
  const a = await assertAdmin(permission);
  let out: string | { redirectTo: string; msg: string };
  const base = productId ? `/admin/products/${productId}` : "/admin/products";
  try {
    out = await fn(a.actor);
  } catch (err) {
    redirect(`${base}?err=${encodeURIComponent((err as Error).message)}`);
  }
  revalidatePath(base);
  revalidatePath("/", "layout");
  if (typeof out! === "string") redirect(`${base}?msg=${encodeURIComponent(out)}`);
  redirect(`${out!.redirectTo}?msg=${encodeURIComponent(out!.msg)}`);
}

export async function createProductAction(f: FormData) {
  await act("products:write", null, async (actor) => {
    const name = s(f, "name").toUpperCase();
    const slug = s(f, "slug") || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (!name || !/^[a-z0-9-]{3,80}$/.test(slug)) throw new Error("Enter a name and a URL slug (lowercase letters, numbers, dashes).");
    const [p] = await db()
      .insert(products)
      .values({ name, slug, category: (s(f, "category") || "tee") as ProductCategory, categoryLabel: s(f, "categoryLabel") || "Garment", status: "draft" })
      .returning();
    await audit(db(), actor, "product.create", "product", p!.id, `Created product ${name}`);
    return { redirectTo: `/admin/products/${p!.id}`, msg: "Product created as draft." };
  });
}

export async function updateProductAction(f: FormData) {
  const id = s(f, "id");
  await act("products:write", id, async (actor) => {
    const status = s(f, "status") as "draft" | "active" | "archived";
    const lmin = n(f, "leadTimeMinDays");
    const lmax = n(f, "leadTimeMaxDays");
    if (lmin != null && lmax != null && lmin > lmax) throw new Error("Lead time minimum is above the maximum.");
    await db()
      .update(products)
      .set({
        name: s(f, "name").toUpperCase(),
        slug: s(f, "slug"),
        category: s(f, "category") as ProductCategory,
        categoryLabel: s(f, "categoryLabel"),
        summary: s(f, "summary") || null,
        description: s(f, "description") || null,
        status,
        archivedAt: status === "archived" ? new Date() : null,
        fulfillmentMode: s(f, "fulfillmentMode") === "made_to_order" ? "made_to_order" : "stocked",
        leadTimeMinDays: lmin,
        leadTimeMaxDays: lmax,
        leadTimeApproved: f.get("leadTimeApproved") === "on" && lmin != null && lmax != null,
        heroView: s(f, "heroView") === "front" ? "front" : "back",
        sort: Number(s(f, "sort") || 0),
        seoTitle: s(f, "seoTitle") || null,
        seoDescription: s(f, "seoDescription") || null,
        weightGrams: n(f, "weightGrams"),
        updatedAt: new Date(),
      })
      .where(eq(products.id, id));
    const colls = f.getAll("collection").map(String);
    await db().delete(productCollections).where(eq(productCollections.productId, id));
    for (const c of colls) await db().insert(productCollections).values({ productId: id, collectionId: c });
    await audit(db(), actor, "product.update", "product", id, `Updated product details (status ${status})`);
    return status === "archived" ? "Archived. Existing orders keep their own snapshot and are unaffected." : "Saved.";
  });
}

export async function approveSaleAction(f: FormData) {
  const id = s(f, "id");
  await act("products:write", id, async (actor) => {
    const approve = f.get("approve") === "on";
    if (approve && f.get("confirm") !== "on") throw new Error("Tick the confirmation to approve this product for real sale.");
    await db()
      .update(products)
      .set({ saleApproved: approve, saleApprovedAt: approve ? new Date() : null, saleApprovedBy: approve ? actor.email : null, updatedAt: new Date() })
      .where(eq(products.id, id));
    await audit(db(), actor, approve ? "product.approve_sale" : "product.withdraw_sale", "product", id, approve ? "Approved for real sale" : "Withdrawn from sale");
    return approve ? "Approved for sale." : "Withdrawn from sale.";
  });
}

export async function upsertVariantAction(f: FormData) {
  const productId = s(f, "productId");
  await act("products:write", productId, async (actor) => {
    const values = {
      code: s(f, "code").toUpperCase(),
      colorName: s(f, "colorName"),
      colorHex: s(f, "colorHex"),
      optionLabel: s(f, "optionLabel") || null,
      status: (s(f, "status") || "active") as "active" | "archived",
      sort: Number(s(f, "sort") || 0),
    };
    if (!/^[A-Z0-9-]{2,30}$/.test(values.code) || !values.colorName || !/^#[0-9a-fA-F]{6}$/.test(values.colorHex)) throw new Error("Variant needs a code (A–Z, 0–9, -), a colour name and a #RRGGBB swatch.");
    const id = s(f, "variantId");
    if (id) await db().update(productVariants).set({ ...values, updatedAt: new Date() }).where(and(eq(productVariants.id, id), eq(productVariants.productId, productId)));
    else await db().insert(productVariants).values({ ...values, productId });
    await audit(db(), actor, id ? "variant.update" : "variant.create", "product", productId, `${id ? "Updated" : "Added"} variant ${values.code}`);
    return "Variant saved.";
  });
}

export async function upsertSkuAction(f: FormData) {
  const productId = s(f, "productId");
  await act("products:write", productId, async (actor) => {
    const price = minor(s(f, "price"));
    if (price == null) throw new Error("Enter a price like 549 or 549.00.");
    const skuId = s(f, "skuId");
    if (skuId) {
      await db().update(skus).set({ priceMinor: price, status: (s(f, "status") || "active") as "active" | "archived", updatedAt: new Date() }).where(eq(skus.id, skuId));
      await audit(db(), actor, "sku.update", "product", productId, `SKU ${s(f, "code")} price ${price / 100}`);
      return "Size updated.";
    }
    const variantId = s(f, "variantId");
    const [v] = await db().select().from(productVariants).where(eq(productVariants.id, variantId));
    if (!v) throw new Error("Variant not found.");
    const size = s(f, "size").toUpperCase();
    const order: Record<string, number> = { XXS: 5, XS: 10, S: 20, M: 30, L: 40, XL: 50, XXL: 60, "3XL": 70 };
    const [sku] = await db()
      .insert(skus)
      .values({ variantId, size, sizeSort: order[size] ?? 99, code: `${v.code}-${size}`, priceMinor: price, currency: s(f, "currency") || "NOK" })
      .returning();
    await db().insert(inventoryLevels).values({ skuId: sku!.id, onHand: 0 }).onConflictDoNothing();
    await audit(db(), actor, "sku.create", "product", productId, `Added size ${size} (${sku!.code})`);
    return "Size added (stock 0 — record a count).";
  });
}

export async function stockAction(f: FormData) {
  const productId = s(f, "productId");
  await act("inventory:write", productId, async (actor) => {
    const skuId = s(f, "skuId");
    const mode = s(f, "mode");
    const qty = Number(s(f, "qty"));
    if (!Number.isInteger(qty)) throw new Error("Enter a whole number.");
    const note = s(f, "note") || null;
    const result = await db().transaction(async (tx) => {
      if (mode === "count") {
        if (qty < 0) throw new Error("A count can't be negative.");
        return recordCount(tx, skuId, qty, actor.email, note ?? undefined);
      }
      const reason = (s(f, "reason") || "adjustment") as "receive" | "adjustment" | "damage";
      return moveStock(tx, { skuId, delta: qty, reason, actor: actor.email, note });
    });
    await audit(db(), actor, mode === "count" ? "stock.count" : "stock.adjust", "sku", skuId, `${mode === "count" ? "Counted" : "Adjusted"} stock: ${qty} → on hand ${result}`, { productId });
    return `Stock updated. On hand: ${result}.`;
  });
}

const ALLOWED = ["image/webp", "image/png", "image/jpeg", "image/avif"];

export async function uploadMediaAction(f: FormData) {
  const productId = s(f, "productId");
  await act("products:write", productId, async (actor) => {
    const file = f.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image file.");
    if (!ALLOWED.includes(file.type)) throw new Error("Upload a WebP, PNG, JPEG or AVIF image.");
    if (file.size > 20 * 1024 * 1024) throw new Error("Images must be under 20 MB.");
    const input = Buffer.from(await file.arrayBuffer());
    const img = sharp(input, { limitInputPixels: 80_000_000 }).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true });
    const out = await img.webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
    const key = `uploads/products/${productId}/${randomUUID()}.webp`;
    await storage().put(key, out.data, "image/webp");
    const alt = s(f, "alt");
    if (alt.length < 8) throw new Error("Describe the image in the alt text (at least a few words).");
    await db().insert(mediaAssets).values({
      storageKey: key,
      mime: "image/webp",
      width: out.info.width,
      height: out.info.height,
      bytes: out.data.length,
      alt,
      kind: (s(f, "kind") || "front") as MediaKind,
      source: (s(f, "source") || "product_photo") as MediaSource,
      rightsNote: s(f, "rightsNote") || null,
      productId,
      variantId: s(f, "variantId") || null,
      sort: Number(s(f, "sort") || 0),
    });
    await audit(db(), actor, "media.upload", "product", productId, `Uploaded ${s(f, "source")} image (${s(f, "kind")})`);
    return "Image uploaded.";
  });
}

export async function archiveMediaAction(f: FormData) {
  const productId = s(f, "productId");
  await act("products:write", productId, async (actor) => {
    await db().update(mediaAssets).set({ archivedAt: new Date() }).where(and(eq(mediaAssets.id, s(f, "mediaId")), eq(mediaAssets.productId, productId)));
    await audit(db(), actor, "media.archive", "product", productId, "Archived an image");
    return "Image hidden from the store.";
  });
}

export async function upsertPrintAction(f: FormData) {
  const productId = s(f, "productId");
  await act("artwork:write", productId, async (actor) => {
    const id = s(f, "printId");
    const values = { artworkId: s(f, "artworkId"), placement: s(f, "placement"), method: s(f, "method") || null, methodApproved: f.get("methodApproved") === "on" };
    if (!values.artworkId || !values.placement) throw new Error("Choose artwork and a placement.");
    if (id) await db().update(variantPrints).set(values).where(eq(variantPrints.id, id));
    else await db().insert(variantPrints).values({ ...values, variantId: s(f, "variantId") });
    await audit(db(), actor, "print.upsert", "product", productId, `Print ${values.placement} set (method approved: ${values.methodApproved})`);
    return "Print saved.";
  });
}

export async function specAction(f: FormData) {
  const productId = s(f, "productId");
  await act("products:write", productId, async (actor) => {
    const id = s(f, "specId");
    if (f.get("delete") === "1" && id) {
      await db().delete(productSpecs).where(and(eq(productSpecs.id, id), eq(productSpecs.productId, productId)));
      return "Spec removed.";
    }
    const values = { key: s(f, "key"), label: s(f, "label"), value: s(f, "value"), status: (s(f, "status") || "draft") as "draft" | "approved", source: s(f, "source") || null };
    if (!values.key || !values.label || !values.value) throw new Error("Spec needs a key, label and value.");
    if (values.status === "approved" && !values.source) throw new Error("Approved specs need a source (e.g. supplier spec sheet ref).");
    if (id) await db().update(productSpecs).set({ ...values, updatedAt: new Date() }).where(eq(productSpecs.id, id));
    else await db().insert(productSpecs).values({ ...values, productId });
    await audit(db(), actor, "spec.upsert", "product", productId, `Spec ${values.key} (${values.status})`);
    return "Spec saved.";
  });
}

/** Size table editor: CSV in centimetres ("size,chest,length"), stored as millimetres. */
export async function sizeChartAction(f: FormData) {
  const productId = s(f, "productId");
  await act("products:write", productId, async (actor) => {
    const lines = s(f, "table").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error("Add a header row and at least one size row.");
    const header = lines[0]!.split(",").map((x) => x.trim());
    if (header[0]!.toLowerCase() !== "size") throw new Error('The first column must be "size".');
    const keys = header.slice(1);
    const labels = s(f, "labels").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const columns = keys.map((k) => {
      const lab = labels.find((l) => l.toLowerCase().startsWith(`${k.toLowerCase()}:`));
      const [, label = k, how = ""] = lab ? /^[^:]+:\s*([^|]+)\|?\s*(.*)$/.exec(lab) ?? [] : [];
      return { key: k, label: label.trim(), howToMeasure: how.trim() || "Measured flat." };
    });
    const rows = lines.slice(1).map((l) => {
      const cells = l.split(",").map((x) => x.trim());
      const values: Record<string, number> = {};
      keys.forEach((k, i) => {
        const v = Number((cells[i + 1] ?? "").replace(",", "."));
        if (!Number.isFinite(v) || v <= 0) throw new Error(`Row "${l}": ${k} must be a positive number in cm.`);
        values[k] = Math.round(v * 10);
      });
      return { size: cells[0]!.toUpperCase(), values };
    });
    const status = (s(f, "status") || "draft") as "draft" | "approved" | "sample";
    const basis = s(f, "basis") === "body" ? "body" : "garment";
    const id = s(f, "chartId");
    const values = { columns, rows, status, basis: basis as "garment" | "body", toleranceMm: n(f, "toleranceCm") != null ? Math.round(Number(s(f, "toleranceCm")) * 10) : null, note: s(f, "note") || null };
    if (id) await db().update(sizeCharts).set({ ...values, updatedAt: new Date() }).where(eq(sizeCharts.id, id));
    else await db().insert(sizeCharts).values({ ...values, productId });
    await audit(db(), actor, "sizechart.save", "product", productId, `Size table saved (${status}, ${basis})`);
    return "Size table saved.";
  });
}

export async function personalizationAction(f: FormData) {
  const productId = s(f, "productId");
  await act("products:write", productId, async (actor) => {
    const price = s(f, "price") ? minor(s(f, "price")) : null;
    await db()
      .update(products)
      .set({
        personalizationEnabled: f.get("enabled") === "on",
        personalizationTemplateId: s(f, "templateId") || null,
        personalizationPriceMinor: price,
        personalizationProductionDays: n(f, "productionDays"),
        personalizationNoWithdrawal: f.get("noWithdrawal") === "on",
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId));
    await audit(db(), actor, "personalization.update", "product", productId, `Locker Tag settings saved (enabled ${f.get("enabled") === "on"})`);
    return "Personalisation settings saved.";
  });
}

export async function createCollectionAction(f: FormData) {
  await act("products:write", null, async (actor) => {
    const parsed = z.object({ slug: z.string().regex(/^[a-z0-9-]{2,60}$/), title: z.string().min(2) }).safeParse({ slug: s(f, "slug"), title: s(f, "title") });
    if (!parsed.success) throw new Error("Collection needs a slug and a title.");
    await db().insert(collections).values({ ...parsed.data, status: "active" });
    await audit(db(), actor, "collection.create", "collection", parsed.data.slug, `Created collection ${parsed.data.title}`);
    return "Collection created.";
  });
}

export async function outfitAction(f: FormData) {
  await act("products:write", null, async (actor) => {
    const id = s(f, "outfitId");
    const pct = s(f, "bundlePct");
    const bps = pct === "" ? null : Math.round(Number(pct.replace(",", ".")) * 100);
    if (bps != null && (!Number.isFinite(bps) || bps < 0 || bps > 5000)) throw new Error("Bundle saving must be between 0 and 50 %.");
    const approved = f.get("bundleApproved") === "on";
    if (approved && f.get("confirm") !== "on") throw new Error("Tick the confirmation to approve the bundle saving for real orders.");
    await db()
      .update(outfits)
      .set({
        title: s(f, "title"),
        subtitle: s(f, "subtitle") || null,
        status: s(f, "status") as "draft" | "active" | "archived",
        bundleDiscountBps: bps,
        bundleMinItems: Math.max(2, Number(s(f, "bundleMinItems") || 3)),
        bundleApproved: approved && bps != null,
        updatedAt: new Date(),
      })
      .where(eq(outfits.id, id));
    for (const item of await db().select().from(outfitItems).where(eq(outfitItems.outfitId, id))) {
      const x = Number(s(f, `x_${item.id}`));
      const y = Number(s(f, `y_${item.id}`));
      if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100) {
        await db().update(outfitItems).set({ hotspotX: Math.round(x * 100), hotspotY: Math.round(y * 100), label: s(f, `label_${item.id}`) || item.label }).where(eq(outfitItems.id, item.id));
      }
    }
    await audit(db(), actor, "outfit.update", "outfit", id, `Outfit saved: bundle ${bps ?? "none"} bps, approved ${approved}`);
    return "Outfit saved.";
  });
}

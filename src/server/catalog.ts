import "./guard";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, type Executor } from "./db";
import {
  artworks,
  inventoryLevels,
  mediaAssets,
  outfitItems,
  outfits,
  printTemplates,
  productSpecs,
  productVariants,
  products,
  sizeCharts,
  skus,
  variantPrints,
  type SizeChartColumn,
  type SizeChartRow,
  type TemplateColor,
  type TemplateField,
  type TemplateFont,
  type VariantPersonalizationArea,
} from "./db/schema";
import { mediaUrl } from "./storage";
import { getSetting } from "./settings";
import { env } from "./env";
import type { FulfillmentMode, MediaKind, MediaSource, ProductCategory, SpecStatus } from "@/lib/types";

/** Outside production, draft/sample data is shown (clearly labelled) so the store can be built and tested. */
export const showDevData = () => env().APP_ENV !== "production";

export type SkuState = "in_stock" | "sold_out" | "made_to_order" | "unavailable";

export interface SkuView {
  id: string;
  code: string;
  size: string;
  sizeSort: number;
  priceMinor: number;
  currency: string;
  /** null for made-to-order SKUs (no shelf stock) */
  available: number | null;
  state: SkuState;
}
export interface MediaView {
  id: string;
  url: string;
  width: number;
  height: number;
  alt: string;
  kind: MediaKind;
  source: MediaSource;
}
export interface PrintView {
  code: string;
  version: number;
  title: string;
  placement: string;
  method: string | null;
}
export interface VariantView {
  id: string;
  code: string;
  colorName: string;
  colorHex: string;
  optionLabel: string | null;
  label: string;
  skus: SkuView[];
  media: MediaView[];
  prints: PrintView[];
  personalizationArea: VariantPersonalizationArea | null;
  anyAvailable: boolean;
}
export interface PersonalizationView {
  templateId: string;
  templateCode: string;
  templateVersion: number;
  placement: string;
  fields: TemplateField[];
  fonts: TemplateFont[];
  colors: TemplateColor[];
  priceMinor: number;
  productionDays: number | null;
  noWithdrawal: boolean;
  approved: boolean;
}
export interface ProductView {
  id: string;
  slug: string;
  name: string;
  category: ProductCategory;
  categoryLabel: string;
  summary: string | null;
  description: string | null;
  heroView: "front" | "back";
  fulfillmentMode: FulfillmentMode;
  leadTime: { minDays: number; maxDays: number; approved: boolean } | null;
  /** Can a customer buy it right now (product state, not stock)? */
  purchasable: boolean;
  notPurchasableReason: string | null;
  saleApproved: boolean;
  currency: string;
  fromPriceMinor: number;
  variants: VariantView[];
  sizes: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  sort: number;
  /** Locker Tag can be added on the product page. */
  personalizable: boolean;
}
export interface ProductDetailView extends ProductView {
  specs: { key: string; label: string; value: string; status: SpecStatus; variantId: string | null }[];
  sizeChart: {
    basis: "garment" | "body";
    status: SpecStatus;
    columns: SizeChartColumn[];
    rows: SizeChartRow[];
    toleranceMm: number | null;
    note: string | null;
    variantId: string | null;
  }[];
  personalization: PersonalizationView | null;
  fitNote: string | null;
}

export async function skuAvailability(exec: Executor, skuIds: string[]): Promise<Map<string, number>> {
  if (skuIds.length === 0) return new Map();
  const rows = await exec
    .select({
      skuId: skus.id,
      onHand: sql<number>`coalesce(${inventoryLevels.onHand}, 0)`,
      reserved: sql<number>`coalesce((select sum(r.qty) from stock_reservations r where r.sku_id = ${skus.id} and r.status = 'active' and r.expires_at > now()), 0)`,
    })
    .from(skus)
    .leftJoin(inventoryLevels, eq(inventoryLevels.skuId, skus.id))
    .where(inArray(skus.id, skuIds));
  return new Map(rows.map((r) => [r.skuId, Math.max(0, Number(r.onHand) - Number(r.reserved))]));
}

function variantLabel(colorName: string, optionLabel: string | null) {
  return optionLabel ? `${colorName} / ${optionLabel}` : colorName;
}

async function loadProducts(where: { slug?: string; ids?: string[]; includeDraft?: boolean }, exec: Executor): Promise<ProductView[]> {
  const conds = [];
  if (where.slug) conds.push(eq(products.slug, where.slug));
  if (where.ids) conds.push(inArray(products.id, where.ids));
  if (!where.includeDraft) conds.push(eq(products.status, "active"));
  const prows = await exec
    .select()
    .from(products)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(products.sort), asc(products.name));
  if (prows.length === 0) return [];
  const pids = prows.map((p) => p.id);
  const vrows = await exec
    .select()
    .from(productVariants)
    .where(and(inArray(productVariants.productId, pids), eq(productVariants.status, "active")))
    .orderBy(asc(productVariants.sort));
  const vids = vrows.map((v) => v.id);
  const [srows, mrows, prints] = await Promise.all([
    vids.length
      ? exec.select().from(skus).where(and(inArray(skus.variantId, vids), eq(skus.status, "active"))).orderBy(asc(skus.sizeSort))
      : Promise.resolve([]),
    exec
      .select()
      .from(mediaAssets)
      .where(and(inArray(mediaAssets.productId, pids), isNull(mediaAssets.archivedAt)))
      .orderBy(asc(mediaAssets.sort)),
    vids.length
      ? exec
          .select({
            variantId: variantPrints.variantId,
            placement: variantPrints.placement,
            method: variantPrints.method,
            methodApproved: variantPrints.methodApproved,
            code: artworks.code,
            version: artworks.version,
            title: artworks.title,
          })
          .from(variantPrints)
          .innerJoin(artworks, eq(artworks.id, variantPrints.artworkId))
          .where(inArray(variantPrints.variantId, vids))
      : Promise.resolve([]),
  ]);
  const avail = await skuAvailability(
    exec,
    srows.map((s) => s.id),
  );
  const dev = showDevData();
  const tids = prows.map((p) => p.personalizationTemplateId).filter((x): x is string => Boolean(x));
  const [features, tmpl] = await Promise.all([
    getSetting("features", exec),
    tids.length ? exec.select().from(printTemplates).where(inArray(printTemplates.id, tids)) : Promise.resolve([]),
  ]);

  return prows.map((p) => {
    const mto = p.fulfillmentMode === "made_to_order";
    const variants: VariantView[] = vrows
      .filter((v) => v.productId === p.id)
      .map((v) => {
        const vSkus: SkuView[] = srows
          .filter((s) => s.variantId === v.id)
          .map((s) => {
            const available = mto ? null : (avail.get(s.id) ?? 0);
            const state: SkuState = mto ? "made_to_order" : (available ?? 0) > 0 ? "in_stock" : "sold_out";
            return { id: s.id, code: s.code, size: s.size, sizeSort: s.sizeSort, priceMinor: s.priceMinor, currency: s.currency, available, state };
          });
        const media: MediaView[] = mrows
          .filter((m) => m.variantId === v.id || (m.variantId === null && m.productId === p.id))
          .map((m) => ({ id: m.id, url: mediaUrl(m.storageKey), width: m.width, height: m.height, alt: m.alt, kind: m.kind, source: m.source }));
        return {
          id: v.id,
          code: v.code,
          colorName: v.colorName,
          colorHex: v.colorHex,
          optionLabel: v.optionLabel,
          label: variantLabel(v.colorName, v.optionLabel),
          skus: vSkus,
          media,
          prints: prints
            .filter((pr) => pr.variantId === v.id)
            .map((pr) => ({
              code: pr.code,
              version: pr.version,
              title: pr.title,
              placement: pr.placement,
              method: pr.methodApproved || dev ? pr.method : null,
            })),
          personalizationArea: v.personalizationArea ?? null,
          anyAvailable: vSkus.some((s) => s.state !== "sold_out"),
        };
      });
    const prices = variants.flatMap((v) => v.skus.map((s) => s.priceMinor));
    const sizes = [...new Map(variants.flatMap((v) => v.skus.map((s) => [s.size, s.sizeSort] as const))).entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([s]) => s);
    const purchasable = p.status === "active" && (p.saleApproved || dev) && variants.length > 0;
    const t = tmpl.find((x) => x.id === p.personalizationTemplateId);
    const personalizable = Boolean(
      features.personalization && p.personalizationEnabled && t && p.personalizationPriceMinor != null && (dev || (t.status === "approved" && t.supplierApproved && p.personalizationProductionDays != null)),
    );
    const leadTime =
      mto && p.leadTimeMinDays != null && p.leadTimeMaxDays != null && (p.leadTimeApproved || dev)
        ? { minDays: p.leadTimeMinDays, maxDays: p.leadTimeMaxDays, approved: p.leadTimeApproved }
        : null;
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      category: p.category,
      categoryLabel: p.categoryLabel,
      summary: p.summary,
      description: p.description,
      heroView: p.heroView,
      fulfillmentMode: p.fulfillmentMode,
      leadTime,
      purchasable,
      notPurchasableReason: purchasable ? null : p.status !== "active" ? "No longer available" : "Not on sale yet",
      saleApproved: p.saleApproved,
      currency: variants[0]?.skus[0]?.currency ?? "NOK",
      fromPriceMinor: prices.length ? Math.min(...prices) : 0,
      variants,
      sizes,
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      sort: p.sort,
      personalizable,
    };
  });
}

export async function listProducts(exec: Executor = db()): Promise<ProductView[]> {
  return loadProducts({}, exec);
}

export async function getProductDetail(slug: string, exec: Executor = db()): Promise<ProductDetailView | null> {
  const [p] = await loadProducts({ slug }, exec);
  if (!p) return null;
  const dev = showDevData();
  const [specs, charts, prow] = await Promise.all([
    exec.select().from(productSpecs).where(eq(productSpecs.productId, p.id)).orderBy(asc(productSpecs.sort)),
    exec.select().from(sizeCharts).where(eq(sizeCharts.productId, p.id)),
    exec.select().from(products).where(eq(products.id, p.id)),
  ]);
  const product = prow[0]!;
  let personalization: PersonalizationView | null = null;
  const features = await getSetting("features", exec);
  if (features.personalization && product.personalizationEnabled && product.personalizationTemplateId && product.personalizationPriceMinor != null) {
    const [t] = await exec.select().from(printTemplates).where(eq(printTemplates.id, product.personalizationTemplateId));
    const approved = Boolean(t && t.status === "approved" && t.supplierApproved && product.personalizationProductionDays != null);
    // In production, personalisation is only offered with an approved, supplier-confirmed template.
    if (t && (approved || dev)) {
      personalization = {
        templateId: t.id,
        templateCode: t.code,
        templateVersion: t.version,
        placement: t.placement,
        fields: t.fields,
        fonts: t.fonts,
        colors: t.colors,
        priceMinor: product.personalizationPriceMinor,
        productionDays: product.personalizationProductionDays,
        noWithdrawal: product.personalizationNoWithdrawal,
        approved,
      };
    }
  }
  const visible = (s: SpecStatus) => s === "approved" || dev;
  const fitSpec = specs.find((s) => s.key === "fit" && visible(s.status));
  return {
    ...p,
    specs: specs
      .filter((s) => s.key !== "fit" && visible(s.status))
      .map((s) => ({ key: s.key, label: s.label, value: s.value, status: s.status, variantId: s.variantId })),
    sizeChart: charts
      .filter((c) => visible(c.status))
      .map((c) => ({ basis: c.basis, status: c.status, columns: c.columns, rows: c.rows, toleranceMm: c.toleranceMm, note: c.note, variantId: c.variantId })),
    personalization,
    fitNote: fitSpec?.value ?? null,
  };
}

export interface OutfitView {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  image: MediaView | null;
  bundle: { bps: number; minItems: number; approved: boolean } | null;
  items: { id: string; label: string; hotspotX: number; hotspotY: number; product: ProductView; variantId: string }[];
}

export async function listOutfits(exec: Executor = db()): Promise<OutfitView[]> {
  const orows = await exec.select().from(outfits).where(eq(outfits.status, "active")).orderBy(asc(outfits.sort));
  if (orows.length === 0) return [];
  const items = await exec
    .select()
    .from(outfitItems)
    .where(inArray(outfitItems.outfitId, orows.map((o) => o.id)))
    .orderBy(asc(outfitItems.sort));
  const productList = await loadProducts({ ids: [...new Set(items.map((i) => i.productId))] }, exec);
  const mediaIds = orows.map((o) => o.mediaId).filter((x): x is string => Boolean(x));
  const media = mediaIds.length ? await exec.select().from(mediaAssets).where(inArray(mediaAssets.id, mediaIds)) : [];
  const dev = showDevData();
  return orows.map((o) => {
    const m = media.find((x) => x.id === o.mediaId);
    return {
      id: o.id,
      slug: o.slug,
      title: o.title,
      subtitle: o.subtitle,
      image: m ? { id: m.id, url: mediaUrl(m.storageKey), width: m.width, height: m.height, alt: m.alt, kind: m.kind, source: m.source } : null,
      bundle:
        o.bundleDiscountBps && (o.bundleApproved || dev)
          ? { bps: o.bundleDiscountBps, minItems: o.bundleMinItems, approved: o.bundleApproved }
          : null,
      items: items
        .filter((i) => i.outfitId === o.id)
        .flatMap((i) => {
          const product = productList.find((p) => p.id === i.productId);
          return product ? [{ id: i.id, label: i.label, hotspotX: i.hotspotX, hotspotY: i.hotspotY, product, variantId: i.variantId }] : [];
        }),
    };
  });
}

/** Look up a set of SKUs with everything needed to price and snapshot them. */
export async function loadSkuDetails(exec: Executor, skuIds: string[]) {
  if (skuIds.length === 0) return [];
  return exec
    .select({
      skuId: skus.id,
      skuCode: skus.code,
      size: skus.size,
      priceMinor: skus.priceMinor,
      currency: skus.currency,
      skuStatus: skus.status,
      variantId: productVariants.id,
      variantCode: productVariants.code,
      colorName: productVariants.colorName,
      optionLabel: productVariants.optionLabel,
      variantStatus: productVariants.status,
      personalizationArea: productVariants.personalizationArea,
      productId: products.id,
      productSlug: products.slug,
      productName: products.name,
      categoryLabel: products.categoryLabel,
      heroView: products.heroView,
      productStatus: products.status,
      saleApproved: products.saleApproved,
      fulfillmentMode: products.fulfillmentMode,
      leadTimeMinDays: products.leadTimeMinDays,
      leadTimeMaxDays: products.leadTimeMaxDays,
      leadTimeApproved: products.leadTimeApproved,
      personalizationEnabled: products.personalizationEnabled,
      personalizationTemplateId: products.personalizationTemplateId,
      personalizationPriceMinor: products.personalizationPriceMinor,
      personalizationProductionDays: products.personalizationProductionDays,
      personalizationNoWithdrawal: products.personalizationNoWithdrawal,
    })
    .from(skus)
    .innerJoin(productVariants, eq(productVariants.id, skus.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(skus.id, skuIds));
}

export type SkuDetail = Awaited<ReturnType<typeof loadSkuDetails>>[number];

export function isSellable(d: SkuDetail): { ok: true } | { ok: false; reason: string } {
  if (d.productStatus !== "active" || d.variantStatus !== "active" || d.skuStatus !== "active") {
    return { ok: false, reason: "This item is no longer available." };
  }
  if (!d.saleApproved && !showDevData()) return { ok: false, reason: "This item is not on sale yet." };
  return { ok: true };
}

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  Address,
  AdminRole,
  AttemptStatus,
  FulfillmentMode,
  FulfillmentStatus,
  MediaKind,
  MediaSource,
  PaymentStatus,
  PersonalizationInput,
  PersonalizationSnapshot,
  PricingSnapshot,
  PrintFamily,
  PrintSnapshot,
  ProductCategory,
  ProductStatus,
  ProviderId,
  RefundStatus,
  ReturnStatus,
  ReviewReason,
  ReviewStatus,
  RightsStatus,
  SellerIdentity,
  ShippingMethodSnapshot,
  SpecStatus,
  TaxSnapshot,
} from "@/lib/types";

/*
 * Conventions
 * - Money is always an integer in minor units (øre for NOK) with an explicit currency.
 * - Orders and order lines are snapshots: they never join back to live catalog data
 *   for anything shown to the customer or sent to production.
 * - Status columns are text with CHECK constraints so the set is enforced by Postgres.
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

export const orderNumberSeq = pgSequence("order_number_seq", { startWith: 10001, increment: 1 });
export const rmaNumberSeq = pgSequence("rma_number_seq", { startWith: 501, increment: 1 });

/* ───────────────────────────── Admin auth (Better Auth) ───────────────────────────── */

export const user = pgTable("admin_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").$type<AdminRole>().notNull().default("viewer"),
  disabled: boolean("disabled").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "admin_session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("admin_session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "admin_account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("admin_account_user_idx").on(t.userId)],
);

export const verification = pgTable("admin_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ───────────────────────────── Operator settings ───────────────────────────── */

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
  updatedBy: text("updated_by"),
});

export const policyPages = pgTable("policy_pages", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  reviewed: boolean("reviewed").notNull().default(false),
  reviewedBy: text("reviewed_by"),
  reviewedAt: ts("reviewed_at"),
  version: integer("version").notNull().default(1),
  updatedAt: updatedAt(),
  updatedBy: text("updated_by"),
});

/* ───────────────────────────── Catalog ───────────────────────────── */

export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").$type<ProductStatus>().notNull().default("draft"),
  sort: integer("sort").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const artworks = pgTable(
  "artworks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    version: integer("version").notNull().default(1),
    family: text("family").$type<PrintFamily>().notNull(),
    title: text("title").notNull(),
    status: text("status").$type<"draft" | "approved" | "retired">().notNull().default("draft"),
    rightsStatus: text("rights_status").$type<RightsStatus>().notNull().default("pending"),
    rightsNote: text("rights_note"),
    creditedTo: text("credited_to"),
    licenseRef: text("license_ref"),
    printFileKey: text("print_file_key"),
    previewKey: text("preview_key"),
    inkColors: jsonb("ink_colors").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("artworks_code_version_uq").on(t.code, t.version)],
);

export interface TemplateField {
  key: string;
  label: string;
  maxLength: number;
  pattern: string; // anchored regex source, uppercase letters etc.
  required: boolean;
  placeholder?: string;
}
export interface TemplateFont {
  id: string;
  name: string;
  version: string;
  license: string;
}
export interface TemplateColor {
  id: string;
  name: string;
  hex: string;
}

export const printTemplates = pgTable(
  "print_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    version: integer("version").notNull().default(1),
    name: text("name").notNull(),
    placement: text("placement").notNull(),
    status: text("status").$type<"draft" | "approved" | "retired">().notNull().default("draft"),
    supplierApproved: boolean("supplier_approved").notNull().default(false),
    supplierApprovedAt: ts("supplier_approved_at"),
    supplierRef: text("supplier_ref"),
    areaMm: jsonb("area_mm")
      .$type<{ widthMm: number; heightMm: number; offsetFromCollarMm: number }>()
      .notNull(),
    fields: jsonb("fields").$type<TemplateField[]>().notNull(),
    fonts: jsonb("fonts").$type<TemplateFont[]>().notNull(),
    colors: jsonb("colors").$type<TemplateColor[]>().notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("print_templates_code_version_uq").on(t.code, t.version)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    category: text("category").$type<ProductCategory>().notNull(),
    categoryLabel: text("category_label").notNull(),
    summary: text("summary"),
    description: text("description"),
    status: text("status").$type<ProductStatus>().notNull().default("draft"),
    fulfillmentMode: text("fulfillment_mode").$type<FulfillmentMode>().notNull().default("stocked"),
    leadTimeMinDays: integer("lead_time_min_days"),
    leadTimeMaxDays: integer("lead_time_max_days"),
    leadTimeApproved: boolean("lead_time_approved").notNull().default(false),
    saleApproved: boolean("sale_approved").notNull().default(false),
    saleApprovedAt: ts("sale_approved_at"),
    saleApprovedBy: text("sale_approved_by"),
    sort: integer("sort").notNull().default(0),
    /** Which side carries the statement graphic: used by the rack, grid and social card. */
    heroView: text("hero_view").$type<"front" | "back">().notNull().default("back"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    weightGrams: integer("weight_grams"),
    personalizationTemplateId: uuid("personalization_template_id").references(() => printTemplates.id),
    personalizationPriceMinor: integer("personalization_price_minor"),
    personalizationProductionDays: integer("personalization_production_days"),
    personalizationEnabled: boolean("personalization_enabled").notNull().default(false),
    /** Operator legal decision: personalised lines (only) are exempt from withdrawal. */
    personalizationNoWithdrawal: boolean("personalization_no_withdrawal").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
  },
  (t) => [
    index("products_status_idx").on(t.status),
    check("products_status_ck", sql`${t.status} in ('draft','active','archived')`),
    check("products_mode_ck", sql`${t.fulfillmentMode} in ('stocked','made_to_order')`),
  ],
);

export const productCollections = pgTable(
  "product_collections",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.productId, t.collectionId] })],
);

export interface VariantPersonalizationArea {
  /** Print area on the variant's back image, as fractions of the image (0..1). */
  x: number;
  y: number;
  w: number;
  h: number;
  colorIds: string[];
}

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    code: text("code").notNull(),
    colorName: text("color_name").notNull(),
    colorHex: text("color_hex").notNull(),
    optionLabel: text("option_label"),
    status: text("status").$type<"active" | "archived">().notNull().default("active"),
    sort: integer("sort").notNull().default(0),
    personalizationArea: jsonb("personalization_area").$type<VariantPersonalizationArea | null>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("product_variants_code_uq").on(t.productId, t.code),
    index("product_variants_product_idx").on(t.productId),
  ],
);

export const variantPrints = pgTable(
  "variant_prints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    artworkId: uuid("artwork_id")
      .notNull()
      .references(() => artworks.id),
    placement: text("placement").notNull(),
    /** Decoration method (screen print, DTG, embroidery…). Shown only once approved. */
    method: text("method"),
    methodApproved: boolean("method_approved").notNull().default(false),
    sizeNote: text("size_note"),
  },
  (t) => [index("variant_prints_variant_idx").on(t.variantId)],
);

export const skus = pgTable(
  "skus",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    code: text("code").notNull().unique(),
    size: text("size").notNull(),
    sizeSort: integer("size_sort").notNull(),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull(),
    status: text("status").$type<"active" | "archived">().notNull().default("active"),
    barcode: text("barcode"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("skus_variant_size_uq").on(t.variantId, t.size),
    check("skus_price_ck", sql`${t.priceMinor} >= 0`),
  ],
);

export const inventoryLevels = pgTable(
  "inventory_levels",
  {
    skuId: uuid("sku_id")
      .primaryKey()
      .references(() => skus.id),
    onHand: integer("on_hand").notNull().default(0),
    /** Last physical stock count. Null means quantities were never verified (e.g. seed data). */
    verifiedAt: ts("verified_at"),
    updatedAt: updatedAt(),
  },
  (t) => [check("inventory_on_hand_ck", sql`${t.onHand} >= 0`)],
);

export type MovementReason =
  | "seed"
  | "count"
  | "receive"
  | "adjustment"
  | "sale"
  | "sale_reversal"
  | "return_restock"
  | "exchange_out"
  | "damage";

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    skuId: uuid("sku_id")
      .notNull()
      .references(() => skus.id),
    delta: integer("delta").notNull(),
    reason: text("reason").$type<MovementReason>().notNull(),
    orderId: uuid("order_id"),
    returnId: uuid("return_id"),
    note: text("note"),
    actor: text("actor"),
    createdAt: createdAt(),
  },
  (t) => [index("inventory_movements_sku_idx").on(t.skuId, t.createdAt)],
);

export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    skuId: uuid("sku_id")
      .notNull()
      .references(() => skus.id),
    orderId: uuid("order_id").notNull(),
    qty: integer("qty").notNull(),
    status: text("status").$type<"active" | "committed" | "released">().notNull().default("active"),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("stock_reservations_active_idx").on(t.skuId).where(sql`${t.status} = 'active'`),
    index("stock_reservations_order_idx").on(t.orderId),
    check("stock_reservations_qty_ck", sql`${t.qty} > 0`),
    check("stock_reservations_status_ck", sql`${t.status} in ('active','committed','released')`),
  ],
);

export const productSpecs = pgTable(
  "product_specs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    value: text("value").notNull(),
    status: text("status").$type<SpecStatus>().notNull().default("draft"),
    source: text("source"),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("product_specs_product_idx").on(t.productId)],
);

export interface SizeChartColumn {
  key: string;
  label: string;
  howToMeasure: string;
}
export interface SizeChartRow {
  size: string;
  /** millimetres, keyed by column key */
  values: Record<string, number>;
}

export const sizeCharts = pgTable(
  "size_charts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
    basis: text("basis").$type<"garment" | "body">().notNull().default("garment"),
    status: text("status").$type<SpecStatus>().notNull().default("draft"),
    columns: jsonb("columns").$type<SizeChartColumn[]>().notNull(),
    rows: jsonb("rows").$type<SizeChartRow[]>().notNull(),
    toleranceMm: integer("tolerance_mm"),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("size_charts_product_idx").on(t.productId)],
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storageKey: text("storage_key").notNull().unique(),
    mime: text("mime").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    alt: text("alt").notNull().default(""),
    kind: text("kind").$type<MediaKind>().notNull(),
    source: text("source").$type<MediaSource>().notNull(),
    rightsNote: text("rights_note"),
    productId: uuid("product_id").references(() => products.id),
    variantId: uuid("variant_id").references(() => productVariants.id),
    artworkId: uuid("artwork_id").references(() => artworks.id),
    sort: integer("sort").notNull().default(0),
    archivedAt: ts("archived_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("media_assets_product_idx").on(t.productId),
    index("media_assets_variant_idx").on(t.variantId),
  ],
);

export const outfits = pgTable("outfits", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  description: text("description"),
  mediaId: uuid("media_id").references(() => mediaAssets.id),
  status: text("status").$type<ProductStatus>().notNull().default("draft"),
  sort: integer("sort").notNull().default(0),
  /** Bundle saving in basis points. Only applied when bundleApproved (or outside production). */
  bundleDiscountBps: integer("bundle_discount_bps"),
  bundleMinItems: integer("bundle_min_items").notNull().default(3),
  bundleApproved: boolean("bundle_approved").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const outfitItems = pgTable(
  "outfit_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outfitId: uuid("outfit_id")
      .notNull()
      .references(() => outfits.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    /** Hotspot position in basis points of the outfit image (0..10000). */
    hotspotX: integer("hotspot_x").notNull(),
    hotspotY: integer("hotspot_y").notNull(),
    label: text("label").notNull(),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("outfit_items_outfit_idx").on(t.outfitId)],
);

export const discountCodes = pgTable("discount_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  kind: text("kind").$type<"percent" | "amount">().notNull(),
  /** percent: basis points; amount: minor units */
  value: integer("value").notNull(),
  currency: text("currency"),
  minSubtotalMinor: integer("min_subtotal_minor").notNull().default(0),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  usageLimit: integer("usage_limit"),
  usedCount: integer("used_count").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

/* ───────────────────────────── Shipping ───────────────────────────── */

export const shippingZones = pgTable("shipping_zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  countries: text("countries").array().notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const shippingRates = pgTable("shipping_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  zoneId: uuid("zone_id")
    .notNull()
    .references(() => shippingZones.id),
  name: text("name").notNull(),
  carrier: text("carrier").notNull(),
  service: text("service"),
  priceMinor: integer("price_minor").notNull(),
  currency: text("currency").notNull(),
  freeOverMinor: integer("free_over_minor"),
  /** Delivery estimate, shown to customers only when both are set. */
  minDays: integer("min_days"),
  maxDays: integer("max_days"),
  /** Operator confirmed the carrier, price and estimate. Required in production. */
  approved: boolean("approved").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ───────────────────────────── Carts ───────────────────────────── */

export const carts = pgTable("carts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  currency: text("currency").notNull(),
  discountCode: text("discount_code"),
  email: text("email"),
  pendingOrderId: uuid("pending_order_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
});

export const cartLines = pgTable(
  "cart_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    skuId: uuid("sku_id")
      .notNull()
      .references(() => skus.id),
    qty: integer("qty").notNull(),
    personalization: jsonb("personalization").$type<PersonalizationInput | null>(),
    personalizationKey: text("personalization_key").notNull().default(""),
    outfitId: uuid("outfit_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("cart_lines_uq").on(t.cartId, t.skuId, t.personalizationKey),
    check("cart_lines_qty_ck", sql`${t.qty} > 0 and ${t.qty} <= 10`),
  ],
);

export const shippingQuotes = pgTable("shipping_quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  cartId: uuid("cart_id")
    .notNull()
    .references(() => carts.id, { onDelete: "cascade" }),
  cartFingerprint: text("cart_fingerprint").notNull(),
  destination: jsonb("destination").$type<Address>().notNull(),
  rateId: uuid("rate_id").notNull(),
  rateSnapshot: jsonb("rate_snapshot").$type<ShippingMethodSnapshot>().notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
});

/* ───────────────────────────── Orders ───────────────────────────── */

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull().unique(),
    cartId: uuid("cart_id"),
    email: text("email").notNull(),
    currency: text("currency").notNull(),
    market: text("market").notNull(),
    subtotalMinor: integer("subtotal_minor").notNull(),
    discountMinor: integer("discount_minor").notNull(),
    shippingMinor: integer("shipping_minor").notNull(),
    taxMinor: integer("tax_minor").notNull(),
    totalMinor: integer("total_minor").notNull(),
    taxSnapshot: jsonb("tax_snapshot").$type<TaxSnapshot>().notNull(),
    pricingSnapshot: jsonb("pricing_snapshot").$type<PricingSnapshot>().notNull(),
    shippingAddress: jsonb("shipping_address").$type<Address>().notNull(),
    shippingMethod: jsonb("shipping_method").$type<ShippingMethodSnapshot>().notNull(),
    quoteId: uuid("quote_id"),
    /** Fingerprint of the bag this order was priced from (reuse vs. rebuild on retry). */
    cartFingerprint: text("cart_fingerprint"),
    discountCode: text("discount_code"),
    sellerSnapshot: jsonb("seller_snapshot").$type<SellerIdentity>().notNull(),
    termsVersion: text("terms_version").notNull(),
    termsAcceptedAt: ts("terms_accepted_at").notNull(),
    paymentStatus: text("payment_status").$type<PaymentStatus>().notNull().default("unpaid"),
    fulfillmentStatus: text("fulfillment_status").$type<FulfillmentStatus>().notNull().default("unfulfilled"),
    returnStatus: text("return_status").$type<ReturnStatus>().notNull().default("none"),
    refundStatus: text("refund_status").$type<RefundStatus>().notNull().default("none"),
    reviewStatus: text("review_status").$type<ReviewStatus>().notNull().default("clear"),
    reviewReasons: jsonb("review_reasons").$type<ReviewReason[]>().notNull().default([]),
    reservationExpiresAt: ts("reservation_expires_at"),
    customerNote: text("customer_note"),
    internalNote: text("internal_note"),
    isTest: boolean("is_test").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    paidAt: ts("paid_at"),
    cancelledAt: ts("cancelled_at"),
    expiredAt: ts("expired_at"),
  },
  (t) => [
    index("orders_payment_idx").on(t.paymentStatus),
    index("orders_fulfillment_idx").on(t.fulfillmentStatus),
    index("orders_created_idx").on(t.createdAt),
    index("orders_email_idx").on(t.email),
    check(
      "orders_payment_ck",
      sql`${t.paymentStatus} in ('unpaid','processing','paid','failed','expired','cancelled')`,
    ),
    check(
      "orders_fulfillment_ck",
      sql`${t.fulfillmentStatus} in ('unfulfilled','in_production','packed','shipped','delivered','cancelled')`,
    ),
    check("orders_return_ck", sql`${t.returnStatus} in ('none','open','closed')`),
    check("orders_refund_ck", sql`${t.refundStatus} in ('none','pending','partially_refunded','refunded')`),
    check("orders_review_ck", sql`${t.reviewStatus} in ('clear','needs_review')`),
    check("orders_totals_ck", sql`${t.totalMinor} >= 0 and ${t.subtotalMinor} >= 0 and ${t.shippingMinor} >= 0`),
  ],
);

export const orderLines = pgTable(
  "order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    lineNo: integer("line_no").notNull(),
    skuId: uuid("sku_id").references(() => skus.id),
    skuCode: text("sku_code").notNull(),
    productId: uuid("product_id"),
    productName: text("product_name").notNull(),
    productSlug: text("product_slug").notNull(),
    categoryLabel: text("category_label").notNull(),
    variantCode: text("variant_code").notNull(),
    variantLabel: text("variant_label").notNull(),
    colorName: text("color_name").notNull(),
    size: text("size").notNull(),
    qty: integer("qty").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    personalizationUnitMinor: integer("personalization_unit_minor").notNull().default(0),
    lineSubtotalMinor: integer("line_subtotal_minor").notNull(),
    discountMinor: integer("discount_minor").notNull().default(0),
    taxMinor: integer("tax_minor").notNull().default(0),
    lineTotalMinor: integer("line_total_minor").notNull(),
    personalization: jsonb("personalization").$type<PersonalizationSnapshot | null>(),
    prints: jsonb("prints").$type<PrintSnapshot[]>().notNull().default([]),
    fulfillmentMode: text("fulfillment_mode").$type<FulfillmentMode>().notNull(),
    leadTime: jsonb("lead_time").$type<{ minDays: number; maxDays: number } | null>(),
    withdrawalRule: text("withdrawal_rule").$type<"standard" | "personalized_exempt">().notNull(),
    imageKey: text("image_key"),
    createdAt: createdAt(),
  },
  (t) => [
    index("order_lines_order_idx").on(t.orderId),
    uniqueIndex("order_lines_no_uq").on(t.orderId, t.lineNo),
    check("order_lines_qty_ck", sql`${t.qty} > 0`),
  ],
);

export const orderAccessTokens = pgTable(
  "order_access_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    tokenHash: text("token_hash").notNull().unique(),
    purpose: text("purpose").notNull().default("view"),
    expiresAt: ts("expires_at").notNull(),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("order_access_tokens_order_idx").on(t.orderId)],
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    type: text("type").notNull(),
    message: text("message").notNull(),
    data: jsonb("data"),
    actor: text("actor").notNull().default("system"),
    createdAt: createdAt(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);

/* ───────────────────────────── Payments ───────────────────────────── */

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    provider: text("provider").$type<ProviderId>().notNull(),
    status: text("status").$type<AttemptStatus>().notNull().default("creating"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    providerRef: text("provider_ref"),
    redirectUrl: text("redirect_url"),
    expiresAt: ts("expires_at").notNull(),
    failureReason: text("failure_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    closedAt: ts("closed_at"),
  },
  (t) => [
    // One payable attempt per order at a time — enforced by the database.
    uniqueIndex("payment_attempts_one_active_uq")
      .on(t.orderId)
      .where(sql`${t.status} in ('creating','open','approved','processing')`),
    uniqueIndex("payment_attempts_ref_uq")
      .on(t.provider, t.providerRef)
      .where(sql`${t.providerRef} is not null`),
    index("payment_attempts_order_idx").on(t.orderId),
    check(
      "payment_attempts_status_ck",
      sql`${t.status} in ('creating','open','approved','processing','succeeded','failed','expired','cancelled','superseded')`,
    ),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    attemptId: uuid("attempt_id").references(() => paymentAttempts.id),
    provider: text("provider").$type<ProviderId>().notNull(),
    /** Stripe PaymentIntent id or PayPal capture id. */
    providerPaymentId: text("provider_payment_id").notNull(),
    status: text("status")
      .$type<"processing" | "succeeded" | "failed" | "mismatch" | "duplicate">()
      .notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    capturedAt: ts("captured_at"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("payments_provider_ref_uq").on(t.provider, t.providerPaymentId),
    index("payments_order_idx").on(t.orderId),
  ],
);

export const providerEvents = pgTable(
  "provider_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").$type<ProviderId>().notNull(),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    status: text("status").$type<"received" | "processed" | "ignored" | "failed">().notNull().default("received"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    orderId: uuid("order_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    receivedAt: ts("received_at").notNull().defaultNow(),
    processedAt: ts("processed_at"),
  },
  (t) => [uniqueIndex("provider_events_uq").on(t.provider, t.eventId)],
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    provider: text("provider").$type<ProviderId>().notNull(),
    providerRefundId: text("provider_refund_id"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    status: text("status").$type<"pending" | "succeeded" | "failed" | "cancelled">().notNull().default("pending"),
    reason: text("reason").notNull(),
    note: text("note"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    requestedBy: text("requested_by").notNull(),
    returnId: uuid("return_id"),
    failureReason: text("failure_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("refunds_provider_ref_uq")
      .on(t.provider, t.providerRefundId)
      .where(sql`${t.providerRefundId} is not null`),
    index("refunds_order_idx").on(t.orderId),
    check("refunds_amount_ck", sql`${t.amountMinor} > 0`),
    check("refunds_status_ck", sql`${t.status} in ('pending','succeeded','failed','cancelled')`),
  ],
);

/* ───────────────────────────── Fulfilment ───────────────────────────── */

export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    kind: text("kind").$type<"original" | "replacement">().notNull().default("original"),
    status: text("status").$type<"packed" | "shipped" | "delivered">().notNull().default("packed"),
    carrier: text("carrier"),
    trackingNumber: text("tracking_number"),
    trackingUrl: text("tracking_url"),
    returnId: uuid("return_id"),
    packedAt: ts("packed_at"),
    shippedAt: ts("shipped_at"),
    deliveredAt: ts("delivered_at"),
    createdBy: text("created_by"),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("shipments_order_idx").on(t.orderId)],
);

export const shipmentLines = pgTable("shipment_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  shipmentId: uuid("shipment_id")
    .notNull()
    .references(() => shipments.id, { onDelete: "cascade" }),
  orderLineId: uuid("order_line_id").references(() => orderLines.id),
  skuId: uuid("sku_id").references(() => skus.id),
  description: text("description").notNull(),
  qty: integer("qty").notNull(),
});

export const fulfillmentRequests = pgTable(
  "fulfillment_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    provider: text("provider").notNull(),
    status: text("status")
      .$type<"draft" | "submitted" | "confirmed" | "failed" | "not_connected">()
      .notNull()
      .default("draft"),
    providerRef: text("provider_ref"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    error: text("error"),
    submittedAt: ts("submitted_at"),
    confirmedAt: ts("confirmed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("fulfillment_requests_uq").on(t.orderId, t.provider)],
);

export const returns = pgTable(
  "returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    rmaNumber: text("rma_number").notNull().unique(),
    type: text("type").$type<"return" | "exchange">().notNull(),
    status: text("status").$type<"requested" | "received" | "closed" | "rejected">().notNull().default("requested"),
    reason: text("reason").notNull(),
    customerNote: text("customer_note"),
    internalNote: text("internal_note"),
    createdBy: text("created_by").notNull(),
    receivedAt: ts("received_at"),
    closedAt: ts("closed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("returns_order_idx").on(t.orderId)],
);

export const returnLines = pgTable(
  "return_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    returnId: uuid("return_id")
      .notNull()
      .references(() => returns.id, { onDelete: "cascade" }),
    orderLineId: uuid("order_line_id")
      .notNull()
      .references(() => orderLines.id),
    qty: integer("qty").notNull(),
    condition: text("condition"),
    restock: boolean("restock").notNull().default(false),
    exchangeSkuId: uuid("exchange_sku_id").references(() => skus.id),
  },
  (t) => [check("return_lines_qty_ck", sql`${t.qty} > 0`)],
);

/* ───────────────────────────── Jobs / outbox ───────────────────────────── */

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    dedupeKey: text("dedupe_key").unique(),
    status: text("status")
      .$type<"pending" | "running" | "succeeded" | "failed" | "dead">()
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(8),
    runAt: ts("run_at").notNull().defaultNow(),
    lockedAt: ts("locked_at"),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    orderId: uuid("order_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    completedAt: ts("completed_at"),
  },
  (t) => [
    index("jobs_due_idx").on(t.status, t.runAt),
    index("jobs_order_idx").on(t.orderId),
    check("jobs_status_ck", sql`${t.status} in ('pending','running','succeeded','failed','dead')`),
  ],
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    worker: text("worker").notNull(),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    ok: boolean("ok"),
    error: text("error"),
  },
  (t) => [index("job_runs_job_idx").on(t.jobId)],
);

/** Liveness of background workers / cron ticks, so readiness can tell "idle" from "not running". */
export const workerHeartbeats = pgTable("worker_heartbeats", {
  worker: text("worker").primaryKey(),
  lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  lastProcessed: integer("last_processed").notNull().default(0),
});

export const emailDeliveries = pgTable(
  "email_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    jobId: uuid("job_id"),
    orderId: uuid("order_id"),
    template: text("template").notNull(),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    provider: text("provider").notNull(),
    providerMessageId: text("provider_message_id"),
    status: text("status").$type<"sending" | "sent" | "failed">().notNull().default("sending"),
    error: text("error"),
    bodyText: text("body_text"),
    sentAt: ts("sent_at"),
    createdAt: createdAt(),
  },
  (t) => [index("email_deliveries_order_idx").on(t.orderId)],
);

/* ───────────────────────────── Marketing, audit ───────────────────────────── */

export const dropSignups = pgTable("drop_signups", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  status: text("status").$type<"pending" | "confirmed" | "unsubscribed">().notNull().default("pending"),
  consentText: text("consent_text").notNull(),
  consentVersion: text("consent_version").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: createdAt(),
  confirmedAt: ts("confirmed_at"),
  unsubscribedAt: ts("unsubscribed_at"),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id"),
    actorEmail: text("actor_email"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_created_idx").on(t.createdAt),
  ],
);

/* ───────────────────────────── Development only ───────────────────────────── */

/**
 * Provider-side state for the local payment simulator (a test double for hosted
 * checkouts). Never used when APP_ENV=production.
 */
export const simulatorSessions = pgTable("simulator_sessions", {
  ref: text("ref").primaryKey(),
  attemptId: uuid("attempt_id").notNull(),
  flavor: text("flavor").$type<"card" | "wallet">().notNull(),
  status: text("status").$type<"open" | "approved" | "processing" | "paid" | "failed" | "expired" | "cancelled">().notNull().default("open"),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  reference: jsonb("reference").$type<{ orderId: string; attemptId: string }>().notNull(),
  shipping: jsonb("shipping").$type<Address | null>(),
  paymentIds: jsonb("payment_ids").$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

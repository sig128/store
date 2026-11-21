/**
 * Isomorphic domain types shared by server code, client components and JSON
 * columns. Nothing in this file may import server modules.
 */

export type ProductCategory = "tee" | "stringer" | "singlet" | "hoodie" | "shorts" | "jacket";
export type ProductStatus = "draft" | "active" | "archived";
export type FulfillmentMode = "stocked" | "made_to_order";
export type PrintFamily = "night_garage" | "last_rep_club" | "coastal_shift";
export type RightsStatus = "original_owned" | "licensed" | "pending" | "concept_only";
export type SpecStatus = "sample" | "draft" | "approved";
export type MediaKind =
  | "front"
  | "back"
  | "front_unlit"
  | "back_unlit"
  | "print_detail"
  | "on_body"
  | "fabric"
  | "styled"
  | "lookbook"
  | "social"
  | "other";
export type MediaSource = "concept_render" | "product_photo" | "licensed_art" | "supplier_mockup";

export type AdminRole = "owner" | "manager" | "fulfillment" | "viewer";

export type PaymentStatus = "unpaid" | "processing" | "paid" | "failed" | "expired" | "cancelled";
export type FulfillmentStatus = "unfulfilled" | "in_production" | "packed" | "shipped" | "delivered" | "cancelled";
export type ReturnStatus = "none" | "open" | "closed";
export type RefundStatus = "none" | "pending" | "partially_refunded" | "refunded";
export type ReviewStatus = "clear" | "needs_review";

export type ProviderId = "stripe" | "paypal" | "simulator";
export type AttemptStatus =
  | "creating"
  | "open"
  | "approved"
  | "processing"
  | "succeeded"
  | "failed"
  | "expired"
  | "cancelled"
  | "superseded";

export interface Address {
  name: string;
  line1: string;
  line2?: string | null;
  postalCode: string;
  city: string;
  country: string; // ISO 3166-1 alpha-2
  phone?: string | null;
}

/** What the browser sends. Never trusted: validated against the print template. */
export interface PersonalizationInput {
  fields: Record<string, string>; // e.g. { name: "NORD", number: "13" }
  colorId: string;
  spellingConfirmed: boolean;
}

/** What is stored on the order line and sent to production. Immutable. */
export interface PersonalizationSnapshot {
  kind: "locker_tag";
  fields: Record<string, string>;
  displayText: string;
  templateId: string;
  templateCode: string;
  templateVersion: number;
  placement: string;
  areaMm: { widthMm: number; heightMm: number; offsetFromCollarMm: number };
  font: { id: string; name: string; version: string };
  color: { id: string; name: string; hex: string };
  unitPriceMinor: number;
  productionDays: number | null;
  approvedAt: string; // ISO timestamp the customer confirmed spelling
}

export interface PrintSnapshot {
  artworkId: string;
  code: string;
  version: number;
  title: string;
  placement: string;
  method: string | null;
}

export interface ReviewReason {
  code:
    | "amount_mismatch"
    | "currency_mismatch"
    | "reference_mismatch"
    | "duplicate_capture"
    | "late_payment_oversold"
    | "address_mismatch"
    | "dispute"
    | "manual";
  message: string;
  blocksFulfillment: boolean;
  at: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}

export interface ShippingMethodSnapshot {
  rateId: string;
  name: string;
  carrier: string;
  service: string | null;
  priceMinor: number;
  currency: string;
  minDays: number | null;
  maxDays: number | null;
}

export interface TaxLine {
  label: string;
  rateBps: number;
  taxableMinor: number;
  taxMinor: number;
}

export interface TaxSnapshot {
  mode: "vat_inclusive" | "not_registered";
  label: string;
  lines: TaxLine[];
}

export interface PriceBreakdownLine {
  key: string;
  skuId: string;
  qty: number;
  unitPriceMinor: number;
  personalizationUnitMinor: number;
  lineSubtotalMinor: number;
  discountMinor: number;
  lineTotalMinor: number;
  taxMinor: number;
}

export interface AppliedDiscount {
  kind: "bundle" | "code";
  ref: string;
  label: string;
  amountMinor: number;
}

export interface PricingSnapshot {
  currency: string;
  lines: PriceBreakdownLine[];
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
  discounts: AppliedDiscount[];
  tax: TaxSnapshot;
}

export interface SellerIdentity {
  legalName: string;
  tradingName: string;
  orgNumber: string;
  vatNumber: string;
  addressLines: string[];
  country: string;
  email: string;
  phone: string;
}

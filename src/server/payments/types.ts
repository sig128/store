import type { Address, ProviderId } from "@/lib/types";
import type { orderLines, orders, paymentAttempts, payments } from "../db/schema";

export type OrderRow = typeof orders.$inferSelect;
export type OrderLineRow = typeof orderLines.$inferSelect;
export type AttemptRow = typeof paymentAttempts.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;

/** A payment as reported by the provider's own API or a verified webhook. */
export interface VerifiedPayment {
  providerPaymentId: string;
  status: "succeeded" | "processing" | "failed";
  amountMinor: number;
  currency: string; // upper-case ISO 4217
  /** References we sent to the provider when creating the checkout. */
  reference: { orderId?: string | null; attemptId?: string | null };
  capturedAt?: Date | null;
  shippingAddress?: Address | null;
  details?: Record<string, unknown>;
}

export type EventKind =
  | "payment_succeeded"
  | "payment_processing"
  | "payment_failed"
  | "checkout_expired"
  | "checkout_cancelled"
  | "checkout_approved"
  | "refund_updated"
  | "dispute_opened"
  | "ignored";

export interface RefundUpdate {
  providerRefundId: string;
  providerPaymentId: string | null;
  /** Our refunds.id, echoed back by the provider (Stripe metadata / PayPal custom_id) when we created the refund. */
  ourRefundId?: string | null;
  amountMinor: number;
  currency: string;
  status: "pending" | "succeeded" | "failed" | "cancelled";
}

/** Provider-agnostic event. Webhooks, capture responses and reconciliation all produce these. */
export interface NormalizedEvent {
  provider: ProviderId;
  /** Unique per provider. Used to deduplicate deliveries. */
  eventId: string;
  type: string;
  kind: EventKind;
  /** Provider checkout reference (Stripe Checkout Session id / PayPal order id). */
  checkoutRef?: string | null;
  attemptId?: string | null;
  orderId?: string | null;
  payment?: VerifiedPayment;
  refund?: RefundUpdate;
  failureReason?: string | null;
  /** Small, non-sensitive summary stored with the event. Never card data. */
  summary: Record<string, unknown>;
}

export interface CheckoutContext {
  order: OrderRow;
  lines: OrderLineRow[];
  attempt: AttemptRow;
  successUrl: string;
  cancelUrl: string;
  returnUrl: string; // where a redirect-based provider sends the buyer after approval
  locale: string;
}

export interface CreatedCheckout {
  providerRef: string;
  redirectUrl: string;
}

export type CloseResult =
  | { status: "closed" }
  | { status: "already_completed" }
  | { status: "not_found" }
  | { status: "error"; error: string };

export interface ProviderStatus {
  state: "open" | "approved" | "processing" | "succeeded" | "failed" | "expired" | "cancelled";
  payments: VerifiedPayment[];
  shippingAddress?: Address | null;
  amountMinor?: number;
  currency?: string;
  reference?: { orderId?: string | null; attemptId?: string | null };
  /** For approval flows that bounce the buyer back to pick another funding source. */
  payerActionUrl?: string | null;
}

export interface RefundResult {
  providerRefundId: string;
  status: "pending" | "succeeded" | "failed";
  failureReason?: string | null;
}

export interface PaymentProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** Hosted (Stripe Checkout) vs approve-then-capture (PayPal Orders). */
  readonly flow: "hosted" | "approve_capture";
  configured(): boolean;
  mode(): "live" | "sandbox" | "simulator" | "not_connected";
  createCheckout(ctx: CheckoutContext): Promise<CreatedCheckout>;
  /** Make sure an attempt can no longer take money. */
  closeCheckout(attempt: AttemptRow): Promise<CloseResult>;
  retrieve(attempt: AttemptRow): Promise<ProviderStatus>;
  /** approve_capture providers only: capture server-side after buyer approval. */
  capture?(attempt: AttemptRow): Promise<ProviderStatus & { declinedRetryable?: boolean }>;
  refund(payment: PaymentRow, amountMinor: number, idempotencyKey: string, reason: string, ourRefundId?: string): Promise<RefundResult>;
  /** Verify authenticity and normalise. Throws WebhookVerificationError if invalid. */
  parseWebhook(rawBody: string, headers: Headers): Promise<NormalizedEvent>;
  dashboardUrl?(kind: "payment" | "checkout", id: string): string | null;
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

import Image from "next/image";
import { formatMoney } from "@/lib/money";
import { mediaUrl } from "@/server/storage";
import type { OrderLineRow, OrderRow } from "@/server/payments/types";

const PAYMENT_LABEL: Record<string, string> = {
  unpaid: "Awaiting payment",
  processing: "Confirming payment",
  paid: "Paid",
  failed: "Payment failed",
  expired: "Expired — not paid",
  cancelled: "Cancelled",
};
const FULFIL_LABEL: Record<string, string> = {
  unfulfilled: "Being prepared",
  in_production: "In production",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function orderStatusLabel(o: Pick<OrderRow, "paymentStatus" | "fulfillmentStatus" | "refundStatus">): string {
  if (o.paymentStatus !== "paid") return PAYMENT_LABEL[o.paymentStatus] ?? o.paymentStatus;
  if (o.refundStatus === "refunded") return "Refunded";
  return FULFIL_LABEL[o.fulfillmentStatus] ?? o.fulfillmentStatus;
}

export function OrderSummary({
  order,
  lines,
  shipments = [],
}: {
  order: OrderRow;
  lines: OrderLineRow[];
  shipments?: { carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; shippedAt: Date | null }[];
}) {
  const a = order.shippingAddress;
  return (
    <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
      <section aria-label="Items">
        <ul className="divide-y divide-rule border-y border-rule">
          {lines.map((l) => (
            <li key={l.id} className="grid grid-cols-[72px_1fr_auto] gap-4 py-4">
              <div className="relative aspect-[4/5] bg-night-3">{l.imageKey ? <Image src={mediaUrl(l.imageKey)} alt="" fill sizes="72px" className="object-contain" /> : null}</div>
              <div>
                <p className="font-display text-[22px] font-extrabold uppercase leading-none">{l.productName}</p>
                <p className="mt-1 text-sm text-bone-dim">
                  {l.variantLabel} · {l.size} · × {l.qty}
                </p>
                {l.personalization ? (
                  <p className="mt-1 text-sm text-sodium">
                    Locker Tag: {l.personalization.displayText} ({l.personalization.color.name})
                  </p>
                ) : null}
                {l.fulfillmentMode === "made_to_order" ? <p className="mt-1 text-xs text-bone-dim">Made to order</p> : null}
              </div>
              <p className="num text-right">{formatMoney(l.lineTotalMinor, order.currency)}</p>
            </li>
          ))}
        </ul>
        {shipments.length ? (
          <div className="mt-6 space-y-2">
            {shipments.map((s, i) => (
              <p key={i} className="text-sm">
                Shipped{s.shippedAt ? ` ${s.shippedAt.toLocaleDateString("en-GB")}` : ""} with {s.carrier ?? "carrier"}
                {s.trackingNumber ? (
                  <>
                    {" "}
                    · tracking{" "}
                    {s.trackingUrl ? (
                      <a href={s.trackingUrl} className="link mono" target="_blank" rel="noreferrer noopener">
                        {s.trackingNumber}
                      </a>
                    ) : (
                      <span className="mono">{s.trackingNumber}</span>
                    )}
                  </>
                ) : null}
              </p>
            ))}
          </div>
        ) : null}
      </section>
      <aside className="space-y-6">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-bone-dim">Subtotal</dt>
            <dd className="num">{formatMoney(order.subtotalMinor, order.currency)}</dd>
          </div>
          {order.pricingSnapshot.discounts.map((d) => (
            <div key={d.ref} className="flex justify-between text-teal-bright">
              <dt>{d.label}</dt>
              <dd className="num">−{formatMoney(d.amountMinor, order.currency)}</dd>
            </div>
          ))}
          <div className="flex justify-between">
            <dt className="text-bone-dim">Delivery ({order.shippingMethod.name})</dt>
            <dd className="num">{order.shippingMinor === 0 ? "Free" : formatMoney(order.shippingMinor, order.currency)}</dd>
          </div>
          <div className="flex justify-between border-t border-rule pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="num">{formatMoney(order.totalMinor, order.currency)}</dd>
          </div>
          {order.taxSnapshot.mode === "vat_inclusive" && order.taxMinor > 0 ? (
            <p className="text-xs text-bone-dim">
              Includes {formatMoney(order.taxMinor, order.currency)} {order.taxSnapshot.label}
            </p>
          ) : null}
        </dl>
        <div className="text-sm">
          <p className="eyebrow mb-2">Delivering to</p>
          <p>{a.name}</p>
          <p className="text-bone-dim">
            {a.line1}
            {a.line2 ? `, ${a.line2}` : ""}
            <br />
            {a.postalCode} {a.city}, {a.country}
          </p>
        </div>
        <div className="text-sm text-bone-dim">
          <p className="eyebrow mb-2">Seller</p>
          {order.sellerSnapshot.legalName ? (
            <p>
              {order.sellerSnapshot.legalName}
              {order.sellerSnapshot.orgNumber ? ` · Org. no. ${order.sellerSnapshot.orgNumber}` : ""}
            </p>
          ) : (
            <p>Seller details not configured (development order).</p>
          )}
        </div>
      </aside>
    </div>
  );
}

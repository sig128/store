import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { orderLines, orders, shipments } from "@/server/db/schema";
import { hasOrderAccess } from "@/server/http/session";
import { OrderSummary, orderStatusLabel } from "@/components/store/order-view";

export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Guest order page. The order number alone never grants access — a valid link or checkout cookie is required. */
export default async function OrderPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const [order] = await db().select().from(orders).where(eq(orders.number, decodeURIComponent(number).toUpperCase()));
  const allowed = order ? await hasOrderAccess(order.id) : false;
  if (!order || !allowed) {
    // Same response whether or not the order exists.
    return (
      <div className="shell py-16">
        <h1 className="display text-[64px]">Order</h1>
        <p className="mt-4 max-w-xl text-bone-dim">
          For your privacy, orders can only be opened from the secure link we email you.{" "}
          <Link href="/support" className="link">
            Request a new link
          </Link>
          .
        </p>
      </div>
    );
  }
  const lines = await db().select().from(orderLines).where(eq(orderLines.orderId, order.id)).orderBy(asc(orderLines.lineNo));
  const ships = await db().select().from(shipments).where(eq(shipments.orderId, order.id));
  return (
    <div className="shell py-12 md:py-16">
      <p className="eyebrow">
        Order <span className="mono">{order.number}</span> · {order.createdAt.toLocaleDateString("en-GB")}
      </p>
      <h1 className="display mt-3 text-[clamp(52px,7vw,96px)]">{orderStatusLabel(order)}</h1>
      <ol className="mt-6 flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em]" aria-label="Progress">
        {[
          ["Paid", order.paymentStatus === "paid"],
          ["In production", ["in_production", "packed", "shipped", "delivered"].includes(order.fulfillmentStatus)],
          ["Packed", ["packed", "shipped", "delivered"].includes(order.fulfillmentStatus)],
          ["Shipped", ["shipped", "delivered"].includes(order.fulfillmentStatus)],
        ].map(([label, done]) => (
          <li key={String(label)} className={`border px-3 py-1.5 ${done ? "border-bone bg-bone text-night" : "border-rule-strong text-bone-mute"}`}>
            {String(label)}
          </li>
        ))}
      </ol>
      <div className="mt-10">
        <OrderSummary order={order} lines={lines} shipments={ships} />
      </div>
      <p className="mt-10 text-sm text-bone-dim">
        Questions? Reply to your confirmation email or see{" "}
        <Link href="/support" className="link">
          order support
        </Link>
        . Returns: see the{" "}
        <Link href="/returns" className="link">
          returns policy
        </Link>
        .
      </p>
    </div>
  );
}

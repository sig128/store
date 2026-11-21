import Link from "next/link";
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/session";
import { Money, Page, Status, dt } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const FILTERS = {
  payment: ["unpaid", "processing", "paid", "failed", "expired", "cancelled"],
  fulfilment: ["unfulfilled", "in_production", "packed", "shipped", "delivered", "cancelled"],
  returns: ["none", "open", "closed"],
  refund: ["none", "pending", "partially_refunded", "refunded"],
  review: ["needs_review", "clear"],
} as const;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("orders:read");
  const sp = await searchParams;
  const conds: SQL[] = [];
  if (sp.payment) conds.push(eq(orders.paymentStatus, sp.payment as never));
  if (sp.fulfilment) conds.push(eq(orders.fulfillmentStatus, sp.fulfilment as never));
  if (sp.returns) conds.push(eq(orders.returnStatus, sp.returns as never));
  if (sp.refund) conds.push(eq(orders.refundStatus, sp.refund as never));
  if (sp.review) conds.push(eq(orders.reviewStatus, sp.review as never));
  if (sp.q) conds.push(or(ilike(orders.number, `%${sp.q}%`), ilike(orders.email, `%${sp.q}%`))!);
  const rows = await db()
    .select()
    .from(orders)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(200);
  const link = (k: string, v: string | null) => {
    const p = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"));
    if (v) p.set(k, v);
    else p.delete(k);
    return `/admin/orders?${p.toString()}`;
  };
  return (
    <Page title="Orders" subtitle="Filter by payment, fulfilment, return, refund and review status. Unpaid and expired orders are kept for reconciliation.">
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Order number or email" className="a-input max-w-xs" />
        <button className="a-btn" type="submit">
          Search
        </button>
      </form>
      <div className="mb-5 grid gap-2 text-xs">
        {Object.entries(FILTERS).map(([k, vals]) => (
          <div key={k} className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 font-bold uppercase tracking-wider text-neutral-500">{k}</span>
            <Link href={link(k, null)} className={`a-badge ${!sp[k] ? "bg-neutral-900 text-white" : "border-neutral-300"}`}>
              all
            </Link>
            {vals.map((v) => (
              <Link key={v} href={link(k, v)} className={`a-badge ${sp[k] === v ? "bg-neutral-900 text-white" : "border-neutral-300"}`}>
                {v.replace(/_/g, " ")}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="a-card overflow-x-auto">
        <table className="a-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Placed</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Payment</th>
              <th>Fulfilment</th>
              <th>Returns</th>
              <th>Refund</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link href={`/admin/orders/${o.id}`} className="font-mono font-semibold underline">
                    {o.number}
                  </Link>
                  {o.isTest ? <span className="ml-1 text-[10px] text-neutral-500">TEST</span> : null}
                </td>
                <td className="whitespace-nowrap">{dt(o.createdAt)}</td>
                <td>{o.email}</td>
                <td>
                  <Money minor={o.totalMinor} currency={o.currency} />
                </td>
                <td>
                  <Status value={o.paymentStatus} />
                </td>
                <td>
                  <Status value={o.fulfillmentStatus} />
                </td>
                <td>
                  <Status value={o.returnStatus} />
                </td>
                <td>
                  <Status value={o.refundStatus} />
                </td>
                <td>{o.reviewStatus === "needs_review" ? <Status value="needs_review" /> : null}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-neutral-500">
                  No orders match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Page>
  );
}

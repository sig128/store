import Link from "next/link";
import { and, desc, eq, gt, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db";
import { dropSignups, jobs, orders, products, productVariants, refunds, skus, workerHeartbeats } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/session";
import { can } from "@/server/auth/rbac";
import { readinessChecks } from "@/server/readiness";
import { getSettings } from "@/server/settings";
import { formatMoney } from "@/lib/money";
import { Badge, Card, Page, Status, dt } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

function Tile({ label, value, href, tone }: { label: string; value: number | string; href: string; tone?: "warn" | "ok" }) {
  return (
    <Link href={href} className={`a-card block p-4 hover:border-neutral-500 ${tone === "warn" && value !== 0 ? "border-amber-300 bg-amber-50" : ""}`}>
      <span className="block text-3xl font-semibold tabular-nums">{value}</span>
      <span className="text-sm text-neutral-600">{label}</span>
    </Link>
  );
}

export default async function Dashboard() {
  const a = await requireAdmin("dashboard:read");
  const s = await getSettings();
  const count = async (where: SQL | undefined) =>
    Number((await db().select({ n: sql<number>`count(*)` }).from(orders).where(where))[0]?.n ?? 0);
  const [review, toMake, toPack, toShip, openReturns, pendingRefunds] = await Promise.all([
    count(eq(orders.reviewStatus, "needs_review")),
    count(and(eq(orders.paymentStatus, "paid"), eq(orders.fulfillmentStatus, "unfulfilled"))),
    count(and(eq(orders.paymentStatus, "paid"), eq(orders.fulfillmentStatus, "in_production"))),
    count(and(eq(orders.paymentStatus, "paid"), eq(orders.fulfillmentStatus, "packed"))),
    count(eq(orders.returnStatus, "open")),
    Number((await db().select({ n: sql<number>`count(*)` }).from(refunds).where(eq(refunds.status, "pending")))[0]?.n ?? 0),
  ]);
  const badJobs = Number((await db().select({ n: sql<number>`count(*)` }).from(jobs).where(inArray(jobs.status, ["failed", "dead"])))[0]?.n ?? 0);
  const [lastRun] = await db().select({ at: workerHeartbeats.lastSeenAt }).from(workerHeartbeats).orderBy(desc(workerHeartbeats.lastSeenAt)).limit(1);
  const week = await db()
    .select({ n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${orders.totalMinor}),0)` })
    .from(orders)
    .where(and(eq(orders.paymentStatus, "paid"), gt(orders.paidAt, sql`now() - interval '7 days'`), eq(orders.isTest, false)));
  const recent = await db().select().from(orders).where(inArray(orders.paymentStatus, ["paid", "processing"])).orderBy(desc(orders.createdAt)).limit(8);
  const low = await db().execute<{ product: string; product_id: string; code: string; size: string; available: number }>(sql`
    select p.name as product, p.id as product_id, s.code, s.size,
      (coalesce(l.on_hand, 0) - coalesce((select sum(r.qty) from stock_reservations r where r.sku_id = s.id and r.status = 'active' and r.expires_at > now()), 0))::int as available
    from ${skus} s join ${productVariants} v on v.id = s.variant_id join ${products} p on p.id = v.product_id
    left join inventory_levels l on l.sku_id = s.id
    where p.status = 'active' and p.fulfillment_mode = 'stocked' and s.status = 'active' and v.status = 'active'
    order by available asc limit 6`);
  const signups = Number((await db().select({ n: sql<number>`count(*)` }).from(dropSignups).where(eq(dropSignups.status, "confirmed")))[0]?.n ?? 0);
  const checks = await readinessChecks();
  const blocking = checks.filter((c) => c.required && !c.ok);
  return (
    <Page title="Dashboard" subtitle="What needs doing right now.">
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Tile label="Need review" value={review} href="/admin/orders?review=needs_review" tone="warn" />
        <Tile label="Paid, to produce" value={toMake} href="/admin/orders?fulfilment=unfulfilled&payment=paid" />
        <Tile label="In production" value={toPack} href="/admin/orders?fulfilment=in_production" />
        <Tile label="Packed, to ship" value={toShip} href="/admin/orders?fulfilment=packed" />
        <Tile label="Open returns" value={openReturns} href="/admin/orders?returns=open" />
        <Tile label="Refunds pending" value={pendingRefunds} href="/admin/orders?refund=pending" tone="warn" />
        <Tile label="Failed jobs" value={badJobs} href="/admin/jobs" tone="warn" />
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Recent paid orders" actions={<Link className="text-sm underline" href="/admin/orders">All orders</Link>}>
          {recent.length === 0 ? (
            <p className="text-sm text-neutral-500">No paid orders yet.</p>
          ) : (
            <table className="a-table">
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link className="font-mono font-semibold underline" href={`/admin/orders/${o.id}`}>
                        {o.number}
                      </Link>
                      {o.isTest ? <span className="ml-1 text-[10px] text-neutral-500">TEST</span> : null}
                    </td>
                    <td className="text-xs">{dt(o.paidAt ?? o.createdAt)}</td>
                    <td>
                      <Status value={o.paymentStatus} />
                    </td>
                    <td>
                      <Status value={o.fulfillmentStatus} />
                    </td>
                    <td className="text-right tabular-nums">{formatMoney(o.totalMinor, o.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <div className="space-y-6">
          <Card title="Launch readiness" actions={<Link className="text-sm underline" href="/admin/readiness">Details</Link>}>
            {blocking.length ? (
              <>
                <p className="mb-2 text-sm">
                  <Badge tone="amber">{blocking.length} required</Badge> before production checkout can open:
                </p>
                <ul className="list-disc pl-5 text-sm">
                  {blocking.slice(0, 6).map((c) => (
                    <li key={c.id}>{c.label}</li>
                  ))}
                  {blocking.length > 6 ? <li>…and {blocking.length - 6} more</li> : null}
                </ul>
              </>
            ) : (
              <p className="text-sm">
                <Badge tone="green">ready</Badge> All required items pass.
              </p>
            )}
          </Card>
          <Card title="Last 7 days (real orders)">
            <p className="text-2xl font-semibold tabular-nums">{formatMoney(Number(week[0]?.total ?? 0), s.store.currency)}</p>
            <p className="text-sm text-neutral-600">
              {Number(week[0]?.n ?? 0)} paid order(s) · {signups} confirmed drop sign-up(s)
            </p>
            <p className="mt-2 text-xs text-neutral-500">Worker last ran: {lastRun ? dt(lastRun.at) : "never"}</p>
          </Card>
          {can(a.role, "inventory:write") ? (
            <Card title="Lowest available stock">
              <table className="a-table">
                <tbody>
                  {low.rows.map((r) => (
                    <tr key={r.code}>
                      <td>
                        <Link className="underline" href={`/admin/products/${r.product_id}`}>
                          {r.product}
                        </Link>{" "}
                        <span className="font-mono text-xs text-neutral-500">{r.code}</span>
                      </td>
                      <td className="text-right tabular-nums">{r.available <= 0 ? <Badge tone="red">sold out</Badge> : r.available <= 2 ? <Badge tone="amber">{r.available}</Badge> : r.available}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : null}
        </div>
      </div>
    </Page>
  );
}

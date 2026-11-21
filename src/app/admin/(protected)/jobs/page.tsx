import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { emailDeliveries, jobs, orders, workerHeartbeats } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/session";
import { Badge, Card, Flash, Page, Status, dt } from "@/components/admin/ui";
import { Submit } from "@/components/admin/submit";
import { retryJobAction, runNowAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUSES = ["failed", "dead", "pending", "running", "succeeded"] as const;

export default async function JobsAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("jobs:retry");
  const sp = await searchParams;
  const st = STATUSES.includes(sp.status as (typeof STATUSES)[number]) ? (sp.status as (typeof STATUSES)[number]) : null;
  const counts = await db().select({ status: jobs.status, n: sql<number>`count(*)` }).from(jobs).groupBy(jobs.status);
  const rows = await db()
    .select({ j: jobs, number: orders.number })
    .from(jobs)
    .leftJoin(orders, eq(orders.id, jobs.orderId))
    .where(st ? eq(jobs.status, st) : inArray(jobs.status, ["failed", "dead", "pending", "running"]))
    .orderBy(desc(jobs.updatedAt))
    .limit(100);
  const [lastRun] = await db().select().from(workerHeartbeats).orderBy(desc(workerHeartbeats.lastSeenAt)).limit(1);
  const mails = await db()
    .select({ e: emailDeliveries, number: orders.number })
    .from(emailDeliveries)
    .leftJoin(orders, eq(orders.id, emailDeliveries.orderId))
    .where(sp.mail === "failed" ? eq(emailDeliveries.status, "failed") : and())
    .orderBy(desc(emailDeliveries.createdAt))
    .limit(50);
  const c = (s: string) => Number(counts.find((x) => x.status === s)?.n ?? 0);
  return (
    <Page
      title="Jobs & emails"
      subtitle={`Emails, payment checks and supplier hand-offs run from a durable queue. Last worker activity: ${lastRun ? dt(lastRun.lastSeenAt) : "never"}.`}
      actions={
        <form action={runNowAction}>
          <Submit className="a-btn">Run due jobs now</Submit>
        </form>
      }
    >
      <Flash sp={sp} />
      <nav className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="Job status">
        <Link className={`a-btn ${!st ? "a-btn-primary" : ""}`} href="/admin/jobs">
          Needs attention / queued
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} className={`a-btn ${st === s ? "a-btn-primary" : ""}`} href={`/admin/jobs?status=${s}`}>
            {s} ({c(s)})
          </Link>
        ))}
      </nav>
      <div className="a-card mb-8 overflow-x-auto">
        <table className="a-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Order</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Next run</th>
              <th>Last error</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-neutral-500">
                  Nothing here.
                </td>
              </tr>
            ) : (
              rows.map(({ j, number }) => (
                <tr key={j.id}>
                  <td className="font-mono text-xs">{j.type}</td>
                  <td>{j.orderId ? <Link className="underline" href={`/admin/orders/${j.orderId}`}>{number}</Link> : "—"}</td>
                  <td>
                    <Status value={j.status} />
                  </td>
                  <td className="tabular-nums">
                    {j.attempts}/{j.maxAttempts}
                  </td>
                  <td className="text-xs">{j.status === "succeeded" ? dt(j.completedAt) : dt(j.runAt)}</td>
                  <td className="max-w-[340px] text-xs text-red-800">{j.lastError}</td>
                  <td>
                    {j.status === "failed" || j.status === "dead" ? (
                      <form action={retryJobAction}>
                        <input type="hidden" name="id" value={j.id} />
                        <Submit className="a-btn">Retry</Submit>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Card title="Email deliveries" actions={<Link className="text-sm underline" href={sp.mail === "failed" ? "/admin/jobs" : "/admin/jobs?mail=failed"}>{sp.mail === "failed" ? "Show all" : "Show failed only"}</Link>}>
        <table className="a-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Template</th>
              <th>Order</th>
              <th>To</th>
              <th>Subject</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {mails.map(({ e, number }) => (
              <tr key={e.id}>
                <td className="text-xs">{dt(e.sentAt ?? e.createdAt)}</td>
                <td className="font-mono text-xs">{e.template}</td>
                <td>{e.orderId ? <Link className="underline" href={`/admin/orders/${e.orderId}`}>{number}</Link> : "—"}</td>
                <td className="text-xs">{e.toAddress}</td>
                <td className="text-xs">{e.subject}</td>
                <td>
                  {e.status === "sent" ? <Badge tone="green">{e.provider === "log" ? "logged (dev)" : "sent"}</Badge> : e.status === "failed" ? <Badge tone="red">failed</Badge> : <Badge>sending</Badge>}
                  {e.error ? <p className="text-xs text-red-800">{e.error}</p> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-neutral-500">A failed email is retried by retrying its job above. Each email has a delivery key, so a retry never sends a second copy once one was accepted by the provider.</p>
      </Card>
    </Page>
  );
}

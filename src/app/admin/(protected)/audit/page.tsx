import Link from "next/link";
import { and, desc, eq, ilike, lt, type SQL } from "drizzle-orm";
import { db } from "@/server/db";
import { auditLog } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/session";
import { Page, dt } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const LINK: Record<string, (id: string) => string> = {
  order: (id) => `/admin/orders/${id}`,
  product: (id) => `/admin/products/${id}`,
  policy_page: (id) => `/admin/policies/${id}`,
};

export default async function AuditAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("audit:read");
  const sp = await searchParams;
  const where: SQL[] = [];
  if (sp.entity) where.push(eq(auditLog.entityType, sp.entity));
  if (sp.id) where.push(eq(auditLog.entityId, sp.id));
  if (sp.actor) where.push(ilike(auditLog.actorEmail, `%${sp.actor}%`));
  if (sp.action) where.push(ilike(auditLog.action, `${sp.action}%`));
  if (sp.before && !Number.isNaN(Date.parse(sp.before))) where.push(lt(auditLog.createdAt, new Date(sp.before)));
  const rows = await db().select().from(auditLog).where(where.length ? and(...where) : undefined).orderBy(desc(auditLog.createdAt)).limit(100);
  const next = rows.length === 100 ? new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v) as [string, string][]), before: rows[99]!.createdAt.toISOString() }) : null;
  return (
    <Page title="Audit log" subtitle="Append-only record of staff and system actions. Payment events from providers are on each order's timeline.">
      <form className="a-card mb-4 flex flex-wrap items-end gap-2 p-4">
        <label>
          <span className="a-label">Entity</span>
          <select name="entity" className="a-input" defaultValue={sp.entity ?? ""}>
            <option value="">all</option>
            {["order", "product", "sku", "artwork", "print_template", "settings", "shipping_rate", "shipping_zone", "policy_page", "admin_user", "job", "report", "discount_code", "collection"].map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="a-label">Action starts with</span>
          <input name="action" className="a-input" defaultValue={sp.action ?? ""} placeholder="refund." />
        </label>
        <label>
          <span className="a-label">Actor email</span>
          <input name="actor" className="a-input" defaultValue={sp.actor ?? ""} />
        </label>
        <button className="a-btn a-btn-primary" type="submit">
          Filter
        </button>
      </form>
      <div className="a-card overflow-x-auto">
        <table className="a-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>What</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-xs">{dt(r.createdAt)}</td>
                <td className="text-xs">
                  {r.actorEmail}
                  <br />
                  <span className="text-neutral-500">{r.actorRole}</span>
                </td>
                <td className="font-mono text-xs">{r.action}</td>
                <td className="text-sm">
                  {r.summary}{" "}
                  {r.entityId && LINK[r.entityType] ? (
                    <Link className="text-xs underline" href={LINK[r.entityType]!(r.entityId)}>
                      open
                    </Link>
                  ) : null}
                  {r.data ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-neutral-500">details</summary>
                      <pre className="max-w-[640px] overflow-x-auto whitespace-pre-wrap text-[11px]">{JSON.stringify(r.data, null, 2)}</pre>
                    </details>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {next ? (
        <Link className="a-btn mt-4 inline-block" href={`/admin/audit?${next}`}>
          Older entries
        </Link>
      ) : null}
    </Page>
  );
}

import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/server/db";
import { policyPages } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/session";
import { Badge, Flash, Page, dt } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function PoliciesAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("settings:write");
  const sp = await searchParams;
  const pages = await db().select().from(policyPages).orderBy(asc(policyPages.slug));
  return (
    <Page title="Policy pages" subtitle="Draft copy written for this store, not legal advice. Each page shows a draft notice until someone qualified marks it reviewed.">
      <Flash sp={sp} />
      <div className="a-card overflow-x-auto">
        <table className="a-table">
          <thead>
            <tr>
              <th>Page</th>
              <th>Status</th>
              <th>Version</th>
              <th>Last edit</th>
              <th>Reviewed</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.slug}>
                <td>
                  <Link className="font-semibold underline" href={`/admin/policies/${p.slug}`}>
                    {p.title}
                  </Link>{" "}
                  <span className="font-mono text-xs text-neutral-500">/{p.slug}</span>
                </td>
                <td>{p.reviewed ? <Badge tone="green">reviewed</Badge> : <Badge tone="amber">needs review</Badge>}</td>
                <td>v{p.version}</td>
                <td className="text-xs">
                  {dt(p.updatedAt)} · {p.updatedBy}
                </td>
                <td className="text-xs">{p.reviewed ? `${p.reviewedBy} · ${dt(p.reviewedAt)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}

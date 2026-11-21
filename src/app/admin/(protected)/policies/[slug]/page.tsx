import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { policyPages } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/session";
import { POLICY_PLACEHOLDERS } from "@/server/policies";
import { Card, Flash, Page } from "@/components/admin/ui";
import { Submit } from "@/components/admin/submit";
import { savePolicyAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function PolicyEditor({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const a = await requireAdmin("settings:write");
  const { slug } = await params;
  const sp = await searchParams;
  const [p] = await db().select().from(policyPages).where(eq(policyPages.slug, slug));
  if (!p) notFound();
  return (
    <Page
      title={`Edit: ${p.title}`}
      subtitle={
        <>
          <Link className="underline" href={`/${p.slug}`} target="_blank">
            View page
          </Link>{" "}
          · version {p.version}
        </>
      }
    >
      <Flash sp={sp} />
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <Card>
          <form action={savePolicyAction} className="space-y-3">
            <input type="hidden" name="slug" value={p.slug} />
            <label className="block">
              <span className="a-label">Title</span>
              <input name="title" className="a-input" defaultValue={p.title} />
            </label>
            <label className="block">
              <span className="a-label">Body (Markdown: ## headings, paragraphs, - lists, **bold**)</span>
              <textarea name="body" className="a-input min-h-[520px] font-mono text-sm" defaultValue={p.body} />
            </label>
            <fieldset className="space-y-2 border-t border-neutral-200 pt-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="reviewed" defaultChecked={p.reviewed} /> Reviewed and approved for publication
              </label>
              <label className="block">
                <span className="a-label">Reviewed by</span>
                <input name="reviewer" className="a-input" defaultValue={p.reviewedBy ?? a.email} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="placeholdersOk" /> Remaining {"{placeholders}"} are intended (filled from Settings)
              </label>
            </fieldset>
            <Submit>Save</Submit>
          </form>
        </Card>
        <Card title="Placeholders">
          <p className="mb-2 text-sm text-neutral-600">These are replaced from Settings when the page is shown. Unset values show as “[not configured]”.</p>
          <ul className="space-y-1 font-mono text-xs">
            {POLICY_PLACEHOLDERS.map((k) => (
              <li key={k}>{`{${k}}`}</li>
            ))}
          </ul>
        </Card>
      </div>
    </Page>
  );
}

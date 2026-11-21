"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { policyPages } from "@/server/db/schema";
import { assertAdmin } from "@/server/auth/session";
import { audit } from "@/server/audit";

/** Editing a page always clears its "reviewed" flag; marking reviewed is a separate, deliberate step. */
export async function savePolicyAction(f: FormData) {
  const a = await assertAdmin("settings:write");
  const slug = String(f.get("slug") ?? "");
  const title = String(f.get("title") ?? "").trim();
  const body = String(f.get("body") ?? "").replace(/\r\n/g, "\n");
  const reviewed = f.get("reviewed") === "on";
  const [cur] = await db().select().from(policyPages).where(eq(policyPages.slug, slug));
  if (!cur) redirect(`/admin/policies?err=${encodeURIComponent("Unknown page.")}`);
  const changed = cur!.body !== body || cur!.title !== title;
  if (reviewed && f.get("reviewer") === "") redirect(`/admin/policies/${slug}?err=${encodeURIComponent("Enter who reviewed the page (e.g. your lawyer or yourself).")}`);
  if (reviewed && /\{[a-zA-Z]+\}|\[TODO|\[REVIEW/.test(body) && f.get("placeholdersOk") !== "on") {
    redirect(`/admin/policies/${slug}?err=${encodeURIComponent("The page still has {placeholders} or review markers. Settings fill the {placeholders}; tick the box if that's intended.")}`);
  }
  await db()
    .update(policyPages)
    .set({
      title,
      body,
      version: changed ? sql`${policyPages.version} + 1` : cur!.version,
      reviewed,
      reviewedBy: reviewed ? String(f.get("reviewer") ?? a.email) : null,
      reviewedAt: reviewed ? (changed || !cur!.reviewed ? new Date() : cur!.reviewedAt) : null,
      updatedAt: new Date(),
      updatedBy: a.email,
    })
    .where(eq(policyPages.slug, slug));
  await audit(db(), a.actor, "policy.save", "policy_page", slug, `${changed ? "Edited" : "Saved"} ${slug}; reviewed ${reviewed}`);
  revalidatePath(`/${slug}`);
  revalidatePath("/admin/policies");
  redirect(`/admin/policies/${slug}?msg=${encodeURIComponent(reviewed ? "Saved and marked reviewed." : "Saved as draft (shown with a draft notice).")}`);
}

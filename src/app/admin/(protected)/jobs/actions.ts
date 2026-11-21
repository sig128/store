"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { jobs } from "@/server/db/schema";
import { assertAdmin } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { retryJob } from "@/server/jobs/queue";
import { tick } from "@/server/jobs/worker";

const back = (q: string) => redirect(`/admin/jobs?${q}`);

/** Retry re-queues the same job row, so its dedupe key still prevents a second email or supplier order. */
export async function retryJobAction(f: FormData) {
  const a = await assertAdmin("jobs:retry");
  const id = String(f.get("id") ?? "");
  const [job] = await db().select().from(jobs).where(eq(jobs.id, id));
  if (!job) back(`err=${encodeURIComponent("Job not found.")}`);
  const ok = await retryJob(db(), id);
  if (ok) await audit(db(), a.actor, "job.retry", "job", id, `Retried ${job!.type} (attempt ${job!.attempts + 1})`, { orderId: job!.orderId });
  revalidatePath("/admin/jobs");
  back(ok ? `msg=${encodeURIComponent(`${job!.type} queued again. It runs on the next worker tick.`)}` : `err=${encodeURIComponent("Only failed or dead jobs can be retried.")}`);
}

export async function runNowAction() {
  const a = await assertAdmin("jobs:retry");
  const r = await tick(`admin:${a.email}`);
  await audit(db(), a.actor, "job.run_now", "job", null, `Ran worker tick from admin: ${r.processed} job(s)`);
  revalidatePath("/admin/jobs");
  back(`msg=${encodeURIComponent(`Processed ${r.processed} due job(s).`)}`);
}

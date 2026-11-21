import "../guard";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { Executor } from "../db";
import { jobRuns, jobs } from "../db/schema";

/**
 * Durable outbox. Jobs are inserted in the same transaction as the state change
 * that causes them (e.g. "order paid" + "send confirmation email"), so a crash can
 * never lose one. `dedupeKey` makes enqueueing idempotent: a duplicate webhook
 * cannot create a second confirmation email.
 */
export type JobType =
  | "email.order_confirmation"
  | "email.shipped"
  | "email.cancelled"
  | "email.refunded"
  | "email.order_link"
  | "email.signup_confirm"
  | "payment.reconcile"
  | "payment.capture_paypal"
  | "payment.close_attempt"
  | "fulfillment.prepare"
  | "fulfillment.submit";

export interface EnqueueInput {
  type: JobType;
  payload: Record<string, unknown>;
  dedupeKey?: string | null;
  runAt?: Date;
  orderId?: string | null;
  maxAttempts?: number;
}

export async function enqueue(exec: Executor, job: EnqueueInput): Promise<string | null> {
  const rows = await exec
    .insert(jobs)
    .values({
      type: job.type,
      payload: job.payload,
      dedupeKey: job.dedupeKey ?? null,
      runAt: job.runAt ?? new Date(),
      orderId: job.orderId ?? null,
      maxAttempts: job.maxAttempts ?? 8,
    })
    .onConflictDoNothing({ target: jobs.dedupeKey })
    .returning({ id: jobs.id });
  return rows[0]?.id ?? null;
}

export async function claimJobs(exec: Executor, worker: string, limit = 5) {
  // Reclaim jobs whose worker died mid-run.
  await exec
    .update(jobs)
    .set({ status: "failed", lockedAt: null, lockedBy: null, lastError: "Worker stopped before finishing; retrying." })
    .where(and(eq(jobs.status, "running"), lt(jobs.lockedAt, sql`now() - interval '10 minutes'`)));
  const res = await exec.execute<{ id: string }>(sql`
    update jobs set status = 'running', locked_at = now(), locked_by = ${worker}, attempts = attempts + 1, updated_at = now()
    where id in (
      select id from jobs
      where status in ('pending', 'failed') and run_at <= now()
      order by run_at
      limit ${limit}
      for update skip locked
    )
    returning id`);
  const ids = res.rows.map((r) => r.id);
  if (ids.length === 0) return [];
  return exec.select().from(jobs).where(inArray(jobs.id, ids));
}

export async function finishJob(exec: Executor, id: string, runId: string, ok: boolean, error?: string) {
  const [job] = await exec.select().from(jobs).where(eq(jobs.id, id));
  if (!job) return;
  await exec.update(jobRuns).set({ finishedAt: new Date(), ok, error: error ?? null }).where(eq(jobRuns.id, runId));
  if (ok) {
    await exec.update(jobs).set({ status: "succeeded", completedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null, updatedAt: new Date() }).where(eq(jobs.id, id));
    return;
  }
  const dead = job.attempts >= job.maxAttempts;
  const backoffSec = Math.min(3600, 15 * 2 ** Math.max(0, job.attempts - 1));
  await exec
    .update(jobs)
    .set({
      status: dead ? "dead" : "failed",
      lastError: (error ?? "Unknown error").slice(0, 2000),
      runAt: new Date(Date.now() + backoffSec * 1000),
      lockedAt: null,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, id));
}

/** Operator retry from /admin/jobs: same job row, so dedupe still protects side effects. */
export async function retryJob(exec: Executor, id: string) {
  const rows = await exec
    .update(jobs)
    .set({ status: "pending", runAt: new Date(), maxAttempts: sql`greatest(${jobs.maxAttempts}, ${jobs.attempts} + 3)`, updatedAt: new Date() })
    .where(and(eq(jobs.id, id), or(eq(jobs.status, "failed"), eq(jobs.status, "dead"))))
    .returning({ id: jobs.id });
  return rows.length > 0;
}

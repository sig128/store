import "../guard";
import { db } from "../db";
import { jobRuns, workerHeartbeats } from "../db/schema";
import { sweepOrders } from "../orders/payment-ops";
import { claimJobs, finishJob } from "./queue";
import { HANDLERS } from "./handlers";

/** Process up to `limit` due jobs. Safe to run from several workers (SKIP LOCKED). */
export async function runJobsOnce(worker: string, limit = 10): Promise<number> {
  const claimed = await claimJobs(db(), worker, limit);
  for (const job of claimed) {
    const [run] = await db().insert(jobRuns).values({ jobId: job.id, worker }).returning();
    const handler = HANDLERS[job.type];
    try {
      if (!handler) throw new Error(`No handler for job type ${job.type}`);
      await handler(job);
      await finishJob(db(), job.id, run!.id, true);
    } catch (err) {
      console.error(`[jobs] ${job.type} ${job.id} failed:`, (err as Error).message);
      await finishJob(db(), job.id, run!.id, false, (err as Error).message);
    }
  }
  return claimed.length;
}

export async function tick(worker: string) {
  const processed = await runJobsOnce(worker, 20);
  const sweep = await sweepOrders();
  await db()
    .insert(workerHeartbeats)
    .values({ worker, lastSeenAt: new Date(), lastProcessed: processed })
    .onConflictDoUpdate({ target: workerHeartbeats.worker, set: { lastSeenAt: new Date(), lastProcessed: processed } });
  return { processed, ...sweep };
}

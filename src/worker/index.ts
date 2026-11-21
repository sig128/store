/**
 * Background worker: `npm run worker`.
 * Processes the outbox (emails, fulfilment, reconciliation, PayPal captures) and
 * runs the recovery sweep (stale attempts, expired stock holds) every minute.
 */
import "../../scripts/_env";
import { hostname } from "node:os";
import { runJobsOnce } from "../server/jobs/worker";
import { sweepOrders } from "../server/orders/payment-ops";
import { closeDb } from "../server/db";

const id = `${hostname()}:${process.pid}`;
const poll = Number(process.env.WORKER_POLL_MS ?? 2000);
let stopping = false;
let lastSweep = 0;

async function loop() {
  console.log(`[worker ${id}] started (poll ${poll} ms)`);
  while (!stopping) {
    try {
      const n = await runJobsOnce(id, 10);
      if (Date.now() - lastSweep > 60_000) {
        lastSweep = Date.now();
        const s = await sweepOrders();
        if (s.reconciled || s.closed || s.expired) console.log(`[worker] sweep`, s);
      }
      if (n === 0) await new Promise((r) => setTimeout(r, poll));
    } catch (err) {
      console.error("[worker] loop error", err);
      await new Promise((r) => setTimeout(r, poll * 2));
    }
  }
  await closeDb();
  console.log("[worker] stopped");
}

for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => (stopping = true));
void loop();

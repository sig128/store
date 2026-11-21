import "./guard";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "./db";
import { inventoryLevels, inventoryMovements, stockReservations, type MovementReason } from "./db/schema";

/**
 * Inventory is a ledger (inventory_movements) with a running on-hand figure
 * (inventory_levels). Checkout holds stock with expiring reservations. All
 * changes lock the affected inventory rows (SELECT … FOR UPDATE, in a stable
 * order) so concurrent buyers of the last unit serialise instead of overselling.
 */

export interface Shortage {
  skuId: string;
  requested: number;
  available: number;
}

export class OutOfStockError extends Error {
  constructor(public readonly shortages: Shortage[]) {
    super(`Out of stock: ${shortages.map((s) => s.skuId).join(", ")}`);
    this.name = "OutOfStockError";
  }
}

function aggregate(lines: { skuId: string; qty: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines) m.set(l.skuId, (m.get(l.skuId) ?? 0) + l.qty);
  return m;
}

/** Lock inventory rows for these SKUs (creating empty rows when missing) and return on-hand counts. */
async function lockLevels(tx: Tx, skuIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(skuIds)].sort();
  if (ids.length === 0) return new Map();
  await tx
    .insert(inventoryLevels)
    .values(ids.map((skuId) => ({ skuId, onHand: 0 })))
    .onConflictDoNothing({ target: inventoryLevels.skuId });
  const rows = await tx
    .select({ skuId: inventoryLevels.skuId, onHand: inventoryLevels.onHand })
    .from(inventoryLevels)
    .where(inArray(inventoryLevels.skuId, ids))
    .orderBy(inventoryLevels.skuId)
    .for("update");
  return new Map(rows.map((r) => [r.skuId, r.onHand]));
}

async function reservedByOthers(tx: Tx, skuIds: string[], orderId: string): Promise<Map<string, number>> {
  if (skuIds.length === 0) return new Map();
  const rows = await tx
    .select({ skuId: stockReservations.skuId, qty: sql<number>`coalesce(sum(${stockReservations.qty}), 0)` })
    .from(stockReservations)
    .where(
      and(
        inArray(stockReservations.skuId, skuIds),
        eq(stockReservations.status, "active"),
        sql`${stockReservations.expiresAt} > now()`,
        sql`${stockReservations.orderId} <> ${orderId}`,
      ),
    )
    .groupBy(stockReservations.skuId);
  return new Map(rows.map((r) => [r.skuId, Number(r.qty)]));
}

/** Hold stock for an order until `expiresAt`. Throws OutOfStockError without reserving anything. */
export async function reserveStock(tx: Tx, orderId: string, lines: { skuId: string; qty: number }[], expiresAt: Date): Promise<void> {
  const need = aggregate(lines);
  const ids = [...need.keys()];
  if (ids.length === 0) return;
  const onHand = await lockLevels(tx, ids);
  const held = await reservedByOthers(tx, ids, orderId);
  const shortages: Shortage[] = [];
  for (const [skuId, qty] of need) {
    const available = (onHand.get(skuId) ?? 0) - (held.get(skuId) ?? 0);
    if (available < qty) shortages.push({ skuId, requested: qty, available: Math.max(0, available) });
  }
  if (shortages.length) throw new OutOfStockError(shortages);
  // Replace any previous hold for this order (e.g. a retried checkout).
  await tx
    .update(stockReservations)
    .set({ status: "released", updatedAt: new Date() })
    .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "active")));
  await tx.insert(stockReservations).values([...need].map(([skuId, qty]) => ({ skuId, orderId, qty, expiresAt, status: "active" as const })));
}

export async function extendReservations(tx: Tx, orderId: string, until: Date): Promise<number> {
  const rows = await tx
    .update(stockReservations)
    .set({ expiresAt: until, updatedAt: new Date() })
    .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "active")))
    .returning({ id: stockReservations.id });
  return rows.length;
}

export async function releaseReservations(tx: Tx, orderId: string): Promise<number> {
  const rows = await tx
    .update(stockReservations)
    .set({ status: "released", updatedAt: new Date() })
    .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "active")))
    .returning({ id: stockReservations.id });
  return rows.length;
}

/**
 * Convert an order's holds into sales once payment is verified. If a hold was
 * already released (payment confirmed after expiry), stock is re-checked; what
 * cannot be covered is returned as `oversold` so the order can be flagged —
 * on-hand never goes negative.
 */
export async function commitStock(
  tx: Tx,
  orderId: string,
  lines: { skuId: string; qty: number }[],
  actor = "system",
): Promise<{ oversold: Shortage[] }> {
  const need = aggregate(lines);
  const ids = [...need.keys()];
  if (ids.length === 0) return { oversold: [] };
  const onHand = await lockLevels(tx, ids);
  const holds = await tx
    .select()
    .from(stockReservations)
    .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "active")));
  const held = new Map<string, number>();
  for (const h of holds) held.set(h.skuId, (held.get(h.skuId) ?? 0) + h.qty);
  const others = await reservedByOthers(tx, ids, orderId);
  const oversold: Shortage[] = [];
  for (const [skuId, qty] of need) {
    const have = onHand.get(skuId) ?? 0;
    const ownHold = held.get(skuId) ?? 0;
    // Units covered by our own hold come out of on-hand directly; anything beyond
    // must also be free of other customers' holds.
    const freeForUs = ownHold >= qty ? have : have - (others.get(skuId) ?? 0);
    if (freeForUs < qty) {
      oversold.push({ skuId, requested: qty, available: Math.max(0, freeForUs) });
      continue;
    }
    await tx
      .update(inventoryLevels)
      .set({ onHand: sql`${inventoryLevels.onHand} - ${qty}`, updatedAt: new Date() })
      .where(eq(inventoryLevels.skuId, skuId));
    await tx.insert(inventoryMovements).values({ skuId, delta: -qty, reason: "sale", orderId, actor, note: ownHold >= qty ? null : "late commit (hold had expired)" });
  }
  await tx
    .update(stockReservations)
    .set({ status: "committed", updatedAt: new Date() })
    .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "active")));
  return { oversold };
}

export async function moveStock(
  tx: Tx,
  o: { skuId: string; delta: number; reason: MovementReason; actor: string; note?: string | null; orderId?: string | null; returnId?: string | null },
): Promise<number> {
  const onHand = await lockLevels(tx, [o.skuId]);
  const next = (onHand.get(o.skuId) ?? 0) + o.delta;
  if (next < 0) throw new Error(`Stock for this SKU cannot go below zero (on hand ${onHand.get(o.skuId) ?? 0}).`);
  await tx
    .update(inventoryLevels)
    .set({ onHand: next, updatedAt: new Date(), ...(o.reason === "count" ? { verifiedAt: new Date() } : {}) })
    .where(eq(inventoryLevels.skuId, o.skuId));
  if (o.delta !== 0 || o.reason === "count") {
    await tx.insert(inventoryMovements).values({
      skuId: o.skuId,
      delta: o.delta,
      reason: o.reason,
      actor: o.actor,
      note: o.note ?? null,
      orderId: o.orderId ?? null,
      returnId: o.returnId ?? null,
    });
  }
  return next;
}

/** Record a physical count: sets on-hand to the counted figure and marks it verified. */
export async function recordCount(tx: Tx, skuId: string, counted: number, actor: string, note?: string): Promise<number> {
  const onHand = await lockLevels(tx, [skuId]);
  const delta = counted - (onHand.get(skuId) ?? 0);
  return moveStock(tx, { skuId, delta, reason: "count", actor, note: note ?? `Counted ${counted}` });
}

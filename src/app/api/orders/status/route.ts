import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { orders, paymentAttempts } from "@/server/db/schema";
import { hasOrderAccess } from "@/server/http/session";

export const dynamic = "force-dynamic";

/** Polled by the confirmation page. Reads verified server state only. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  let orderId = u.searchParams.get("order");
  const attempt = u.searchParams.get("attempt");
  if (!orderId && attempt && /^[0-9a-f-]{36}$/i.test(attempt)) {
    const [a] = await db().select({ orderId: paymentAttempts.orderId }).from(paymentAttempts).where(eq(paymentAttempts.id, attempt));
    orderId = a?.orderId ?? null;
  }
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId) || !(await hasOrderAccess(orderId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const [o] = await db().select({ number: orders.number, paymentStatus: orders.paymentStatus }).from(orders).where(eq(orders.id, orderId));
  if (!o) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(o, { headers: { "Cache-Control": "no-store" } });
}

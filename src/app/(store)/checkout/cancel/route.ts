import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { paymentAttempts } from "@/server/db/schema";
import { hasOrderAccess } from "@/server/http/session";
import { closeAttempt } from "@/server/orders/payment-ops";
import { appUrl } from "@/server/env";

/** Buyer cancelled on the provider page: make sure that attempt can no longer charge, then go back to checkout. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("attempt") ?? "";
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    const [a] = await db().select().from(paymentAttempts).where(eq(paymentAttempts.id, id));
    if (a && (await hasOrderAccess(a.orderId))) {
      await closeAttempt(a.id, "cancelled by the customer").catch(() => undefined);
    }
  }
  return NextResponse.redirect(appUrl("/checkout?cancelled=1"), 303);
}

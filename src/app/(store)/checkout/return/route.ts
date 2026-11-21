import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { paymentAttempts } from "@/server/db/schema";
import { hasOrderAccess } from "@/server/http/session";
import { captureApprovedAttempt } from "@/server/orders/payment-ops";
import { appUrl } from "@/server/env";

/**
 * Return from an approve-then-capture provider (PayPal). Approval is not payment:
 * we verify the approved order and capture it server-side, then show verified state.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("attempt") ?? "";
  const back = (msg: string) => NextResponse.redirect(appUrl(`/checkout?error=${encodeURIComponent(msg)}`), 303);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return back("That payment link is not valid.");
  const [a] = await db().select().from(paymentAttempts).where(eq(paymentAttempts.id, id));
  if (!a || !(await hasOrderAccess(a.orderId))) return back("We couldn't match that payment to your checkout.");
  try {
    const r = await captureApprovedAttempt(a.id);
    if (r.outcome === "paid" || r.outcome === "processing") return NextResponse.redirect(appUrl(`/checkout/complete?attempt=${a.id}`), 303);
    if (r.outcome === "declined_retry") {
      return r.payerActionUrl ? NextResponse.redirect(r.payerActionUrl, 303) : back("Your payment method was declined. Nothing was charged — please try again.");
    }
    if (r.outcome === "noop" && a.status === "succeeded") return NextResponse.redirect(appUrl(`/checkout/complete?attempt=${a.id}`), 303);
    return back(r.message ?? "The payment was not completed. Nothing was charged.");
  } catch (err) {
    console.error("[checkout/return] capture failed", err);
    // Ambiguous: the provider may or may not have captured. Show the verified-state page; reconciliation settles it.
    return NextResponse.redirect(appUrl(`/checkout/complete?attempt=${a.id}`), 303);
  }
}

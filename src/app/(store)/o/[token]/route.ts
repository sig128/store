import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { redeemOrderToken } from "@/server/orders/access";
import { grantOrderAccess } from "@/server/http/session";
import { appUrl } from "@/server/env";

/** Secure emailed order link: exchange the token for a short-lived access cookie, then drop it from the URL. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await redeemOrderToken(db(), token);
  if (!r) return NextResponse.redirect(appUrl("/support?link=expired"), 303);
  await grantOrderAccess(r.orderId, 24);
  return NextResponse.redirect(appUrl(`/orders/${encodeURIComponent(r.number)}`), 303);
}

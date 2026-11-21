import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";
import { tick } from "@/server/jobs/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** For serverless hosts: schedule `GET /api/cron/tick` every minute with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await tick("cron"));
}

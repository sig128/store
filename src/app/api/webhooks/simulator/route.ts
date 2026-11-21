import { NextResponse } from "next/server";
import { simulatorEnabled } from "@/server/env";
import { handleWebhook } from "@/server/payments/webhook-route";

export async function POST(req: Request) {
  if (!simulatorEnabled()) return new NextResponse("Not found", { status: 404 });
  return handleWebhook("simulator", req);
}

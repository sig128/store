import "../guard";
import { NextResponse } from "next/server";
import { getProvider } from ".";
import { handleProviderEvent } from "../orders/transitions";
import { WebhookVerificationError, type NormalizedEvent } from "./types";
import type { ProviderId } from "@/lib/types";

/**
 * Shared webhook handler: verify authenticity first (raw body), then apply the
 * event through the canonical transition. 2xx only once it is safely recorded;
 * 5xx makes the provider retry; 400 for unverifiable requests.
 */
export async function handleWebhook(provider: ProviderId, req: Request): Promise<NextResponse> {
  const raw = await req.text();
  let ev: NormalizedEvent;
  try {
    ev = await getProvider(provider).parseWebhook(raw, req.headers);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      console.warn(`[webhook:${provider}] rejected: ${err.message}`);
      return NextResponse.json({ error: "invalid signature" }, { status: 400 });
    }
    console.error(`[webhook:${provider}] parse failed`, err);
    return NextResponse.json({ error: "error" }, { status: 500 });
  }
  try {
    const r = await handleProviderEvent(ev);
    return NextResponse.json({ received: true, status: r.status });
  } catch (err) {
    console.error(`[webhook:${provider}] processing failed for ${ev.eventId}`, err);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}

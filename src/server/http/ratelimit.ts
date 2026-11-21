import "../guard";
import { headers } from "next/headers";

/**
 * Small in-process limiter for public form endpoints (signup, order-link requests).
 * Per instance only — put a shared limiter (e.g. at the edge/CDN) in front in production.
 */
const buckets = new Map<string, { count: number; reset: number }>();

export async function clientKey(scope: string): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  return `${scope}:${ip}`;
}

export function hit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  b.count += 1;
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  return b.count <= limit;
}

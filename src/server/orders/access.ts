import "../guard";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Executor } from "../db";
import { orderAccessTokens, orders } from "../db/schema";
import { env } from "../env";

/**
 * Guest order access. Order numbers are guessable, so they never grant access.
 *  - Emails carry a random, expiring token (only its SHA-256 is stored).
 *  - Redeeming a token, or completing checkout in this browser, sets a signed,
 *    HttpOnly cookie listing the orders this browser may view.
 */

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function issueOrderToken(exec: Executor, orderId: string, ttlDays: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await exec.insert(orderAccessTokens).values({ orderId, tokenHash: sha(token), expiresAt: new Date(Date.now() + ttlDays * 86_400_000) });
  return token;
}

export async function redeemOrderToken(exec: Executor, token: string): Promise<{ orderId: string; number: string } | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const [row] = await exec
    .select({ id: orderAccessTokens.id, orderId: orderAccessTokens.orderId, number: orders.number })
    .from(orderAccessTokens)
    .innerJoin(orders, eq(orders.id, orderAccessTokens.orderId))
    .where(and(eq(orderAccessTokens.tokenHash, sha(token)), gt(orderAccessTokens.expiresAt, new Date()), isNull(orderAccessTokens.revokedAt)));
  if (!row) return null;
  await exec.update(orderAccessTokens).set({ lastUsedAt: new Date() }).where(eq(orderAccessTokens.id, row.id));
  return { orderId: row.orderId, number: row.number };
}

/* ── signed cookie value: base64url(json) + "." + hmac ── */

const key = () => `${env().COOKIE_SECRET}:order-access`;

export function signValue(value: string): string {
  const mac = createHmac("sha256", key()).update(value).digest("base64url");
  return `${value}.${mac}`;
}

export function verifySigned(signed: string | undefined | null): string | null {
  if (!signed) return null;
  const i = signed.lastIndexOf(".");
  if (i < 1) return null;
  const value = signed.slice(0, i);
  const mac = Buffer.from(signed.slice(i + 1));
  const expected = Buffer.from(createHmac("sha256", key()).update(value).digest("base64url"));
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return null;
  return value;
}

export interface AccessGrant {
  orderIds: string[];
  exp: number;
}

export function encodeGrant(g: AccessGrant): string {
  return signValue(Buffer.from(JSON.stringify(g)).toString("base64url"));
}

export function decodeGrant(cookie: string | undefined | null): AccessGrant {
  const v = verifySigned(cookie);
  if (!v) return { orderIds: [], exp: 0 };
  try {
    const g = JSON.parse(Buffer.from(v, "base64url").toString()) as AccessGrant;
    if (!Array.isArray(g.orderIds) || typeof g.exp !== "number" || g.exp < Date.now()) return { orderIds: [], exp: 0 };
    return g;
  } catch {
    return { orderIds: [], exp: 0 };
  }
}

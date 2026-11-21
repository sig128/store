import "../guard";
import { cookies } from "next/headers";
import { env } from "../env";
import { CART_COOKIE, CART_TTL_DAYS } from "../cart";
import { decodeGrant, encodeGrant } from "../orders/access";

/** Next.js cookie IO for the storefront. Only used from server components, actions and route handlers. */

const secure = () => env().APP_URL.startsWith("https://");
export const ORDER_ACCESS_COOKIE = "aha_orders";

export async function getCartToken(): Promise<string | null> {
  return (await cookies()).get(CART_COOKIE)?.value ?? null;
}

export async function setCartToken(token: string) {
  (await cookies()).set(CART_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secure(),
    path: "/",
    maxAge: CART_TTL_DAYS * 86_400,
  });
}

/** Allow this browser to view an order (after checkout or a valid emailed link). */
export async function grantOrderAccess(orderId: string, hours = 72) {
  const jar = await cookies();
  const current = decodeGrant(jar.get(ORDER_ACCESS_COOKIE)?.value);
  const ids = [orderId, ...current.orderIds.filter((x) => x !== orderId)].slice(0, 12);
  jar.set(ORDER_ACCESS_COOKIE, encodeGrant({ orderIds: ids, exp: Date.now() + hours * 3_600_000 }), {
    httpOnly: true,
    sameSite: "lax",
    secure: secure(),
    path: "/",
    maxAge: hours * 3600,
  });
}

export async function hasOrderAccess(orderId: string): Promise<boolean> {
  const g = decodeGrant((await cookies()).get(ORDER_ACCESS_COOKIE)?.value);
  return g.orderIds.includes(orderId);
}

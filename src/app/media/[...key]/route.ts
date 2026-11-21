import { NextResponse } from "next/server";
import { storage, safeKey } from "@/server/storage";

/** Serves public media from the local storage driver (development / single-server installs). */
const PUBLIC_PREFIXES = ["products/", "outfits/", "uploads/"];

export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  let k: string;
  try {
    k = safeKey(key.join("/"));
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!PUBLIC_PREFIXES.some((p) => k.startsWith(p))) return new NextResponse("Not found", { status: 404 });
  const s = storage();
  if (s.name !== "local") return NextResponse.redirect(s.publicUrl(k), 308);
  const f = await s.get(k);
  if (!f) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(f.body), {
    headers: {
      "Content-Type": f.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}

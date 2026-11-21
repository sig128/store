import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { artworks } from "@/server/db/schema";
import { currentAdmin } from "@/server/auth/session";
import { can } from "@/server/auth/rbac";
import { storage } from "@/server/storage";

/** Print files are never public: only staff who manage artwork or fulfil orders can download them. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await currentAdmin();
  if (!a || !(can(a.role, "artwork:write") || can(a.role, "orders:fulfil"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [art] = await db().select().from(artworks).where(eq(artworks.id, id));
  if (!art?.printFileKey) return NextResponse.json({ error: "not found" }, { status: 404 });
  const file = await storage().get(art.printFileKey);
  if (!file) return NextResponse.json({ error: "file missing from storage" }, { status: 404 });
  const name = `${art.code}-v${art.version}.${art.printFileKey.split(".").pop()}`;
  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

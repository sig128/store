import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema";
import { currentAdmin } from "@/server/auth/session";
import { can } from "@/server/auth/rbac";
import { buildProductionPayload } from "@/server/fulfillment";
import { toCsv } from "@/lib/csv";


/** Structured production data for a printer/supplier (JSON) or a spreadsheet (CSV). */
export async function GET(req: Request) {
  const a = await currentAdmin();
  if (!a || !can(a.role, "orders:fulfil")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const u = new URL(req.url);
  const one = u.searchParams.get("order");
  const ids = one && /^[0-9a-f-]{36}$/i.test(one)
    ? [one]
    : (await db().select({ id: orders.id }).from(orders).where(and(eq(orders.paymentStatus, "paid"), inArray(orders.fulfillmentStatus, ["unfulfilled", "in_production"]))).orderBy(asc(orders.paidAt))).map((r) => r.id);
  const payloads = await Promise.all(ids.map((id) => buildProductionPayload(db(), id)));
  if (u.searchParams.get("format") === "csv") {
    const header = ["order", "line", "sku", "product", "variant", "size", "qty", "mode", "prints", "personalisation_text", "font", "font_version", "colour_hex", "placement", "area_mm", "template"];
    const rows = payloads.flatMap((p) =>
      p.lines.map((l) => [
        p.orderNumber,
        l.lineNo,
        l.sku,
        l.product,
        l.variant,
        l.size,
        l.qty,
        l.fulfillmentMode,
        l.prints.map((x) => `${x.artworkCode} v${x.version} @ ${x.placement}`).join(" | "),
        l.personalization ? Object.entries(l.personalization.text).map(([k, v]) => `${k}=${v}`).join(" ") : "",
        l.personalization?.font.name ?? "",
        l.personalization?.font.version ?? "",
        l.personalization?.color.hex ?? "",
        l.personalization?.placement ?? "",
        l.personalization ? `${l.personalization.areaMm.widthMm}x${l.personalization.areaMm.heightMm}` : "",
        l.personalization ? `${l.personalization.template} v${l.personalization.templateVersion}` : "",
      ]),
    );
    const body = toCsv(header, rows);
    return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="production-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }
  return NextResponse.json({ generatedAt: new Date().toISOString(), orders: payloads }, { headers: { "Content-Disposition": `attachment; filename="production-${new Date().toISOString().slice(0, 10)}.json"` } });
}

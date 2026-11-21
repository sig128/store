import { NextResponse } from "next/server";
import { currentAdmin } from "@/server/auth/session";
import { can } from "@/server/auth/rbac";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { orderRows, parseRange, refundRows, refundsByMonth, salesByMonth, taxByMonth } from "@/server/reports";
import { major, toCsv } from "@/lib/csv";

export async function GET(req: Request) {
  const a = await currentAdmin();
  if (!a || !can(a.role, "reports:export")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const u = new URL(req.url);
  const sp = Object.fromEntries(u.searchParams);
  const s = await getSettings();
  const r = parseRange(sp, s.store.timeZone);
  const type = sp.type ?? "orders";
  let csv: string;
  if (type === "tax") {
    const [sales, tax, refunds] = await Promise.all([salesByMonth(r), taxByMonth(r), refundsByMonth(r)]);
    const rows: unknown[][] = [];
    for (const x of sales) rows.push([x.month, x.currency, "sales_total", "", major(x.total), major(x.tax), x.orders]);
    for (const x of tax) rows.push([x.month, x.currency, "vat_rate", `${x.label} ${x.rateBps / 100}%`, major(x.taxable), major(x.tax), ""]);
    for (const x of refunds) rows.push([x.month, x.currency, "refunds", "pro-rata VAT", `-${major(x.amount)}`, `-${major(x.taxEstimate)}`, x.refunds]);
    csv = toCsv(["month", "currency", "row", "rate", "amount_incl_vat", "vat", "count"], rows);
  } else if (type === "refunds") {
    const rows = await refundRows(r);
    csv = toCsv(
      ["order", "confirmed_at", "currency", "amount", "vat_share_estimate", "provider", "provider_refund_id", "reason", "requested_by"],
      rows.map((x) => [x.number, x.confirmed_at, x.currency, major(x.amount_minor as number), major(x.tax_estimate_minor as number), x.provider, x.provider_refund_id, x.reason, x.requested_by]),
    );
  } else {
    const rows = await orderRows(r);
    csv = toCsv(
      ["order", "paid_at", "currency", "market", "items", "discount", "shipping", "vat_included", "total", "tax_mode", "discount_code", "payment_refs", "refunded", "fulfilment", "refund_status", "ship_country", "test"],
      rows.map((x) => [x.number, x.paid_at, x.currency, x.market, major(x.subtotal_minor as number), major(x.discount_minor as number), major(x.shipping_minor as number), major(x.tax_minor as number), major(x.total_minor as number), x.tax_mode, x.discount_code, x.payment_refs, major(x.refunded_minor as number), x.fulfillment_status, x.refund_status, x.ship_country, x.is_test ? "yes" : "no"]),
    );
  }
  await audit(db(), a.actor, "report.export", "report", type, `Exported ${type} CSV (${sp.from ?? "year start"} → ${sp.to ?? "today"})`);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}-${r.from.toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

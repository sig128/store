import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/session";
import { buildProductionPayload } from "@/server/fulfillment";
import { PrintButton } from "@/components/admin/print-button";
import { ProductionTable } from "@/components/admin/production-table";

export const dynamic = "force-dynamic";

/** Batch supplier sheet for everything paid and not yet packed. */
export default async function ProductionPage() {
  await requireAdmin("orders:fulfil");
  const rows = await db()
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.paymentStatus, "paid"), inArray(orders.fulfillmentStatus, ["unfulfilled", "in_production"])))
    .orderBy(asc(orders.paidAt));
  const payloads = await Promise.all(rows.map((r) => buildProductionPayload(db(), r.id)));
  return (
    <div className="bg-white p-10 text-black print:p-0">
      <PrintButton />
      <h1 className="text-4xl">Production sheet</h1>
      <p className="mt-1 text-sm">
        {payloads.length} paid order(s) waiting for production or packing. Export as{" "}
        <Link className="underline" href="/admin/production/export">
          JSON
        </Link>{" "}
        or{" "}
        <Link className="underline" href="/admin/production/export?format=csv">
          CSV
        </Link>
        .
      </p>
      <ProductionTable payloads={payloads} />
    </div>
  );
}

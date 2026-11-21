import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { buildProductionPayload } from "@/server/fulfillment";
import { PrintButton } from "@/components/admin/print-button";
import { ProductionTable } from "@/components/admin/production-table";

export const dynamic = "force-dynamic";

export default async function SupplierSheet({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("orders:fulfil");
  const { id } = await params;
  let payload;
  try {
    payload = await buildProductionPayload(db(), id);
  } catch {
    notFound();
  }
  return (
    <div className="mx-auto max-w-[1000px] bg-white p-10 text-black print:p-0">
      <PrintButton />
      <h1 className="text-4xl">Supplier order sheet</h1>
      <p className="mt-1 text-sm">
        Order <span className="font-mono font-bold">{payload.orderNumber}</span> · placed {new Date(payload.placedAt).toLocaleString("en-GB")} · structured data: <a className="underline no-print" href={`/admin/production/export?order=${payload.orderId}`}>JSON</a>
      </p>
      <ProductionTable payloads={[payload]} />
    </div>
  );
}

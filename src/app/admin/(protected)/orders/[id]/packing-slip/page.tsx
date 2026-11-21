import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { brand } from "@/config/brand";
import { db } from "@/server/db";
import { orderLines, orders } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { PrintButton } from "@/components/admin/print-button";

export const dynamic = "force-dynamic";

/** Printable packing slip. No prices (gift-friendly); return instructions from settings. */
export default async function PackingSlip({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("orders:fulfil");
  const { id } = await params;
  const [o] = await db().select().from(orders).where(eq(orders.id, id));
  if (!o) notFound();
  const lines = await db().select().from(orderLines).where(eq(orderLines.orderId, id)).orderBy(asc(orderLines.lineNo));
  const s = await getSettings();
  const a = o.shippingAddress;
  return (
    <div className="mx-auto max-w-[760px] bg-white p-10 text-black print:p-0">
      <PrintButton />
      <div className="flex items-start justify-between border-b-2 border-black pb-4">
        <div>
          <h1 className="font-display text-4xl font-black uppercase leading-none">{brand.name}</h1>
          <p className="text-xs">{o.sellerSnapshot.legalName || "[seller not configured]"} {o.sellerSnapshot.orgNumber ? `· Org. no. ${o.sellerSnapshot.orgNumber}` : ""}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest">Packing slip</p>
          <p className="font-mono text-2xl font-bold">{o.number}</p>
          <p className="text-xs">{o.createdAt.toLocaleDateString("en-GB")}</p>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
        <div>
          <p className="text-xs font-bold uppercase">Ship to</p>
          <p className="mt-1 text-base">
            {a.name}
            <br />
            {a.line1}
            {a.line2 ? <><br />{a.line2}</> : null}
            <br />
            {a.postalCode} {a.city}
            <br />
            {a.country}
          </p>
          {a.phone ? <p className="mt-1">Tel. {a.phone}</p> : null}
        </div>
        <div>
          <p className="text-xs font-bold uppercase">Method</p>
          <p className="mt-1">
            {o.shippingMethod.name} — {o.shippingMethod.carrier}
            {o.shippingMethod.service ? ` (${o.shippingMethod.service})` : ""}
          </p>
          {o.customerNote ? (
            <>
              <p className="mt-3 text-xs font-bold uppercase">Customer note</p>
              <p>{o.customerNote}</p>
            </>
          ) : null}
        </div>
      </div>
      <table className="mt-8 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black text-left text-xs uppercase">
            <th className="py-2">✓</th>
            <th className="py-2">SKU</th>
            <th className="py-2">Item</th>
            <th className="py-2">Size</th>
            <th className="py-2 text-right">Qty</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-neutral-300 align-top">
              <td className="py-3 pr-2">☐</td>
              <td className="py-3 pr-3 font-mono text-xs">{l.skuCode}</td>
              <td className="py-3 pr-3">
                <strong>{l.productName}</strong> — {l.variantLabel}
                {l.personalization ? <p className="mt-1 text-xs">Locker Tag: “{l.personalization.displayText}” ({l.personalization.color.name}) — check print before packing</p> : null}
              </td>
              <td className="py-3 pr-3 text-base font-bold">{l.size}</td>
              <td className="py-3 text-right text-base font-bold">{l.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-10 border-t border-neutral-400 pt-4 text-xs">
        <p className="font-bold uppercase">Returns</p>
        <p>
          Changed your mind? You have {s.support.withdrawalDays} days from delivery. Email {s.support.supportEmail || "[support email not configured]"} with order number {o.number}.
          {lines.some((l) => l.withdrawalRule === "personalized_exempt") ? " Personalised Locker Tag items can't be returned for change of mind; faults are always covered." : ""}
        </p>
      </div>
    </div>
  );
}

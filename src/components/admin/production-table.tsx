import type { ProductionPayload } from "@/server/fulfillment";

/** Print instructions per line: what to print, where, in which font/colour, from which file version. */
export function ProductionTable({ payloads }: { payloads: ProductionPayload[] }) {
  return (
    <table className="mt-6 w-full border-collapse text-sm">
      <thead>
        <tr className="border-b-2 border-black text-left text-xs uppercase">
          <th className="py-2 pr-2">Order</th>
          <th className="py-2 pr-2">SKU / garment</th>
          <th className="py-2 pr-2">Size × qty</th>
          <th className="py-2 pr-2">Prints (artwork · version · placement · file)</th>
          <th className="py-2">Personalisation (print exactly)</th>
        </tr>
      </thead>
      <tbody>
        {payloads.flatMap((p) =>
          p.lines.map((l) => (
            <tr key={`${p.orderId}-${l.lineNo}`} className="border-b border-neutral-300 align-top">
              <td className="py-3 pr-2 font-mono text-xs">
                {p.orderNumber}#{l.lineNo}
              </td>
              <td className="py-3 pr-2">
                <span className="font-mono text-xs">{l.sku}</span>
                <br />
                <strong>{l.product}</strong> — {l.variant}
                {l.fulfillmentMode === "made_to_order" ? <p className="text-xs">MADE TO ORDER</p> : null}
              </td>
              <td className="py-3 pr-2 text-base font-bold">
                {l.size} × {l.qty}
              </td>
              <td className="py-3 pr-2 text-xs">
                {l.prints.map((pr) => (
                  <p key={`${pr.artworkCode}-${pr.placement}`}>
                    <span className="font-mono">{pr.artworkCode}</span> v{pr.version} · {pr.placement}
                    {pr.method ? ` · ${pr.method}` : " · method: confirm with printer"}
                    <br />
                    <span className="font-mono text-[10px] text-neutral-600">{pr.printFileKey ?? "no print file on record"}</span>
                  </p>
                ))}
              </td>
              <td className="py-3 text-xs">
                {l.personalization ? (
                  <>
                    <p className="font-mono text-base font-bold">
                      {Object.entries(l.personalization.text)
                        .map(([k, v]) => `${k.toUpperCase()}: ${v}`)
                        .join("   ")}
                    </p>
                    <p>
                      {l.personalization.font.name} v{l.personalization.font.version} · {l.personalization.color.name} ({l.personalization.color.hex})
                    </p>
                    <p>
                      {l.personalization.placement}; max {l.personalization.areaMm.widthMm}×{l.personalization.areaMm.heightMm} mm, {l.personalization.areaMm.offsetFromCollarMm} mm below collar
                    </p>
                    <p>
                      Template {l.personalization.template} v{l.personalization.templateVersion}
                    </p>
                  </>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          )),
        )}
      </tbody>
    </table>
  );
}

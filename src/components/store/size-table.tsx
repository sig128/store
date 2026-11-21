"use client";

import { useState } from "react";
import { formatMeasure, type Unit } from "@/lib/units";
import type { ProductDetailView } from "@/server/catalog";

type Chart = ProductDetailView["sizeChart"][number];

/** Garment measurements in cm or inches, with how each one is taken. */
export function SizeTable({ chart, highlight, idPrefix = "st" }: { chart: Chart; highlight?: string | null; idPrefix?: string }) {
  const [unit, setUnit] = useState<Unit>("cm");
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-bone-dim">
          {chart.basis === "garment" ? (
            <>
              <strong className="text-bone">Garment measurements</strong>, laid flat — not body measurements.
            </>
          ) : (
            <>
              <strong className="text-bone">Body measurements</strong> this size is designed for.
            </>
          )}
        </p>
        <div role="group" aria-label="Units" className="inline-flex border border-rule-strong">
          {(["cm", "in"] as const).map((u) => (
            <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)} className={`mono h-9 px-3 text-xs ${unit === u ? "bg-bone text-night" : "text-bone-dim"}`}>
              {u}
            </button>
          ))}
        </div>
      </div>
      {chart.status !== "approved" ? (
        <p className="mb-3 border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          {chart.status === "sample" ? "Sample measurements for development — not production garments." : "Draft measurements — awaiting confirmation."}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[300px] border-collapse text-sm">
          <caption className="sr-only">Measurements in {unit === "cm" ? "centimetres" : "inches"}</caption>
          <thead>
            <tr className="border-b border-rule-strong text-left">
              <th scope="col" className="py-2 pr-4 font-semibold">
                Size
              </th>
              {chart.columns.map((c) => (
                <th key={c.key} scope="col" className="py-2 pr-4 font-semibold" id={`${idPrefix}-${c.key}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((r) => (
              <tr key={r.size} className={`border-b border-rule ${highlight === r.size ? "bg-bone/10" : ""}`}>
                <th scope="row" className="py-2 pr-4 text-left font-semibold">
                  {r.size}
                </th>
                {chart.columns.map((c) => (
                  <td key={c.key} className="mono py-2 pr-4" headers={`${idPrefix}-${c.key}`}>
                    {r.values[c.key] != null ? formatMeasure(r.values[c.key]!, unit) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        {chart.columns.map((c) => (
          <div key={c.key}>
            <dt className="inline font-semibold">{c.label}: </dt>
            <dd className="inline text-bone-dim">{c.howToMeasure}</dd>
          </div>
        ))}
      </dl>
      {chart.toleranceMm ? (
        <p className="mt-3 text-xs text-bone-mute">Garments can vary by up to ±{formatMeasure(chart.toleranceMm, unit)} {unit}.</p>
      ) : null}
      <p className="mt-3 text-xs text-bone-mute">Tip: measure a garment you already like the fit of, laid flat, and compare.</p>
    </div>
  );
}

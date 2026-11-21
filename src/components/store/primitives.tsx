"use client";

import { formatMoney } from "@/lib/money";
import type { SkuView, VariantView } from "@/server/catalog";

export function Price({ minor, currency, className = "" }: { minor: number; currency: string; className?: string }) {
  return <span className={`num ${className}`}>{formatMoney(minor, currency)}</span>;
}

export function ConceptTag({ className = "" }: { className?: string }) {
  return (
    <span className={`tag ${className}`} title="Illustrated render of the intended garment — not a photo of produced stock">
      Concept render
    </span>
  );
}

/** Colour / option picker. Native radios underneath for keyboard + screen readers. */
export function Swatches({
  variants,
  value,
  onChange,
  name,
  showLabel = true,
}: {
  variants: VariantView[];
  value: string;
  onChange: (id: string) => void;
  name: string;
  showLabel?: boolean;
}) {
  const current = variants.find((v) => v.id === value);
  return (
    <fieldset>
      <legend className="eyebrow mb-2">
        Colour{showLabel && current ? <span className="ml-2 normal-case tracking-normal text-bone">{current.label}</span> : null}
      </legend>
      <div className="flex flex-wrap gap-2">
        {variants.map((v) => (
          <label key={v.id} className="relative cursor-pointer" title={v.label}>
            <input
              type="radio"
              name={name}
              value={v.id}
              checked={v.id === value}
              onChange={() => onChange(v.id)}
              className="peer sr-only"
              aria-label={`${v.label}${v.anyAvailable ? "" : " — sold out"}`}
            />
            <span
              className="block h-10 w-10 rounded-full border border-rule-strong peer-checked:outline peer-checked:outline-2 peer-checked:outline-offset-2 peer-checked:outline-bone peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-fluoro"
              style={{ background: v.colorHex }}
            />
            {v.optionLabel ? (
              <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-night text-[9px] font-bold text-bone ring-1 ring-rule-strong" aria-hidden>
                {v.optionLabel.toLowerCase().includes("clean") ? "—" : "★"}
              </span>
            ) : null}
            {!v.anyAvailable ? <span className="absolute left-1/2 top-1/2 h-px w-11 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-bone" aria-hidden /> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function skuStateLabel(s: SkuView): string {
  if (s.state === "made_to_order") return "made to order";
  if (s.state === "sold_out") return "sold out";
  return "available";
}

/** Size picker as a radio group. Sold-out sizes stay focusable and say so. */
export function SizeChips({
  skus,
  value,
  onChange,
  name,
  legend = "Size",
  error,
  describedBy,
}: {
  skus: SkuView[];
  value: string | null;
  onChange: (skuId: string) => void;
  name: string;
  legend?: React.ReactNode;
  error?: string | null;
  describedBy?: string;
}) {
  return (
    <fieldset aria-describedby={describedBy} aria-invalid={error ? true : undefined}>
      <legend className="eyebrow mb-2 flex w-full items-center justify-between">{legend}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Size">
        {skus.map((s) => {
          const unavailable = s.state === "sold_out";
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={value === s.id}
              data-unavailable={unavailable}
              aria-label={`${s.size}${unavailable ? ", sold out" : s.state === "made_to_order" ? ", made to order" : ""}`}
              onClick={() => onChange(s.id)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const i = skus.findIndex((x) => x.id === s.id);
                const next = skus[(i + (e.key === "ArrowRight" ? 1 : skus.length - 1)) % skus.length];
                if (next) {
                  onChange(next.id);
                  (e.currentTarget.parentElement?.querySelector(`[data-sku="${next.id}"]`) as HTMLElement | null)?.focus();
                }
              }}
              data-sku={s.id}
              tabIndex={value ? (value === s.id ? 0 : -1) : s.id === skus[0]?.id ? 0 : -1}
              className="chip"
            >
              {s.size}
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="mt-2 text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

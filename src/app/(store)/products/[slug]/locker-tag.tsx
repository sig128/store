"use client";

import Image from "next/image";
import type { PersonalizationView, VariantView } from "@/server/catalog";
import { formatMoney } from "@/lib/money";

export interface TagState {
  enabled: boolean;
  fields: Record<string, string>;
  colorId: string;
  confirmed: boolean;
}

export const normalize = (v: string) => v.normalize("NFC").toUpperCase().replace(/\s+/g, " ").trimStart();

/** Client-side mirror of the server rules, for instant feedback. The server re-validates everything. */
export function tagErrors(p: PersonalizationView, s: TagState): Record<string, string> {
  const e: Record<string, string> = {};
  let filled = 0;
  for (const f of p.fields) {
    const v = (s.fields[f.key] ?? "").trim();
    if (!v) continue;
    filled++;
    if ([...v].length > f.maxLength) e[f.key] = `Up to ${f.maxLength} characters`;
    else if (!new RegExp(f.pattern, "u").test(v)) e[f.key] = f.key === "number" ? "Digits only" : "Letters, spaces, . ' and - only";
  }
  if (!filled) e.form = "Add a name, a number or both.";
  if (!s.confirmed) e.confirmed = "Confirm the spelling.";
  return e;
}

export function LockerTagEditor({
  p,
  variant,
  state,
  onChange,
  currency,
  errors,
  showErrors,
}: {
  p: PersonalizationView;
  variant: VariantView;
  state: TagState;
  onChange: (s: TagState) => void;
  currency: string;
  errors: Record<string, string>;
  showErrors: boolean;
}) {
  const area = variant.personalizationArea;
  const colors = p.colors.filter((c) => area?.colorIds.includes(c.id));
  const color = colors.find((c) => c.id === state.colorId) ?? colors[0];
  const back = variant.media.find((m) => m.kind === "back");
  const name = (state.fields.name ?? "").trim();
  const number = (state.fields.number ?? "").trim();
  const display = p.fields.map((f) => (state.fields[f.key] ?? "").trim()).filter(Boolean).join(" · ");

  if (!area || colors.length === 0) {
    return <p className="text-sm text-bone-dim">Locker Tag isn&apos;t available in this colour.</p>;
  }

  // Area in render coordinates (1200 × 1500 canvas)
  const ax = area.x * 1200;
  const ay = area.y * 1500;
  const aw = area.w * 1200;
  const ah = area.h * 1500;
  const nameSize = Math.min(ah * 0.24, aw / Math.max(4, [...name].length * 0.5));
  const numSize = Math.min(ah * 0.62, aw / Math.max(1.6, [...number].length * 0.62));

  return (
    <div className="border border-rule-strong bg-night-2">
      <label className="flex cursor-pointer items-start gap-3 p-4">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 accent-[var(--bone)]"
          checked={state.enabled}
          onChange={(e) => onChange({ ...state, enabled: e.target.checked, confirmed: false })}
          aria-controls="locker-tag-fields"
        />
        <span>
          <span className="font-display text-[24px] font-extrabold uppercase leading-none">Locker Tag</span>
          <span className="num ml-2 text-sm text-bone-dim">+{formatMoney(p.priceMinor, currency)}</span>
          <span className="block text-sm text-bone-dim">Your name and/or number printed on the upper back.</span>
        </span>
      </label>
      {state.enabled ? (
        <div id="locker-tag-fields" className="space-y-4 border-t border-rule p-4">
          {!p.approved ? (
            <p className="border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">Development: the print template is not yet approved by the supplier. This option is hidden in production until it is.</p>
          ) : null}
          <div className="grid grid-cols-[1fr_96px] gap-3">
            {p.fields.map((f) => (
              <div key={f.key}>
                <label htmlFor={`lt-${f.key}`} className="label flex justify-between">
                  <span>{f.label}</span>
                  <span className="mono text-xs text-bone-mute" aria-hidden>
                    {[...(state.fields[f.key] ?? "")].length}/{f.maxLength}
                  </span>
                </label>
                <input
                  id={`lt-${f.key}`}
                  className="field uppercase"
                  inputMode={f.key === "number" ? "numeric" : "text"}
                  autoComplete="off"
                  maxLength={f.maxLength}
                  placeholder={f.placeholder}
                  value={state.fields[f.key] ?? ""}
                  aria-invalid={showErrors && errors[f.key] ? true : undefined}
                  aria-describedby={errors[f.key] ? `lt-${f.key}-err` : undefined}
                  onChange={(e) => onChange({ ...state, fields: { ...state.fields, [f.key]: normalize(e.target.value) }, confirmed: false })}
                />
                {showErrors && errors[f.key] ? (
                  <p id={`lt-${f.key}-err`} className="mt-1 text-xs text-error">
                    {errors[f.key]}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <fieldset>
            <legend className="label">Print colour</legend>
            <div className="flex gap-2">
              {colors.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 border border-rule-strong px-3 py-2 text-sm has-[:checked]:border-bone">
                  <input type="radio" name="lt-color" className="sr-only" checked={color?.id === c.id} onChange={() => onChange({ ...state, colorId: c.id, confirmed: false })} />
                  <span className="h-4 w-4 rounded-full border border-rule-strong" style={{ background: c.hex }} />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Live preview on the selected variant's back, inside the template's print area */}
          <figure className="stage-wall relative mx-auto aspect-[4/5] w-full max-w-[340px] overflow-hidden border border-rule">
            {back ? <Image src={back.url} alt={`${variant.label} back with Locker Tag preview`} fill sizes="340px" className="object-contain" /> : null}
            <svg viewBox="0 0 1200 1500" className="absolute inset-0 h-full w-full" aria-hidden>
              <rect x={ax} y={ay} width={aw} height={ah} fill="none" stroke="rgb(243 246 239 / 0.35)" strokeDasharray="10 10" strokeWidth="3" />
              {name ? (
                <text x={ax + aw / 2} y={ay + ah * 0.27} textAnchor="middle" fill={color?.hex} style={{ fontFamily: "var(--ff-stencil)", fontWeight: 800, fontSize: nameSize, letterSpacing: "0.04em" }}>
                  {name}
                </text>
              ) : null}
              {number ? (
                <text x={ax + aw / 2} y={ay + ah * (name ? 0.92 : 0.8)} textAnchor="middle" fill={color?.hex} style={{ fontFamily: "var(--ff-stencil)", fontWeight: 800, fontSize: numSize }}>
                  {number}
                </text>
              ) : null}
            </svg>
            <figcaption className="absolute bottom-2 left-2 right-2 text-center text-[11px] text-bone-dim">Preview — dashed box is the print area ({p.placement.toLowerCase()})</figcaption>
          </figure>

          <div className="border border-rule p-3">
            <p className="text-sm text-bone-dim">Printed exactly as:</p>
            <p className="font-stencil mt-1 text-2xl tracking-wide" style={{ color: color?.hex === "#2a2a28" ? "var(--bone)" : color?.hex }}>
              {display || "—"}
            </p>
            <label className="mt-3 flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--bone)]" checked={state.confirmed} disabled={!display} onChange={(e) => onChange({ ...state, confirmed: e.target.checked })} aria-invalid={showErrors && errors.confirmed ? true : undefined} />
              <span>I&apos;ve checked the spelling. It will be printed exactly as shown.</span>
            </label>
            {showErrors && (errors.confirmed || errors.form) ? <p className="mt-2 text-xs text-error">{errors.form ?? errors.confirmed}</p> : null}
          </div>
          <ul className="space-y-1 text-xs text-bone-dim">
            <li>
              Production time:{" "}
              {p.productionDays != null ? `${p.productionDays} working days before dispatch` : "not yet confirmed by our printer (development data)"}
            </li>
            <li>Font: {p.fonts[0]?.name}</li>
            <li>
              {p.noWithdrawal
                ? "Personalised items are made to your spec, so they can't be returned for change of mind. Faults are still covered."
                : "Standard returns apply to this item."}
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

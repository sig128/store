import type { PersonalizationInput, PersonalizationSnapshot } from "@/lib/types";
import type { TemplateColor, TemplateField, TemplateFont, VariantPersonalizationArea } from "./db/schema";

/**
 * LOCKER TAG validation and snapshotting. The browser sends raw text; the server
 * normalises it, validates it against the print template for that exact variant
 * and stores an immutable snapshot (text, placement, font + version, colour,
 * template version) on the order line.
 */

export interface TemplateLike {
  id: string;
  code: string;
  version: number;
  placement: string;
  areaMm: { widthMm: number; heightMm: number; offsetFromCollarMm: number };
  fields: TemplateField[];
  fonts: TemplateFont[];
  colors: TemplateColor[];
}

export function normalizeField(value: string): string {
  return value.normalize("NFC").toUpperCase().replace(/\s+/g, " ").trim();
}

export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
  normalized: PersonalizationInput | null;
}

export function validatePersonalization(
  input: PersonalizationInput | null | undefined,
  template: TemplateLike,
  area: VariantPersonalizationArea | null,
): ValidationResult {
  const errors: Record<string, string> = {};
  if (!input) return { ok: false, errors: { form: "Personalisation details are missing." }, normalized: null };
  if (!area) return { ok: false, errors: { form: "Personalisation is not available for this colour." }, normalized: null };
  const fields: Record<string, string> = {};
  let filled = 0;
  for (const f of template.fields) {
    const raw = typeof input.fields?.[f.key] === "string" ? input.fields[f.key]! : "";
    const v = normalizeField(raw);
    if (!v) {
      if (f.required) errors[f.key] = `${f.label} is required.`;
      continue;
    }
    if ([...v].length > f.maxLength) errors[f.key] = `${f.label}: up to ${f.maxLength} characters.`;
    else if (!new RegExp(f.pattern, "u").test(v)) errors[f.key] = `${f.label}: letters${f.key === "number" ? " not allowed, use digits" : ", spaces, . ' and - only"}.`;
    fields[f.key] = v;
    filled++;
  }
  // Only keys from the template are accepted.
  for (const k of Object.keys(input.fields ?? {})) {
    if (!template.fields.some((f) => f.key === k) && (input.fields[k] ?? "").trim()) errors[k] = "Unknown field.";
  }
  if (filled === 0) errors.form = "Add a name, a number or both.";
  const colorOk = template.colors.some((c) => c.id === input.colorId) && area.colorIds.includes(input.colorId);
  if (!colorOk) errors.colorId = "Choose one of the available print colours.";
  if (input.spellingConfirmed !== true) errors.spellingConfirmed = "Confirm the spelling exactly as it will be printed.";
  const ok = Object.keys(errors).length === 0;
  return { ok, errors, normalized: ok ? { fields, colorId: input.colorId, spellingConfirmed: true } : null };
}

/** Stable identity for a personalisation, used to merge identical cart lines. */
export function personalizationKey(p: PersonalizationInput | null | undefined): string {
  if (!p) return "";
  const parts = Object.keys(p.fields)
    .sort()
    .filter((k) => p.fields[k])
    .map((k) => `${k}=${p.fields[k]}`);
  return `${parts.join("|")}|color=${p.colorId}`;
}

export function displayText(fields: Record<string, string>, template: Pick<TemplateLike, "fields">): string {
  return template.fields
    .map((f) => fields[f.key])
    .filter(Boolean)
    .join(" · ");
}

export function buildSnapshot(
  normalized: PersonalizationInput,
  template: TemplateLike,
  unitPriceMinor: number,
  productionDays: number | null,
  confirmedAt = new Date(),
): PersonalizationSnapshot {
  const color = template.colors.find((c) => c.id === normalized.colorId)!;
  const font = template.fonts[0]!;
  return {
    kind: "locker_tag",
    fields: { ...normalized.fields },
    displayText: displayText(normalized.fields, template),
    templateId: template.id,
    templateCode: template.code,
    templateVersion: template.version,
    placement: template.placement,
    areaMm: { ...template.areaMm },
    font: { id: font.id, name: font.name, version: font.version },
    color: { id: color.id, name: color.name, hex: color.hex },
    unitPriceMinor,
    productionDays,
    approvedAt: confirmedAt.toISOString(),
  };
}

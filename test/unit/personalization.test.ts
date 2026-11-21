import { describe, expect, it } from "vitest";
import { buildSnapshot, normalizeField, personalizationKey, validatePersonalization, type TemplateLike } from "@/server/personalization";

const T: TemplateLike = {
  id: "t1",
  code: "LT-SINGLET-UB",
  version: 1,
  placement: "Upper back",
  areaMm: { widthMm: 260, heightMm: 230, offsetFromCollarMm: 70 },
  fields: [
    { key: "name", label: "Name", maxLength: 12, pattern: "^[A-ZÆØÅ][A-ZÆØÅ .'-]{0,11}$", required: false },
    { key: "number", label: "Number", maxLength: 2, pattern: "^[0-9]{1,2}$", required: false },
  ],
  fonts: [{ id: "stencil", name: "Big Shoulders Stencil", version: "2.001", license: "OFL" }],
  colors: [
    { id: "bone", name: "Faded Bone", hex: "#ebe3d2" },
    { id: "coral", name: "Sunset Coral", hex: "#ee7c5e" },
  ],
};
const AREA = { x: 0.3, y: 0.2, w: 0.4, h: 0.2, colorIds: ["coral"] };
const ok = (fields: Record<string, string>, colorId = "coral") => validatePersonalization({ fields, colorId, spellingConfirmed: true }, T, AREA);

describe("Locker Tag validation", () => {
  it("normalises to the exact print text", () => {
    expect(normalizeField("  nord  strøm ")).toBe("NORD STRØM");
    const r = ok({ name: "nordstrøm", number: "13" });
    expect(r.ok).toBe(true);
    expect(r.normalized!.fields).toEqual({ name: "NORDSTRØM", number: "13" });
  });

  it.each([
    [{ name: "ABCDEFGHIJKLM" }, "name"],
    [{ name: "<script>" }, "name"],
    [{ number: "130" }, "number"],
    [{ number: "1a" }, "number"],
    [{ name: "", number: "" }, "form"],
    [{ name: "NORD", nickname: "X" }, "nickname"],
  ])("rejects %j", (fields, key) => {
    const r = ok(fields as Record<string, string>);
    expect(r.ok).toBe(false);
    expect(r.errors[key]).toBeTruthy();
  });

  it("only allows colours defined for this garment colour, and needs confirmed spelling", () => {
    expect(ok({ name: "NORD" }, "bone").errors.colorId).toBeTruthy(); // in template, not for this variant
    expect(ok({ name: "NORD" }, "gold").errors.colorId).toBeTruthy();
    const r = validatePersonalization({ fields: { name: "NORD" }, colorId: "coral", spellingConfirmed: false }, T, AREA);
    expect(r.errors.spellingConfirmed).toBeTruthy();
    expect(validatePersonalization({ fields: { name: "NORD" }, colorId: "coral", spellingConfirmed: true }, T, null).ok).toBe(false);
  });

  it("snapshots text, font version, colour, template version and print area", () => {
    const r = ok({ name: "nord", number: "7" });
    const snap = buildSnapshot(r.normalized!, T, 14900, 5, new Date("2026-11-16T10:00:00Z"));
    expect(snap).toMatchObject({
      fields: { name: "NORD", number: "7" },
      displayText: "NORD · 7",
      templateCode: "LT-SINGLET-UB",
      templateVersion: 1,
      font: { id: "stencil", version: "2.001" },
      color: { id: "coral", hex: "#ee7c5e" },
      areaMm: { widthMm: 260, heightMm: 230, offsetFromCollarMm: 70 },
      unitPriceMinor: 14900,
      productionDays: 5,
      approvedAt: "2026-11-16T10:00:00.000Z",
    });
  });

  it("identical tags merge; different ones don't", () => {
    const a = personalizationKey({ fields: { number: "7", name: "NORD" }, colorId: "coral", spellingConfirmed: true });
    const b = personalizationKey({ fields: { name: "NORD", number: "7" }, colorId: "coral", spellingConfirmed: true });
    const c = personalizationKey({ fields: { name: "NORD", number: "7" }, colorId: "bone", spellingConfirmed: true });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(personalizationKey(null)).toBe("");
  });
});

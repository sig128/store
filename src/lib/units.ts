/** Measurement helpers for size tables. Values are stored in millimetres. */
export type Unit = "cm" | "in";

export function formatMeasure(mm: number, unit: Unit): string {
  if (unit === "cm") {
    const cm = mm / 10;
    return Number.isInteger(cm) ? `${cm}` : cm.toFixed(1);
  }
  const inches = mm / 25.4;
  // nearest quarter inch is what a tape measure can resolve
  const q = Math.round(inches * 4) / 4;
  return q.toFixed(2).replace(/\.00$/, "").replace(/0$/, "");
}

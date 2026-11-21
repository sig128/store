/** CSV cell with formula-injection protection (cells starting with = + - @ are prefixed with '). */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Minor units → "549.00" (always two decimals, dot separator). */
export const major = (minor: number | string | null | undefined) => (Number(minor ?? 0) / 100).toFixed(2);

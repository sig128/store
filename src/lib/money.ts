/** Money helpers. Amounts are integers in minor units (øre for NOK). */

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(minor: number, currency: string, opts: { locale?: string; showZeroDecimals?: boolean } = {}): string {
  const whole = minor % 100 === 0 && !opts.showZeroDecimals;
  const key = `${opts.locale ?? "en-GB"}:${currency}:${whole}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(opts.locale ?? "en-GB", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    });
    formatters.set(key, f);
  }
  // "NOK 549" — non-breaking space keeps the code with the amount
  return f.format(minor / 100).replace(/\s/g, " ");
}

export const toMinor = (major: number) => Math.round(major * 100);

/** Split `total` across weights so the parts sum exactly to `total` (largest remainder). */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map((r) => Math.floor(r));
  let rest = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const o of order) {
    if (rest <= 0) break;
    floors[o.i]! += 1;
    rest -= 1;
  }
  return floors;
}

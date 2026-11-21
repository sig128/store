import "./guard";
import { sql } from "drizzle-orm";
import { db, type Executor } from "./db";

/**
 * Bookkeeping summaries. Sales are counted when payment is verified (paid_at);
 * refunds are counted separately when the provider confirmed them. Nothing here
 * is tax advice: the operator's accountant decides how to book these figures.
 */
export interface ReportRange {
  from: Date;
  to: Date; // exclusive
  includeTest: boolean;
  timeZone: string;
}

export function parseRange(sp: { from?: string; to?: string; test?: string }, timeZone: string): ReportRange {
  const now = new Date();
  const d = (v: string | undefined, fallback: Date) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : fallback);
  const from = d(sp.from, new Date(Date.UTC(now.getUTCFullYear(), 0, 1)));
  const toInclusive = d(sp.to, now);
  const to = new Date(toInclusive.getTime() + 24 * 3600 * 1000);
  return { from, to, includeTest: sp.test === "1", timeZone };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
export const rangeLabel = (r: ReportRange) => `${iso(r.from)} to ${iso(new Date(r.to.getTime() - 1))}`;

/** Local-midnight bounds in the store's time zone. */
function bounds(r: ReportRange) {
  return sql`(o.paid_at at time zone ${r.timeZone}) >= ${iso(r.from)}::date and (o.paid_at at time zone ${r.timeZone}) < ${iso(r.to)}::date`;
}
const testFilter = (r: ReportRange) => (r.includeTest ? sql`true` : sql`o.is_test = false`);

export interface SalesRow {
  month: string;
  currency: string;
  orders: number;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
}

export async function salesByMonth(r: ReportRange, exec: Executor = db()): Promise<SalesRow[]> {
  const res = await exec.execute<{ month: string; currency: string; orders: string; subtotal: string; discount: string; shipping: string; tax: string; total: string }>(sql`
    select to_char(date_trunc('month', o.paid_at at time zone ${r.timeZone}), 'YYYY-MM') as month, o.currency,
      count(*) as orders, sum(o.subtotal_minor) as subtotal, sum(o.discount_minor) as discount,
      sum(o.shipping_minor) as shipping, sum(o.tax_minor) as tax, sum(o.total_minor) as total
    from orders o
    where o.paid_at is not null and o.payment_status = 'paid' and ${bounds(r)} and ${testFilter(r)}
    group by 1, 2 order by 1, 2`);
  return res.rows.map((x) => ({ month: x.month, currency: x.currency, orders: Number(x.orders), subtotal: Number(x.subtotal), discount: Number(x.discount), shipping: Number(x.shipping), tax: Number(x.tax), total: Number(x.total) }));
}

export interface TaxRow {
  month: string;
  currency: string;
  label: string;
  rateBps: number;
  taxable: number;
  tax: number;
}

/** VAT by rate from each order's immutable tax snapshot (prices are VAT-inclusive). */
export async function taxByMonth(r: ReportRange, exec: Executor = db()): Promise<TaxRow[]> {
  const res = await exec.execute<{ month: string; currency: string; label: string; rate: string; taxable: string; tax: string }>(sql`
    select to_char(date_trunc('month', o.paid_at at time zone ${r.timeZone}), 'YYYY-MM') as month, o.currency,
      l->>'label' as label, (l->>'rateBps')::int as rate,
      sum((l->>'taxableMinor')::bigint) as taxable, sum((l->>'taxMinor')::bigint) as tax
    from orders o cross join lateral jsonb_array_elements(o.tax_snapshot->'lines') l
    where o.paid_at is not null and o.payment_status = 'paid' and ${bounds(r)} and ${testFilter(r)}
    group by 1, 2, 3, 4 order by 1, 2, 4 desc`);
  return res.rows.map((x) => ({ month: x.month, currency: x.currency, label: x.label, rateBps: Number(x.rate), taxable: Number(x.taxable), tax: Number(x.tax) }));
}

export interface RefundRow {
  month: string;
  currency: string;
  refunds: number;
  amount: number;
  /** Included VAT in the refunds, allocated in proportion to each order's VAT share. */
  taxEstimate: number;
}

export async function refundsByMonth(r: ReportRange, exec: Executor = db()): Promise<RefundRow[]> {
  const res = await exec.execute<{ month: string; currency: string; n: string; amount: string; tax: string }>(sql`
    select to_char(date_trunc('month', f.updated_at at time zone ${r.timeZone}), 'YYYY-MM') as month, f.currency,
      count(*) as n, sum(f.amount_minor) as amount,
      sum(round(f.amount_minor::numeric * o.tax_minor / nullif(o.total_minor, 0))) as tax
    from refunds f join orders o on o.id = f.order_id
    where f.status = 'succeeded'
      and (f.updated_at at time zone ${r.timeZone}) >= ${iso(r.from)}::date and (f.updated_at at time zone ${r.timeZone}) < ${iso(r.to)}::date
      and ${testFilter(r)}
    group by 1, 2 order by 1, 2`);
  return res.rows.map((x) => ({ month: x.month, currency: x.currency, refunds: Number(x.n), amount: Number(x.amount), taxEstimate: Number(x.tax ?? 0) }));
}

export async function orderRows(r: ReportRange, exec: Executor = db()) {
  const res = await exec.execute<Record<string, string | number | boolean | null>>(sql`
    select o.number, to_char(o.paid_at at time zone ${r.timeZone}, 'YYYY-MM-DD HH24:MI') as paid_at, o.currency, o.market,
      o.subtotal_minor, o.discount_minor, o.shipping_minor, o.tax_minor, o.total_minor,
      o.tax_snapshot->>'mode' as tax_mode, o.discount_code,
      (select string_agg(distinct p.provider || ':' || p.provider_payment_id, ' ') from payments p where p.order_id = o.id and p.status = 'succeeded') as payment_refs,
      coalesce((select sum(f.amount_minor) from refunds f where f.order_id = o.id and f.status = 'succeeded'), 0) as refunded_minor,
      o.fulfillment_status, o.refund_status, o.shipping_address->>'country' as ship_country, o.is_test
    from orders o
    where o.paid_at is not null and o.payment_status = 'paid' and ${bounds(r)} and ${testFilter(r)}
    order by o.paid_at`);
  return res.rows;
}

export async function refundRows(r: ReportRange, exec: Executor = db()) {
  const res = await exec.execute<Record<string, string | number | null>>(sql`
    select o.number, to_char(f.updated_at at time zone ${r.timeZone}, 'YYYY-MM-DD HH24:MI') as confirmed_at, f.currency, f.amount_minor,
      round(f.amount_minor::numeric * o.tax_minor / nullif(o.total_minor, 0)) as tax_estimate_minor,
      f.provider, f.provider_refund_id, f.reason, f.requested_by
    from refunds f join orders o on o.id = f.order_id
    where f.status = 'succeeded'
      and (f.updated_at at time zone ${r.timeZone}) >= ${iso(r.from)}::date and (f.updated_at at time zone ${r.timeZone}) < ${iso(r.to)}::date
      and ${testFilter(r)}
    order by f.updated_at`);
  return res.rows;
}

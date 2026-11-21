import { requireAdmin } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { parseRange, rangeLabel, refundsByMonth, salesByMonth, taxByMonth } from "@/server/reports";
import { formatMoney } from "@/lib/money";
import { Card, Page } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("reports:export");
  const sp = await searchParams;
  const s = await getSettings();
  const r = parseRange(sp, s.store.timeZone);
  const [sales, tax, refunds] = await Promise.all([salesByMonth(r), taxByMonth(r), refundsByMonth(r)]);
  const q = new URLSearchParams({ from: sp.from ?? r.from.toISOString().slice(0, 10), to: sp.to ?? new Date(r.to.getTime() - 1).toISOString().slice(0, 10), ...(r.includeTest ? { test: "1" } : {}) });
  const m = (v: number, c: string) => formatMoney(v, c);
  return (
    <Page title="Reports & exports" subtitle={`Paid orders by verified payment date, ${rangeLabel(r)} (${s.store.timeZone}). Figures come from each order's stored snapshot.`}>
      <form className="a-card mb-6 flex flex-wrap items-end gap-3 p-4">
        <label>
          <span className="a-label">From</span>
          <input type="date" name="from" className="a-input" defaultValue={q.get("from")!} />
        </label>
        <label>
          <span className="a-label">To (inclusive)</span>
          <input type="date" name="to" className="a-input" defaultValue={q.get("to")!} />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="test" value="1" defaultChecked={r.includeTest} /> Include test orders
        </label>
        <button className="a-btn a-btn-primary" type="submit">
          Update
        </button>
        <span className="ml-auto flex flex-wrap gap-2 text-sm">
          <a className="a-btn" href={`/admin/reports/export?type=orders&${q}`}>
            Orders CSV
          </a>
          <a className="a-btn" href={`/admin/reports/export?type=tax&${q}`}>
            VAT summary CSV
          </a>
          <a className="a-btn" href={`/admin/reports/export?type=refunds&${q}`}>
            Refunds CSV
          </a>
        </span>
      </form>
      <div className="grid gap-6">
        <Card title="Sales">
          <table className="a-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Orders</th>
                <th className="text-right">Items</th>
                <th className="text-right">Discounts</th>
                <th className="text-right">Shipping</th>
                <th className="text-right">Total charged</th>
                <th className="text-right">VAT included</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-neutral-500">
                    No paid orders in this period.
                  </td>
                </tr>
              ) : (
                sales.map((x) => (
                  <tr key={`${x.month}-${x.currency}`}>
                    <td>{x.month}</td>
                    <td>{x.orders}</td>
                    <td className="text-right tabular-nums">{m(x.subtotal, x.currency)}</td>
                    <td className="text-right tabular-nums">−{m(x.discount, x.currency)}</td>
                    <td className="text-right tabular-nums">{m(x.shipping, x.currency)}</td>
                    <td className="text-right font-semibold tabular-nums">{m(x.total, x.currency)}</td>
                    <td className="text-right tabular-nums">{m(x.tax, x.currency)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
        <Card title="VAT by rate (from order snapshots)">
          <table className="a-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Rate</th>
                <th className="text-right">Sales incl. VAT</th>
                <th className="text-right">VAT</th>
              </tr>
            </thead>
            <tbody>
              {tax.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-neutral-500">
                    No VAT lines (tax not configured or seller not VAT registered).
                  </td>
                </tr>
              ) : (
                tax.map((x) => (
                  <tr key={`${x.month}-${x.label}-${x.rateBps}`}>
                    <td>{x.month}</td>
                    <td>
                      {x.label} {x.rateBps / 100}%
                    </td>
                    <td className="text-right tabular-nums">{m(x.taxable, x.currency)}</td>
                    <td className="text-right tabular-nums">{m(x.tax, x.currency)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
        <Card title="Refunds confirmed by the provider">
          <table className="a-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Refunds</th>
                <th className="text-right">Amount</th>
                <th className="text-right">VAT share (pro rata)</th>
              </tr>
            </thead>
            <tbody>
              {refunds.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-neutral-500">
                    No confirmed refunds in this period.
                  </td>
                </tr>
              ) : (
                refunds.map((x) => (
                  <tr key={`${x.month}-${x.currency}`}>
                    <td>{x.month}</td>
                    <td>{x.refunds}</td>
                    <td className="text-right tabular-nums">−{m(x.amount, x.currency)}</td>
                    <td className="text-right tabular-nums">−{m(x.taxEstimate, x.currency)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-neutral-500">VAT in refunds is allocated in proportion to the VAT share of the original order. Your accountant decides how credit notes are booked.</p>
        </Card>
      </div>
    </Page>
  );
}

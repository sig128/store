import { randomUUID } from "node:crypto";
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  auditLog,
  emailDeliveries,
  fulfillmentRequests,
  orderEvents,
  orderLines,
  orders,
  paymentAttempts,
  payments,
  providerEvents,
  refunds,
  returnLines,
  returns,
  shipments,
  skus,
} from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/session";
import { can } from "@/server/auth/rbac";
import { getProvider } from "@/server/payments";
import { fulfillmentAdapter } from "@/server/fulfillment";
import { CARRIERS } from "@/config/carriers";
import { formatMoney } from "@/lib/money";
import { Badge, Card, Flash, Money, Page, Status, dt } from "@/components/admin/ui";
import { Submit } from "@/components/admin/submit";
import * as A from "../actions";

export const dynamic = "force-dynamic";

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const admin = await requireAdmin("orders:read");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [o] = await db().select().from(orders).where(eq(orders.id, id));
  if (!o) notFound();
  const [lines, attempts, pays, refs, rets, ships, events, mails, frs, audits] = await Promise.all([
    db().select().from(orderLines).where(eq(orderLines.orderId, id)).orderBy(asc(orderLines.lineNo)),
    db().select().from(paymentAttempts).where(eq(paymentAttempts.orderId, id)).orderBy(asc(paymentAttempts.createdAt)),
    db().select().from(payments).where(eq(payments.orderId, id)).orderBy(asc(payments.createdAt)),
    db().select().from(refunds).where(eq(refunds.orderId, id)).orderBy(asc(refunds.createdAt)),
    db().select().from(returns).where(eq(returns.orderId, id)).orderBy(asc(returns.createdAt)),
    db().select().from(shipments).where(eq(shipments.orderId, id)).orderBy(asc(shipments.createdAt)),
    db().select().from(orderEvents).where(eq(orderEvents.orderId, id)).orderBy(asc(orderEvents.createdAt)),
    db().select().from(emailDeliveries).where(eq(emailDeliveries.orderId, id)).orderBy(asc(emailDeliveries.createdAt)),
    db().select().from(fulfillmentRequests).where(eq(fulfillmentRequests.orderId, id)),
    db().select().from(auditLog).where(and(eq(auditLog.entityType, "order"), eq(auditLog.entityId, id))).orderBy(desc(auditLog.createdAt)).limit(50),
  ]);
  const pevents = await db().select().from(providerEvents).where(eq(providerEvents.orderId, id)).orderBy(asc(providerEvents.receivedAt));
  const rlines = rets.length ? await db().select().from(returnLines).where(inArray(returnLines.returnId, rets.map((r) => r.id))) : [];
  const variantSkus = lines.length
    ? await db().select().from(skus).where(inArray(skus.variantId, (await db().select({ v: skus.variantId }).from(skus).where(inArray(skus.id, lines.map((l) => l.skuId).filter((x): x is string => Boolean(x))))).map((x) => x.v)))
    : [];
  const primary = pays.find((p) => p.status === "succeeded");
  const refunded = refs.filter((r) => r.paymentId === primary?.id && (r.status === "succeeded" || r.status === "pending")).reduce((n, r) => n + r.amountMinor, 0);
  const refundable = primary ? primary.amountMinor - refunded : 0;
  const cur = o.currency;
  const adapter = fulfillmentAdapter();
  const canFulfil = can(admin.role, "orders:fulfil");
  const canRefund = can(admin.role, "refunds:issue");
  const canReturns = can(admin.role, "returns:write");
  const canEdit = can(admin.role, "orders:edit");
  const blocked = o.reviewReasons.some((r) => r.blocksFulfillment && !r.resolvedAt);

  return (
    <Page
      title={o.number}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <Status value={o.paymentStatus} /> <Status value={o.fulfillmentStatus} /> {o.returnStatus !== "none" ? <Status value={o.returnStatus} /> : null}{" "}
          {o.refundStatus !== "none" ? <Status value={o.refundStatus} /> : null} {o.reviewStatus === "needs_review" ? <Status value="needs_review" /> : null}
          {o.isTest ? <Badge>test order</Badge> : null}
          <span>Placed {dt(o.createdAt)}</span>
          {o.paidAt ? <span>· paid {dt(o.paidAt)}</span> : null}
        </span>
      }
      actions={
        <>
          <Link className="a-btn" href={`/admin/orders/${o.id}/packing-slip`}>
            Packing slip
          </Link>
          <Link className="a-btn" href={`/admin/orders/${o.id}/supplier-sheet`}>
            Supplier sheet
          </Link>
          <Link className="a-btn" href="/admin/orders">
            All orders
          </Link>
        </>
      }
    >
      <div id="top" />
      <Flash sp={sp} />
      {o.reviewReasons.length ? (
        <div className="mb-6 space-y-3">
          {o.reviewReasons.map((r, i) => (
            <div key={i} className={`rounded border p-4 text-sm ${r.resolvedAt ? "border-neutral-200 bg-neutral-50 text-neutral-500" : "border-red-300 bg-red-50"}`}>
              <p className="font-bold">
                {r.code.replace(/_/g, " ")} {r.blocksFulfillment && !r.resolvedAt ? "— blocks fulfilment" : ""}
              </p>
              <p>{r.message}</p>
              <p className="text-xs text-neutral-500">
                Raised {new Date(r.at).toLocaleString("en-GB")}
                {r.resolvedAt ? ` · resolved by ${r.resolvedBy} ${new Date(r.resolvedAt).toLocaleString("en-GB")}` : ""}
              </p>
              {!r.resolvedAt && canEdit ? (
                <form action={A.resolveReviewAction} className="mt-2 flex gap-2">
                  <input type="hidden" name="orderId" value={o.id} />
                  <input type="hidden" name="index" value={i} />
                  <input name="note" className="a-input" placeholder="How was this resolved? (e.g. refunded duplicate payment)" />
                  <Submit className="a-btn">Resolve</Submit>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Card title="Items & print instructions">
            <table className="a-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th>Production details</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.lineNo}</td>
                    <td>
                      <p className="font-semibold">
                        {l.productName} × {l.qty}
                      </p>
                      <p>
                        {l.variantLabel} · <strong>{l.size}</strong>
                      </p>
                      <p className="font-mono text-xs text-neutral-500">{l.skuCode}</p>
                      <p className="text-xs">
                        {l.fulfillmentMode === "made_to_order" ? <Badge tone="blue">made to order</Badge> : <Badge>stocked</Badge>}{" "}
                        {l.withdrawalRule === "personalized_exempt" ? <Badge tone="amber">no change-of-mind returns</Badge> : null}
                      </p>
                    </td>
                    <td className="text-xs">
                      {l.prints.map((p) => (
                        <p key={`${p.code}-${p.placement}`}>
                          {p.placement}: <span className="font-mono">{p.code} v{p.version}</span>
                          {p.method ? ` · ${p.method}` : ""}
                        </p>
                      ))}
                      {l.personalization ? (
                        <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2">
                          <p className="font-bold">LOCKER TAG — print exactly:</p>
                          <p className="font-mono text-base">{Object.entries(l.personalization.fields).map(([k, v]) => `${k}: "${v}"`).join("  ")}</p>
                          <p>
                            Font {l.personalization.font.name} ({l.personalization.font.id}) v{l.personalization.font.version} · colour {l.personalization.color.name} {l.personalization.color.hex}
                          </p>
                          <p>
                            {l.personalization.placement} · area {l.personalization.areaMm.widthMm}×{l.personalization.areaMm.heightMm} mm, {l.personalization.areaMm.offsetFromCollarMm} mm below collar · template {l.personalization.templateCode} v{l.personalization.templateVersion}
                          </p>
                          <p>Spelling confirmed by customer {new Date(l.personalization.approvedAt).toLocaleString("en-GB")}</p>
                        </div>
                      ) : null}
                    </td>
                    <td className="text-right">
                      <Money minor={l.lineTotalMinor} currency={cur} />
                      {l.discountMinor ? <p className="text-xs text-neutral-500">−{formatMoney(l.discountMinor, cur)} discount</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-4 grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
              <dt>Subtotal</dt>
              <dd className="text-right">
                <Money minor={o.subtotalMinor} currency={cur} />
              </dd>
              {o.pricingSnapshot.discounts.map((d) => (
                <Fragment key={d.ref}>
                  <dt>{d.label}</dt>
                  <dd className="text-right">−{formatMoney(d.amountMinor, cur)}</dd>
                </Fragment>
              ))}
              <dt>Shipping ({o.shippingMethod.name}, {o.shippingMethod.carrier})</dt>
              <dd className="text-right">
                <Money minor={o.shippingMinor} currency={cur} />
              </dd>
              <dt className="font-bold">Total</dt>
              <dd className="text-right font-bold">
                <Money minor={o.totalMinor} currency={cur} />
              </dd>
              {o.taxSnapshot.lines.map((t) => (
                <Fragment key={t.label}>
                  <dt className="text-xs text-neutral-500">{t.label} (included)</dt>
                  <dd className="text-right text-xs text-neutral-500">{formatMoney(t.taxMinor, cur)}</dd>
                </Fragment>
              ))}
            </dl>
          </Card>

          <Card title="Fulfilment">
            <p className="mb-3 text-sm">
              Status: <Status value={o.fulfillmentStatus} /> · Provider: {adapter.label} —{" "}
              {adapter.connection() === "not_connected" ? <Badge tone="grey">Not connected</Badge> : adapter.connection() === "manual" ? <Badge>manual</Badge> : <Badge tone="green">connected</Badge>}
            </p>
            {frs.map((f) => (
              <p key={f.id} className="mb-2 text-sm">
                Supplier order ({f.provider}): <Status value={f.status} /> {f.providerRef ? <span className="font-mono">ref {f.providerRef}</span> : null} {f.error ? <span className="text-red-700">{f.error}</span> : null}
              </p>
            ))}
            {canFulfil && o.paymentStatus === "paid" && !["shipped", "delivered", "cancelled"].includes(o.fulfillmentStatus) ? (
              <div className="space-y-4">
                {blocked ? <p className="text-sm font-semibold text-red-700">Resolve the review flag before fulfilling.</p> : null}
                <div className="flex flex-wrap gap-2">
                  {o.fulfillmentStatus === "unfulfilled" ? (
                    <form action={A.fulfilAction}>
                      <input type="hidden" name="orderId" value={o.id} />
                      <input type="hidden" name="to" value="in_production" />
                      <Submit className="a-btn">Mark in production</Submit>
                    </form>
                  ) : null}
                  {o.fulfillmentStatus !== "packed" ? (
                    <form action={A.fulfilAction}>
                      <input type="hidden" name="orderId" value={o.id} />
                      <input type="hidden" name="to" value="packed" />
                      <Submit className="a-btn">Mark packed</Submit>
                    </form>
                  ) : null}
                </div>
                <form action={A.supplierRefAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="orderId" value={o.id} />
                  <label className="text-sm">
                    <span className="a-label">Supplier order reference (manual)</span>
                    <input name="reference" className="a-input" placeholder="e.g. PO-2291" />
                  </label>
                  <Submit className="a-btn">Record</Submit>
                </form>
                <form action={A.shipAction} className="grid gap-3 rounded border border-neutral-200 p-3 sm:grid-cols-2">
                  <input type="hidden" name="orderId" value={o.id} />
                  <label>
                    <span className="a-label">Carrier</span>
                    <select name="carrierId" className="a-input" defaultValue="posten-bring">
                      {CARRIERS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="a-label">Carrier name (if Other)</span>
                    <input name="carrierName" className="a-input" />
                  </label>
                  <label>
                    <span className="a-label">Tracking number</span>
                    <input name="trackingNumber" className="a-input font-mono" />
                  </label>
                  <label>
                    <span className="a-label">Tracking URL (optional; auto for Posten/Bring)</span>
                    <input name="trackingUrl" className="a-input" placeholder="https://…" />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="notify" defaultChecked /> Email the customer
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="untracked" /> Ship without tracking
                  </label>
                  <div className="sm:col-span-2">
                    <Submit>Mark shipped</Submit>
                  </div>
                </form>
              </div>
            ) : null}
            {o.fulfillmentStatus === "shipped" && canFulfil ? (
              <form action={A.fulfilAction} className="mt-3">
                <input type="hidden" name="orderId" value={o.id} />
                <input type="hidden" name="to" value="delivered" />
                <Submit className="a-btn">Mark delivered</Submit>
              </form>
            ) : null}
            {ships.length ? (
              <table className="a-table mt-4">
                <thead>
                  <tr>
                    <th>Shipment</th>
                    <th>Status</th>
                    <th>Carrier / tracking</th>
                    <th>Shipped</th>
                  </tr>
                </thead>
                <tbody>
                  {ships.map((s) => (
                    <tr key={s.id}>
                      <td>{s.kind}</td>
                      <td>
                        <Status value={s.status} />
                      </td>
                      <td>
                        {s.carrier ?? "—"} {s.trackingNumber ? <span className="font-mono">{s.trackingNumber}</span> : null}{" "}
                        {s.trackingUrl ? (
                          <a href={s.trackingUrl} className="underline" target="_blank" rel="noreferrer">
                            track
                          </a>
                        ) : null}
                      </td>
                      <td>{dt(s.shippedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </Card>

          <Card title="Payments">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Attempt</th>
                  <th>Status</th>
                  <th>Provider reference</th>
                  <th>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => {
                  const url = a.providerRef ? getProvider(a.provider).dashboardUrl?.("checkout", a.providerRef) : null;
                  return (
                    <tr key={a.id}>
                      <td>
                        {a.provider}
                        <p className="text-xs text-neutral-500">{dt(a.createdAt)}</p>
                      </td>
                      <td>
                        <Status value={a.status} />
                        {a.failureReason ? <p className="text-xs text-neutral-500">{a.failureReason}</p> : null}
                      </td>
                      <td className="font-mono text-xs">{url ? <a href={url} target="_blank" rel="noreferrer" className="underline">{a.providerRef}</a> : (a.providerRef ?? "—")}</td>
                      <td>
                        <Money minor={a.amountMinor} currency={a.currency} />
                      </td>
                      <td>
                        {canEdit && a.providerRef ? (
                          <form action={A.reconcileAction}>
                            <input type="hidden" name="orderId" value={o.id} />
                            <input type="hidden" name="attemptId" value={a.id} />
                            <Submit className="a-btn">Check with provider</Submit>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {pays.length ? (
              <table className="a-table mt-4">
                <thead>
                  <tr>
                    <th>Payment / receipt reference</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>Captured</th>
                  </tr>
                </thead>
                <tbody>
                  {pays.map((p) => {
                    const url = getProvider(p.provider).dashboardUrl?.("payment", p.providerPaymentId);
                    return (
                      <tr key={p.id}>
                        <td className="font-mono text-xs">
                          {p.provider}: {url ? <a className="underline" href={url} target="_blank" rel="noreferrer">{p.providerPaymentId}</a> : p.providerPaymentId}
                        </td>
                        <td>
                          <Status value={p.status} />
                        </td>
                        <td>
                          <Money minor={p.amountMinor} currency={p.currency} />
                        </td>
                        <td>{dt(p.capturedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
            {pevents.length ? (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer font-semibold">Provider events ({pevents.length})</summary>
                <ul className="mt-2 space-y-1">
                  {pevents.map((e) => (
                    <li key={e.id} className="font-mono">
                      {dt(e.receivedAt)} · {e.provider} · {e.type} · {e.status}
                      {e.error ? ` · ${e.error}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </Card>

          <Card title="Refunds">
            {refs.length ? (
              <table className="a-table mb-4">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Reason / by</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {refs.map((r) => (
                    <tr key={r.id}>
                      <td>{dt(r.createdAt)}</td>
                      <td>
                        <Money minor={r.amountMinor} currency={r.currency} />
                      </td>
                      <td>
                        <Status value={r.status} />
                        {r.providerRefundId ? <p className="font-mono text-xs">{r.providerRefundId}</p> : null}
                        {r.failureReason ? <p className="text-xs text-red-700">{r.failureReason}</p> : null}
                      </td>
                      <td>
                        {r.reason}
                        <p className="text-xs text-neutral-500">{r.requestedBy}</p>
                      </td>
                      <td>
                        {r.status === "pending" && canRefund ? (
                          <form action={A.retryRefundAction}>
                            <input type="hidden" name="orderId" value={o.id} />
                            <input type="hidden" name="refundId" value={r.id} />
                            <Submit className="a-btn">Retry (same key)</Submit>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mb-4 text-sm text-neutral-500">No refunds.</p>
            )}
            {canRefund && primary && refundable > 0 ? (
              <form action={A.refundAction} className="grid gap-3 rounded border border-neutral-200 p-3 sm:grid-cols-2">
                <input type="hidden" name="orderId" value={o.id} />
                <input type="hidden" name="key" value={`refund:${o.id}:${randomUUID()}`} />
                <label>
                  <span className="a-label">Payment</span>
                  <select name="paymentId" className="a-input">
                    {pays
                      .filter((p) => p.status === "succeeded" || p.status === "duplicate")
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.provider} {p.providerPaymentId.slice(0, 18)}… ({p.status}, {formatMoney(p.amountMinor, p.currency)})
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span className="a-label">Amount ({cur}) — up to {formatMoney(refundable, cur)} on the main payment</span>
                  <input name="amount" className="a-input" defaultValue={(refundable / 100).toFixed(2)} inputMode="decimal" />
                </label>
                <label>
                  <span className="a-label">Reason</span>
                  <select name="reason" className="a-input">
                    <option>Return received</option>
                    <option>Cancelled before shipping</option>
                    <option>Faulty item (reklamasjon)</option>
                    <option value="duplicate">Duplicate payment</option>
                    <option>Goodwill / other</option>
                  </select>
                </label>
                <label>
                  <span className="a-label">Note (internal)</span>
                  <input name="note" className="a-input" />
                </label>
                <label className="flex items-start gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" name="confirm" className="mt-1" /> I confirm this refund goes back to the customer&apos;s original payment method through {primary.provider}. This can&apos;t be undone.
                </label>
                <div className="sm:col-span-2">
                  <Submit className="a-btn a-btn-danger">Issue refund</Submit>
                </div>
              </form>
            ) : null}
          </Card>

          <Card title="Returns & exchanges">
            {rets.map((r) => (
              <div key={r.id} className="mb-4 rounded border border-neutral-200 p-3 text-sm">
                <p className="font-semibold">
                  {r.rmaNumber} · {r.type} · <Status value={r.status} />
                </p>
                <p className="text-neutral-600">
                  {r.reason}
                  {r.customerNote ? ` — “${r.customerNote}”` : ""}
                </p>
                <ul className="mt-2 text-xs">
                  {rlines
                    .filter((x) => x.returnId === r.id)
                    .map((x) => {
                      const ol = lines.find((l) => l.id === x.orderLineId);
                      const ex = variantSkus.find((v) => v.id === x.exchangeSkuId);
                      return (
                        <li key={x.id}>
                          {ol?.productName} {ol?.size} × {x.qty}
                          {ex ? ` → exchange for ${ex.size}` : ""}
                          {x.condition ? ` · condition: ${x.condition}` : ""}
                          {x.restock ? " · restocked" : ""}
                        </li>
                      );
                    })}
                </ul>
                {canReturns && r.status === "requested" ? (
                  <form action={A.receiveReturnAction} className="mt-3 space-y-2">
                    <input type="hidden" name="orderId" value={o.id} />
                    <input type="hidden" name="returnId" value={r.id} />
                    {rlines
                      .filter((x) => x.returnId === r.id)
                      .map((x) => {
                        const ol = lines.find((l) => l.id === x.orderLineId);
                        return (
                          <div key={x.id} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="returnLineId" value={x.id} />
                            <span className="w-40">
                              {ol?.productName} {ol?.size}
                            </span>
                            <input name={`condition_${x.id}`} className="a-input max-w-[180px]" placeholder="Condition" />
                            <label className="flex items-center gap-1 text-xs">
                              <input type="checkbox" name={`restock_${x.id}`} defaultChecked={!ol?.personalization} disabled={Boolean(ol?.personalization) || ol?.fulfillmentMode !== "stocked"} /> Restock
                            </label>
                          </div>
                        );
                      })}
                    <Submit className="a-btn">Mark received</Submit>
                  </form>
                ) : null}
                {canReturns && r.type === "exchange" && r.status !== "closed" && r.status !== "rejected" && !ships.some((s) => s.returnId === r.id) ? (
                  <form action={A.shipExchangeAction} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="orderId" value={o.id} />
                    <input type="hidden" name="returnId" value={r.id} />
                    <select name="carrierId" className="a-input max-w-[160px]">
                      {CARRIERS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <input name="trackingNumber" className="a-input max-w-[200px]" placeholder="Tracking" />
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" name="notify" defaultChecked /> Email
                    </label>
                    <Submit className="a-btn">Ship replacement</Submit>
                  </form>
                ) : null}
                {canReturns && (r.status === "received" || r.status === "requested") ? (
                  <form action={A.closeReturnAction} className="mt-3 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="orderId" value={o.id} />
                    <input type="hidden" name="returnId" value={r.id} />
                    <select name="status" className="a-input max-w-[140px]">
                      <option value="closed">Close</option>
                      <option value="rejected">Reject</option>
                    </select>
                    <input name="note" className="a-input max-w-xs" placeholder="Note" />
                    <Submit className="a-btn">Update</Submit>
                  </form>
                ) : null}
                <p className="mt-2 text-xs text-neutral-500">Refunds are issued separately in the Refunds card (return status and refund status are tracked independently).</p>
              </div>
            ))}
            {canReturns && o.paymentStatus === "paid" ? (
              <details>
                <summary className="cursor-pointer text-sm font-semibold">Record a return or exchange</summary>
                <form action={A.createReturnAction} className="mt-3 space-y-3">
                  <input type="hidden" name="orderId" value={o.id} />
                  <div className="flex flex-wrap gap-3">
                    <label>
                      <span className="a-label">Type</span>
                      <select name="type" className="a-input">
                        <option value="return">Return (refund)</option>
                        <option value="exchange">Exchange (size swap)</option>
                      </select>
                    </label>
                    <label className="flex-1">
                      <span className="a-label">Reason</span>
                      <input name="reason" className="a-input" placeholder="e.g. Too small, change of mind, faulty" />
                    </label>
                  </div>
                  <label className="block">
                    <span className="a-label">Customer note</span>
                    <input name="customerNote" className="a-input" />
                  </label>
                  <table className="a-table">
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.id}>
                          <td>
                            <input type="hidden" name="lineId" value={l.id} />
                            {l.productName} {l.variantLabel} {l.size} (ordered {l.qty})
                            {l.withdrawalRule === "personalized_exempt" ? <p className="text-xs text-amber-700">Personalised — change-of-mind returns excluded; faults still apply.</p> : null}
                          </td>
                          <td>
                            <input name={`qty_${l.id}`} type="number" min={0} max={l.qty} defaultValue={0} className="a-input w-20" />
                          </td>
                          <td>
                            <select name={`exchange_${l.id}`} className="a-input">
                              <option value="">— exchange size —</option>
                              {variantSkus
                                .filter((v) => v.variantId === variantSkus.find((x) => x.id === l.skuId)?.variantId && v.id !== l.skuId)
                                .map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.size}
                                  </option>
                                ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Submit>Record</Submit>
                </form>
              </details>
            ) : null}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Customer">
            <p className="text-sm">{o.email}</p>
            <p className="mt-3 text-sm">
              {o.shippingAddress.name}
              <br />
              {o.shippingAddress.line1}
              {o.shippingAddress.line2 ? `, ${o.shippingAddress.line2}` : ""}
              <br />
              {o.shippingAddress.postalCode} {o.shippingAddress.city}, {o.shippingAddress.country}
              {o.shippingAddress.phone ? (
                <>
                  <br />
                  {o.shippingAddress.phone}
                </>
              ) : null}
            </p>
            <p className="mt-3 text-xs text-neutral-500">
              {o.shippingMethod.name} · {o.shippingMethod.carrier} · terms {o.termsVersion} accepted {dt(o.termsAcceptedAt)}
            </p>
            {o.customerNote ? <p className="mt-3 rounded bg-amber-50 p-2 text-sm">Customer note: {o.customerNote}</p> : null}
            {canEdit ? (
              <form action={A.noteAction} className="mt-4 space-y-2">
                <input type="hidden" name="orderId" value={o.id} />
                <label className="block">
                  <span className="a-label">Internal note</span>
                  <textarea name="note" className="a-input min-h-16" defaultValue={o.internalNote ?? ""} />
                </label>
                <Submit className="a-btn">Save note</Submit>
              </form>
            ) : null}
          </Card>

          {canRefund && o.paymentStatus !== "cancelled" && o.paymentStatus !== "expired" && !["shipped", "delivered", "cancelled"].includes(o.fulfillmentStatus) ? (
            <Card title="Cancel order">
              <form action={A.cancelAction} className="space-y-2">
                <input type="hidden" name="orderId" value={o.id} />
                <input type="hidden" name="key" value={`cancel-refund:${o.id}:${randomUUID()}`} />
                <input name="reason" className="a-input" placeholder="Reason (shown to the customer)" />
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="confirm" className="mt-1" />
                  {o.paymentStatus === "paid" ? `Cancel, return stock and refund ${formatMoney(o.totalMinor, cur)} in full.` : "Cancel this unpaid order and release its stock."}
                </label>
                <Submit className="a-btn a-btn-danger">Cancel order</Submit>
              </form>
            </Card>
          ) : null}

          <Card title="Emails">
            <ul className="space-y-1 text-sm">
              {mails.map((m) => (
                <li key={m.id}>
                  <Status value={m.status} /> {m.template.replace(/_/g, " ")} → {m.toAddress} <span className="text-xs text-neutral-500">{dt(m.sentAt ?? m.createdAt)}</span>
                  {m.error ? <p className="text-xs text-red-700">{m.error}</p> : null}
                </li>
              ))}
              {mails.length === 0 ? <li className="text-neutral-500">None yet.</li> : null}
            </ul>
            {canEdit && o.paymentStatus === "paid" ? (
              <form action={A.resendEmailAction} className="mt-3">
                <input type="hidden" name="orderId" value={o.id} />
                <input type="hidden" name="template" value="email.order_confirmation" />
                <Submit className="a-btn">Send a fresh order link</Submit>
              </form>
            ) : null}
            <Link href="/admin/jobs" className="mt-3 block text-xs underline">
              Jobs & email queue
            </Link>
          </Card>

          <Card title="Timeline">
            <ol className="space-y-2 text-sm">
              {events.map((e) => (
                <li key={e.id}>
                  <span className="text-xs text-neutral-500">{dt(e.createdAt)}</span>
                  <p>{e.message}</p>
                </li>
              ))}
            </ol>
          </Card>

          <Card title="Audit">
            <ol className="space-y-1 text-xs">
              {audits.map((x) => (
                <li key={x.id}>
                  {dt(x.createdAt)} · {x.actorEmail} · {x.summary}
                </li>
              ))}
              {audits.length === 0 ? <li className="text-neutral-500">No staff actions yet.</li> : null}
            </ol>
          </Card>
        </div>
      </div>
    </Page>
  );
}

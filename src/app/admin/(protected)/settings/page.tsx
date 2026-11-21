import { asc } from "drizzle-orm";
import { db } from "@/server/db";
import { discountCodes, shippingRates, shippingZones } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { providerStatus } from "@/server/payments";
import { fulfillmentAdapter } from "@/server/fulfillment";
import { appUrl, env } from "@/server/env";
import { CARRIERS } from "@/config/carriers";
import { Badge, Card, Flash, Page } from "@/components/admin/ui";
import { Submit } from "@/components/admin/submit";
import * as A from "./actions";

export const dynamic = "force-dynamic";

const conn = (m: string) =>
  m === "live" ? <Badge tone="green">Live</Badge> : m === "sandbox" ? <Badge tone="blue">Sandbox</Badge> : m === "connected" ? <Badge tone="green">Connected</Badge> : m === "manual" ? <Badge>Manual</Badge> : <Badge tone="amber">Not connected</Badge>;

export default async function SettingsAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("settings:write");
  const sp = await searchParams;
  const s = await getSettings();
  const zones = await db().select().from(shippingZones).orderBy(asc(shippingZones.name));
  const rates = await db().select().from(shippingRates).orderBy(asc(shippingRates.sort));
  const codes = await db().select().from(discountCodes).orderBy(asc(discountCodes.code));
  const ps = providerStatus();
  const ff = fulfillmentAdapter();
  const e = env();
  return (
    <Page title="Settings" subtitle="Business, tax, shipping and provider configuration. Production checkout stays closed until the required items on Launch readiness pass.">
      <Flash sp={sp} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Store & market" id="store">
          <form action={A.saveStoreAction} className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="a-label">Market (country)</span>
              <input name="market" className="a-input" defaultValue={s.store.market} />
            </label>
            <label>
              <span className="a-label">Currency</span>
              <input name="currency" className="a-input" defaultValue={s.store.currency} />
            </label>
            <label>
              <span className="a-label">Locale</span>
              <input name="locale" className="a-input" defaultValue={s.store.locale} />
            </label>
            <label>
              <span className="a-label">Time zone</span>
              <input name="timeZone" className="a-input" defaultValue={s.store.timeZone} />
            </label>
            <label className="sm:col-span-2">
              <span className="a-label">Ship to (country codes; each needs an approved rate)</span>
              <input name="shipsTo" className="a-input" defaultValue={s.store.shipsTo.join(", ")} />
            </label>
            <div className="sm:col-span-2">
              <Submit>Save</Submit>
            </div>
          </form>
        </Card>

        <Card title="Legal seller identity (receipts, policies)" id="seller">
          <form action={A.saveSellerAction} className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="a-label">Legal name</span>
              <input name="legalName" className="a-input" defaultValue={s.seller.legalName} />
            </label>
            <label>
              <span className="a-label">Trading name</span>
              <input name="tradingName" className="a-input" defaultValue={s.seller.tradingName} />
            </label>
            <label>
              <span className="a-label">Organisation number</span>
              <input name="orgNumber" className="a-input" defaultValue={s.seller.orgNumber} />
            </label>
            <label>
              <span className="a-label">VAT number (if registered)</span>
              <input name="vatNumber" className="a-input" defaultValue={s.seller.vatNumber} />
            </label>
            <label className="sm:col-span-2">
              <span className="a-label">Address (one line per row)</span>
              <textarea name="address" className="a-input min-h-20" defaultValue={s.seller.addressLines.join("\n")} />
            </label>
            <label>
              <span className="a-label">Country</span>
              <input name="country" className="a-input" defaultValue={s.seller.country} />
            </label>
            <label>
              <span className="a-label">Contact email</span>
              <input name="email" type="email" className="a-input" defaultValue={s.seller.email} />
            </label>
            <label>
              <span className="a-label">Phone</span>
              <input name="phone" className="a-input" defaultValue={s.seller.phone} />
            </label>
            <div className="sm:col-span-2">
              <Submit>Save</Submit>
            </div>
          </form>
        </Card>

        <Card title="Tax" id="tax">
          <form action={A.saveTaxAction} className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="a-label">Mode</span>
              <select name="mode" className="a-input" defaultValue={s.tax.mode}>
                <option value="unconfigured">Not decided (production checkout blocked)</option>
                <option value="vat_inclusive">VAT registered — prices include VAT</option>
                <option value="not_registered">Not VAT registered — no VAT charged</option>
              </select>
            </label>
            <label>
              <span className="a-label">Label</span>
              <input name="label" className="a-input" defaultValue={s.tax.label} />
            </label>
            <label>
              <span className="a-label">Rate %</span>
              <input name="ratePct" className="a-input" defaultValue={(s.tax.rateBps / 100).toString()} />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="shippingTaxable" defaultChecked={s.tax.shippingTaxable} /> Shipping is taxed at the same rate
            </label>
            <label className="sm:col-span-2">
              <span className="a-label">Duties / import note shown at checkout (optional)</span>
              <input name="dutiesNote" className="a-input" defaultValue={s.tax.dutiesNote} />
            </label>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="confirm" className="mt-1" /> My accountant has confirmed this setup.
            </label>
            <div className="sm:col-span-2">
              <Submit>Save</Submit>
            </div>
          </form>
        </Card>

        <Card title="Checkout" id="checkout">
          <form action={A.saveCheckoutAction} className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="a-label">Terms version accepted at checkout</span>
              <input name="termsVersion" className="a-input" defaultValue={s.checkout.termsVersion} />
            </label>
            <label>
              <span className="a-label">Shipping quote valid (minutes)</span>
              <input name="quoteMinutes" type="number" className="a-input" defaultValue={s.checkout.quoteMinutes} />
            </label>
            <label>
              <span className="a-label">Payment session (minutes, ≥ 30)</span>
              <input name="attemptMinutes" type="number" className="a-input" defaultValue={s.checkout.attemptMinutes} />
            </label>
            <label>
              <span className="a-label">Hold stock (minutes)</span>
              <input name="reservationMinutes" type="number" className="a-input" defaultValue={s.checkout.reservationMinutes} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="stripeEnabled" defaultChecked={s.checkout.stripeEnabled} /> Offer card (Stripe Checkout)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="paypalEnabled" defaultChecked={s.checkout.paypalEnabled} /> Offer PayPal
            </label>
            <div className="sm:col-span-2">
              <Submit>Save</Submit>
            </div>
          </form>
        </Card>

        <Card title="Customer support" id="support">
          <form action={A.saveSupportAction} className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="a-label">Support email</span>
              <input name="supportEmail" type="email" className="a-input" defaultValue={s.support.supportEmail} />
            </label>
            <label>
              <span className="a-label">Order link valid (days)</span>
              <input name="orderLinkDays" type="number" className="a-input" defaultValue={s.support.orderLinkDays} />
            </label>
            <label>
              <span className="a-label">Withdrawal period (days)</span>
              <input name="withdrawalDays" type="number" className="a-input" defaultValue={s.support.withdrawalDays} />
            </label>
            <label>
              <span className="a-label">Dispatch note (only if true)</span>
              <input name="dispatchNote" className="a-input" defaultValue={s.support.dispatchNote} placeholder="e.g. Packed in Oslo within 2 working days" />
            </label>
            <label className="sm:col-span-2">
              <span className="a-label">Return shipping (shown on the returns page)</span>
              <input name="returnShippingNote" className="a-input" defaultValue={s.support.returnShippingNote} placeholder="e.g. You pay return postage unless the item is faulty." />
            </label>
            <div className="sm:col-span-2">
              <Submit>Save</Submit>
            </div>
          </form>
        </Card>

        <Card title="Features" id="features">
          <form action={A.saveFeaturesAction} className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="personalization" defaultChecked={s.features.personalization} /> Locker Tag personalisation (still hidden in production until its template is approved)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="dropSignup" defaultChecked={s.features.dropSignup} /> Drop-alert email sign-up (double opt-in)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="productFeed" defaultChecked={s.features.productFeed} /> Public product feed at /feed/products.xml
            </label>
            <Submit>Save</Submit>
          </form>
        </Card>
      </div>

      <div className="mt-6" />
      <Card title="Shipping zones & rates" id="shipping">
        <p className="mb-4 text-sm text-neutral-600">Customers only see approved, active rates for their country in production. A delivery estimate is shown only when both day numbers are set.</p>
        {zones.map((z) => (
          <div key={z.id} className="mb-6 border-b border-neutral-200 pb-6">
            <form action={A.zoneAction} className="mb-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="zoneId" value={z.id} />
              <label>
                <span className="a-label">Zone</span>
                <input name="name" className="a-input" defaultValue={z.name} />
              </label>
              <label>
                <span className="a-label">Countries</span>
                <input name="countries" className="a-input" defaultValue={z.countries.join(", ")} />
              </label>
              <label className="flex items-center gap-1 pb-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={z.active} /> active
              </label>
              <Submit className="a-btn">Save zone</Submit>
            </form>
            <p className="mb-1 text-xs text-neutral-500">Name · carrier · service · price · currency · free over · delivery days min–max · sort</p>
            <table className="a-table">
              <tbody>
                {[...rates.filter((r) => r.zoneId === z.id), null].map((r) => (
                  <tr key={r?.id ?? "new"}>
                    <td>
                      <form action={A.rateAction} className="flex flex-wrap items-center gap-1">
                        <input type="hidden" name="zoneId" value={z.id} />
                        <input type="hidden" name="rateId" value={r?.id ?? ""} />
                        <input name="name" className="a-input w-40" defaultValue={r?.name ?? ""} placeholder={r ? "" : "New rate name"} aria-label="Rate name" />
                        <select name="carrier" className="a-input w-40" defaultValue={r?.carrier ?? "Posten/Bring"} aria-label="Carrier">
                          {[...CARRIERS.map((c) => c.name), ...(r && !CARRIERS.some((c) => c.name === r.carrier) ? [r.carrier] : [])].map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                        <input name="service" className="a-input w-32" defaultValue={r?.service ?? ""} placeholder="service" aria-label="Service" />
                        <input name="price" className="a-input w-20" defaultValue={r ? (r.priceMinor / 100).toString() : ""} placeholder="price" aria-label="Price" />
                        <input name="currency" className="a-input w-16" defaultValue={r?.currency ?? s.store.currency} aria-label="Currency" />
                        <input name="freeOver" className="a-input w-24" defaultValue={r?.freeOverMinor != null ? (r.freeOverMinor / 100).toString() : ""} placeholder="free over" aria-label="Free over" />
                        <input name="minDays" type="number" className="a-input w-16" defaultValue={r?.minDays ?? ""} placeholder="min" aria-label="Min days" />
                        <input name="maxDays" type="number" className="a-input w-16" defaultValue={r?.maxDays ?? ""} placeholder="max" aria-label="Max days" />
                        <input name="sort" type="number" className="a-input w-14" defaultValue={r?.sort ?? 0} aria-label="Sort" />
                        <label className="flex items-center gap-1 text-xs">
                          <input type="checkbox" name="active" defaultChecked={r?.active ?? true} /> active
                        </label>
                        <label className="flex items-center gap-1 text-xs">
                          <input type="checkbox" name="approved" defaultChecked={r?.approved ?? false} /> approved
                        </label>
                        <label className="flex items-center gap-1 text-xs">
                          <input type="checkbox" name="confirm" /> price &amp; estimate agreed with carrier
                        </label>
                        <Submit className="a-btn">{r ? "Save" : "Add rate"}</Submit>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <form action={A.zoneAction} className="flex flex-wrap items-end gap-2">
          <label>
            <span className="a-label">New zone</span>
            <input name="name" className="a-input" placeholder="e.g. Nordics" />
          </label>
          <label>
            <span className="a-label">Countries</span>
            <input name="countries" className="a-input" placeholder="SE, DK, FI" />
          </label>
          <Submit className="a-btn">Add zone</Submit>
        </form>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Payment providers" id="payments">
          <table className="a-table">
            <tbody>
              <tr>
                <td>Stripe Checkout (cards)</td>
                <td>{conn(ps.stripe)}</td>
                <td className="text-xs">Webhook secret: {e.STRIPE_WEBHOOK_SECRET ? "set" : "not set"}</td>
              </tr>
              <tr>
                <td>PayPal Orders</td>
                <td>{conn(ps.paypal)}</td>
                <td className="text-xs">Webhook id: {e.PAYPAL_WEBHOOK_ID ? "set" : "not set"}</td>
              </tr>
              <tr>
                <td>Local payment simulator</td>
                <td>{ps.simulator === "enabled" ? <Badge tone="amber">Enabled (dev only)</Badge> : <Badge>Disabled</Badge>}</td>
                <td className="text-xs">Never available when APP_ENV=production</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-4 space-y-2 text-sm">
            <p>Keys live only in the server environment (never in this database). Webhook endpoints to register:</p>
            <p className="font-mono text-xs">
              Stripe: {appUrl("/api/webhooks/stripe")}
              <br />
              events: checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired, refund.created, refund.updated, refund.failed, charge.dispute.created
            </p>
            <p className="font-mono text-xs">
              PayPal: {appUrl("/api/webhooks/paypal")}
              <br />
              events: CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.PENDING, PAYMENT.CAPTURE.DENIED, PAYMENT.CAPTURE.DECLINED, PAYMENT.CAPTURE.REFUNDED, PAYMENT.CAPTURE.REVERSED, CUSTOMER.DISPUTE.CREATED
            </p>
          </div>
        </Card>
        <Card title="Fulfilment, email & storage" id="fulfilment">
          <table className="a-table">
            <tbody>
              <tr>
                <td>Fulfilment</td>
                <td>{conn(ff.connection())}</td>
                <td className="text-xs">{ff.label}</td>
              </tr>
              <tr>
                <td>Print-on-demand API</td>
                <td>{conn(e.POD_API_KEY && e.POD_API_BASE ? "connected" : "not_connected")}</td>
                <td className="text-xs">Adapter interface ready; no provider integrated</td>
              </tr>
              <tr>
                <td>Email</td>
                <td>{e.EMAIL_PROVIDER === "log" ? <Badge tone="amber">Log only</Badge> : <Badge tone="green">{e.EMAIL_PROVIDER}</Badge>}</td>
                <td className="text-xs">From: {e.EMAIL_FROM ?? "not set"}</td>
              </tr>
              <tr>
                <td>Media storage</td>
                <td>{e.STORAGE_DRIVER === "s3" ? <Badge tone="green">S3</Badge> : <Badge>Local disk</Badge>}</td>
                <td className="text-xs">{e.STORAGE_DRIVER === "s3" ? e.S3_BUCKET : e.STORAGE_LOCAL_DIR}</td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>

      <div className="mt-6" />
      <Card title="Discount codes" id="discounts">
        <table className="a-table">
          <tbody>
            {[...codes, null].map((c) => (
              <tr key={c?.id ?? "new"}>
                <td>
                  <form action={A.discountAction} className="flex flex-wrap items-center gap-1">
                    <input type="hidden" name="id" value={c?.id ?? ""} />
                    <input name="code" className="a-input w-32 font-mono" defaultValue={c?.code ?? ""} placeholder="CODE" aria-label="Code" />
                    <select name="kind" className="a-input w-28" defaultValue={c?.kind ?? "percent"} aria-label="Kind">
                      <option value="percent">percent</option>
                      <option value="amount">amount</option>
                    </select>
                    <input name="value" className="a-input w-20" defaultValue={c ? (c.kind === "percent" ? c.value / 100 : c.value / 100).toString() : ""} placeholder="value" aria-label="Value" />
                    <input name="currency" className="a-input w-16" defaultValue={c?.currency ?? ""} placeholder="NOK" aria-label="Currency" />
                    <input name="minSubtotal" className="a-input w-24" defaultValue={c ? (c.minSubtotalMinor / 100).toString() : ""} placeholder="min order" aria-label="Minimum order" />
                    <input name="usageLimit" type="number" className="a-input w-20" defaultValue={c?.usageLimit ?? ""} placeholder="limit" aria-label="Usage limit" />
                    <input name="startsAt" type="date" className="a-input w-36" defaultValue={c?.startsAt?.toISOString().slice(0, 10) ?? ""} aria-label="Starts" />
                    <input name="endsAt" type="date" className="a-input w-36" defaultValue={c?.endsAt?.toISOString().slice(0, 10) ?? ""} aria-label="Ends" />
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" name="active" defaultChecked={c?.active ?? true} /> active
                    </label>
                    {c ? <span className="text-xs text-neutral-500">used {c.usedCount}</span> : null}
                    <Submit className="a-btn">{c ? "Save" : "Add code"}</Submit>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Page>
  );
}

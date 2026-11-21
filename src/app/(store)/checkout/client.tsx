"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { quoteCheckoutAction, startPaymentAction, type CheckoutQuote } from "@/app/(store)/actions";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/components/store/store-context";

interface Props {
  countries: { code: string; name: string }[];
  providers: { card: { label: string; simulator: boolean } | null; paypal: { label: string; simulator: boolean } | null };
  withdrawalDays: number;
  dutiesNote: string;
  notice: string | null;
}

type Address = { name: string; line1: string; line2: string; postalCode: string; city: string; country: string; phone: string };

export function CheckoutClient({ countries, providers, withdrawalDays, dutiesNote, notice }: Props) {
  const { cart } = useStore();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [addr, setAddr] = useState<Address>({ name: "", line1: "", line2: "", postalCode: "", city: "", country: countries[0]?.code ?? "NO", phone: "" });
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [rateId, setRateId] = useState<string | null>(null);
  const [terms, setTerms] = useState(false);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(notice ? { tone: "info", text: notice } : null);
  const [shortages, setShortages] = useState<{ label: string; available: number }[] | null>(null);
  const [quoting, startQuote] = useTransition();
  const [paying, setPaying] = useState<"card" | "paypal" | null>(null);
  const lastQuoted = useRef("");

  const addressComplete = addr.name.trim().length > 1 && addr.line1.trim().length > 1 && addr.postalCode.trim().length >= 4 && addr.city.trim().length > 0;
  const key = JSON.stringify({ ...addr, rateId, lines: cart.lines.map((l) => [l.id, l.qty, l.skuId]), code: cart.discountCode });

  function requestQuote(force = false) {
    if (!addressComplete) return;
    if (!force && lastQuoted.current === key) return;
    lastQuoted.current = key;
    startQuote(async () => {
      const r = await quoteCheckoutAction({ address: addr, rateId });
      if (!r.ok) {
        setQuote(null);
        setErrors((e) => ({ ...e, ...(r.fieldErrors ?? {}) }));
        setMessage({ tone: "error", text: r.error });
        return;
      }
      setErrors((e) => {
        const n = { ...e };
        for (const k of ["name", "line1", "postalCode", "city", "country", "phone"]) delete n[k];
        return n;
      });
      setQuote(r.data);
      setRateId(r.data.selectedRateId);
    });
  }

  // Re-quote when the delivery destination, chosen rate or bag changes.
  useEffect(() => {
    if (!addressComplete) {
      setQuote(null);
      return;
    }
    const t = setTimeout(() => requestQuote(), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, addressComplete]);

  async function pay(choice: "card" | "paypal") {
    setMessage(null);
    setShortages(null);
    const e: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) e.email = "Enter a valid email address";
    if (!terms) e.terms = "Please accept the terms of sale";
    if (!quote) e.form = "Enter your delivery address to see delivery options";
    setErrors(e);
    if (Object.keys(e).length || !quote) {
      setMessage({ tone: "error", text: e.form ?? "Check the highlighted fields." });
      return;
    }
    setPaying(choice);
    const r = await startPaymentAction({
      email,
      address: addr,
      quoteId: quote.quoteId,
      choice,
      termsAccepted: terms,
      acknowledgedTotalMinor: quote.pricing.totalMinor,
      customerNote: note || null,
    });
    if (r.ok) {
      window.location.assign(r.redirectUrl);
      return;
    }
    setPaying(null);
    if (r.fieldErrors) setErrors(r.fieldErrors);
    if (r.code === "already_paid" && r.orderId) {
      router.push(`/checkout/complete?order=${r.orderId}`);
      return;
    }
    if (r.code === "out_of_stock") setShortages(r.shortages ?? []);
    if (r.code === "total_changed" || r.code === "quote_expired" || r.code === "quote_mismatch") requestQuote(true);
    setMessage({ tone: "error", text: r.message });
  }

  if (cart.lines.length === 0) {
    return (
      <div className="py-12">
        {message ? <p className="mb-4 text-bone-dim">{message.text}</p> : null}
        <p className="text-bone-dim">Your bag is empty.</p>
        <Link href="/shop" className="btn btn-primary mt-6">
          Shop Drop 01
        </Link>
      </div>
    );
  }

  const field = (k: keyof Address, label: string, opts: { auto?: string; optional?: boolean; inputMode?: "numeric" | "tel" | "text"; className?: string } = {}) => (
    <div className={opts.className}>
      <label htmlFor={`co-${k}`} className="label">
        {label}
        {opts.optional ? <span className="font-normal text-bone-mute"> (optional)</span> : null}
      </label>
      <input
        id={`co-${k}`}
        className="field"
        autoComplete={opts.auto}
        inputMode={opts.inputMode}
        value={addr[k]}
        aria-invalid={errors[k] ? true : undefined}
        aria-describedby={errors[k] ? `co-${k}-err` : undefined}
        onChange={(e) => setAddr((a) => ({ ...a, [k]: e.target.value }))}
        onBlur={() => requestQuote()}
      />
      {errors[k] ? (
        <p id={`co-${k}-err`} className="mt-1 text-sm text-error">
          {errors[k]}
        </p>
      ) : null}
    </div>
  );

  const pricing = quote?.pricing;
  const exempt = cart.lines.some((l) => l.withdrawalRule === "personalized_exempt");
  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void pay(providers.card ? "card" : "paypal");
        }}
        className="space-y-10"
      >
        {message ? (
          <div role={message.tone === "error" ? "alert" : "status"} className={`border p-4 text-sm ${message.tone === "error" ? "border-error/50 bg-error/10 text-error" : "border-rule-strong bg-night-2 text-bone"}`}>
            {message.text}
            {shortages?.length ? (
              <ul className="mt-2 list-disc pl-5">
                {shortages.map((s) => (
                  <li key={s.label}>
                    {s.label}: {s.available === 0 ? "sold out" : `only ${s.available} available`}
                  </li>
                ))}
              </ul>
            ) : null}
            {shortages ? (
              <Link href="/cart" className="link mt-2 inline-block">
                Update your bag
              </Link>
            ) : null}
          </div>
        ) : null}

        <fieldset className="space-y-4">
          <legend className="display mb-2 text-[34px]">1. Contact</legend>
          <div>
            <label htmlFor="co-email" className="label">
              Email for your receipt and order updates
            </label>
            <input id="co-email" type="email" className="field" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={errors.email ? true : undefined} aria-describedby={errors.email ? "co-email-err" : undefined} />
            {errors.email ? (
              <p id="co-email-err" className="mt-1 text-sm text-error">
                {errors.email}
              </p>
            ) : null}
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="display mb-2 text-[34px]">2. Delivery address</legend>
          {field("name", "Full name", { auto: "shipping name" })}
          {field("line1", "Street address", { auto: "shipping address-line1" })}
          {field("line2", "Apartment, c/o", { auto: "shipping address-line2", optional: true })}
          <div className="grid grid-cols-[130px_1fr] gap-4">
            {field("postalCode", "Postal code", { auto: "shipping postal-code", inputMode: "numeric" })}
            {field("city", "City", { auto: "shipping address-level2" })}
          </div>
          {countries.length > 1 ? (
            <div>
              <label htmlFor="co-country" className="label">
                Country
              </label>
              <select id="co-country" className="field" value={addr.country} autoComplete="shipping country" onChange={(e) => setAddr((a) => ({ ...a, country: e.target.value }))}>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-sm text-bone-dim">
              Country: <span className="text-bone">{countries[0]?.name}</span> — we only ship within {countries[0]?.name} for now.
            </p>
          )}
          {field("phone", "Phone for delivery notices", { auto: "tel", optional: true, inputMode: "tel" })}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="display mb-2 text-[34px]">3. Delivery</legend>
          {!addressComplete ? (
            <p className="text-sm text-bone-dim">Enter your address to see delivery options and prices.</p>
          ) : quoting && !quote ? (
            <p className="text-sm text-bone-dim" role="status">
              Getting delivery options…
            </p>
          ) : quote ? (
            <div className="space-y-2" role="radiogroup" aria-label="Delivery method">
              {quote.rates.map((r) => (
                <label key={r.rateId} className="flex cursor-pointer items-center justify-between gap-4 border border-rule-strong p-4 has-[:checked]:border-bone">
                  <span className="flex items-center gap-3">
                    <input type="radio" name="rate" className="h-4 w-4 accent-[var(--bone)]" checked={rateId === r.rateId} onChange={() => setRateId(r.rateId)} />
                    <span>
                      <span className="font-semibold">{r.name}</span>
                      <span className="block text-sm text-bone-dim">
                        {r.carrier}
                        {r.service ? ` · ${r.service}` : ""}
                        {r.minDays != null && r.maxDays != null ? ` · ${r.minDays}–${r.maxDays} working days` : ""}
                      </span>
                    </span>
                  </span>
                  <span className="num font-semibold">{r.priceMinor === 0 ? "Free" : formatMoney(r.priceMinor, r.currency)}</span>
                </label>
              ))}
            </div>
          ) : null}
          {dutiesNote ? <p className="text-sm text-bone-dim">{dutiesNote}</p> : null}
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="display mb-2 text-[34px]">4. Review &amp; pay</legend>
          <div>
            <label htmlFor="co-note" className="label">
              Note for us <span className="font-normal text-bone-mute">(optional)</span>
            </label>
            <textarea id="co-note" className="field min-h-20" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--bone)]" checked={terms} onChange={(e) => setTerms(e.target.checked)} aria-invalid={errors.terms ? true : undefined} />
            <span>
              I accept the{" "}
              <Link href="/terms" className="link" target="_blank">
                terms of sale
              </Link>
              . Standard items can be returned within {withdrawalDays} days of delivery (
              <Link href="/returns" className="link" target="_blank">
                returns
              </Link>
              ).{exempt ? " Personalised Locker Tag items are made to my spec and can't be returned for change of mind." : ""}
            </span>
          </label>
          {errors.terms ? <p className="text-sm text-error">{errors.terms}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {providers.card ? (
              <button type="button" className="btn btn-primary" disabled={Boolean(paying) || !quote} onClick={() => void pay("card")} aria-busy={paying === "card"}>
                {paying === "card" ? "Opening secure payment…" : `Pay ${pricing ? formatMoney(pricing.totalMinor, pricing.currency) : ""} by card`}
              </button>
            ) : null}
            {providers.paypal ? (
              <button type="button" className="btn btn-ghost" disabled={Boolean(paying) || !quote} onClick={() => void pay("paypal")} aria-busy={paying === "paypal"}>
                {paying === "paypal" ? "Opening PayPal…" : "Pay with PayPal"}
              </button>
            ) : null}
          </div>
          {!providers.card && !providers.paypal ? <p className="text-sm text-error">No payment method is available right now.</p> : null}
          <p className="text-xs text-bone-mute">
            You&apos;ll pay on {providers.card?.simulator || providers.paypal?.simulator ? "a local test page (development — no money moves)" : "Stripe's or PayPal's secure page"}. We never see your card details. Your order is confirmed when the payment provider confirms payment.
          </p>
        </fieldset>
      </form>

      <aside className="h-fit border border-rule bg-night-2 p-6 lg:sticky lg:top-[calc(var(--header-h)+24px)]" aria-label="Order summary">
        <h2 className="display text-[30px]">Summary</h2>
        <ul className="mt-4 divide-y divide-rule text-sm">
          {cart.lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-4 py-3">
              <span>
                <span className="font-semibold">{l.productName}</span> × {l.qty}
                <span className="block text-bone-dim">
                  {l.variantLabel} · {l.size}
                </span>
                {l.personalizationLabel ? <span className="block text-sodium">{l.personalizationLabel}</span> : null}
              </span>
              <span className="num">{formatMoney(l.lineTotalMinor, cart.currency)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-rule pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-bone-dim">Subtotal</dt>
            <dd className="num">{formatMoney((pricing ?? cart.pricing).subtotalMinor, cart.currency)}</dd>
          </div>
          {(pricing ?? cart.pricing).discounts.map((d) => (
            <div key={d.ref} className="flex justify-between text-teal-bright">
              <dt>{d.label}</dt>
              <dd className="num">−{formatMoney(d.amountMinor, cart.currency)}</dd>
            </div>
          ))}
          <div className="flex justify-between">
            <dt className="text-bone-dim">Delivery</dt>
            <dd className="num">{pricing ? (pricing.shippingMinor === 0 ? "Free" : formatMoney(pricing.shippingMinor, cart.currency)) : "—"}</dd>
          </div>
          <div className="flex justify-between border-t border-rule pt-3 text-lg font-semibold">
            <dt>Total</dt>
            <dd className="num" aria-live="polite">
              {pricing ? formatMoney(pricing.totalMinor, cart.currency) : "Add address"}
            </dd>
          </div>
          {pricing && pricing.tax.mode === "vat_inclusive" && pricing.taxMinor > 0 ? (
            <p className="text-xs text-bone-dim">
              Includes {formatMoney(pricing.taxMinor, cart.currency)} {pricing.tax.label}
              {cart.taxUnconfigured ? " (development estimate)" : ""}
            </p>
          ) : null}
          {pricing && pricing.tax.mode === "not_registered" ? <p className="text-xs text-bone-dim">No VAT is charged.</p> : null}
        </dl>
      </aside>
    </div>
  );
}

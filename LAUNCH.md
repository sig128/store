# Launch checklist

Production checkout stays **closed** until every *required* item below passes. The same list is live at `/admin/readiness` and from the command line with `npm run readiness` (exit code 1 while anything required fails). Nothing on the storefront can bypass it.

## Required before the first real order

**Business and legal**
- [ ] Legal seller identity: legal name, organisation number, address, contact email (`Settings → Legal seller identity`)
- [ ] Customer support email
- [ ] Tax decided with an accountant: VAT-registered (prices include 25 % MVA) or not registered
- [ ] Terms, privacy, returns and shipping pages reviewed by someone qualified and marked *reviewed* (they are drafts, not legal advice)
- [ ] Every artwork on sale approved, with owned or licensed rights recorded

**Payments**
- [ ] Stripe and/or PayPal connected with **live** credentials
- [ ] Stripe webhook signing secret set (if Stripe is enabled)
- [ ] PayPal webhook id set (if PayPal is enabled)
- [ ] `APP_ENV=production` (the payment simulator is then unavailable)

**Operations**
- [ ] Shipping zone(s) with approved rates for every "ship to" country, agreed with the carrier
- [ ] Transactional email provider (Resend or SMTP) with a verified sending domain
- [ ] At least one active owner account

**Catalogue**
- [ ] At least one product approved for sale
- [ ] For each product on sale: active variants and sizes, and either a physical stock **count** for every size (stocked) or a manufacturer-confirmed lead time (made to order)

## Strongly recommended

- [ ] Real product photos uploaded for every colourway (the store currently shows labelled concept renders)
- [ ] Approved garment measurements for every product (size tables are hidden in production until approved)
- [ ] Locker Tag template approved by the supplier, with their reference and a production time (otherwise Locker Tag is hidden in production)
- [ ] Bundle ("fit") savings approved, or left off
- [ ] Background worker running (or `/api/cron/tick` scheduled every minute)
- [ ] S3-compatible media storage with `print-files/` kept private (local disk only on a single server with a persistent volume)
- [ ] Database backups and an uptime/error monitor
- [ ] One end-to-end test purchase in **live** mode with a real card, refunded from the admin

# What is still missing for real live orders

These are not code problems; they need decisions, accounts or physical work:

1. **A real business identity and tax setup** — none is configured; the seeded values are empty on purpose.
2. **Provider accounts** — no Stripe or PayPal account (sandbox or live) has been connected to this build.
3. **Real stock and real prices** — seeded quantities are development numbers marked "not counted"; prices are development data until approved per product.
4. **Production garments** — blanks, print methods, ink colours, colour separations and print-file checks must be agreed with a printer. All print files are concept masters (`assets/print-files/`, status *draft*).
5. **Measurements** — size tables are sample data. Measure production samples, enter them as *approved*.
6. **Photos** — every image is a generated concept render (see `assets/manifest.json`).
7. **Carrier agreement** — the seeded Posten/Bring pickup-point and home-delivery prices are placeholders and unapproved; there is no carrier API integration (tracking numbers are entered by hand; Posten/Bring tracking links are generated from a template you should confirm).
8. **Legal review** of the four policy pages, including whether Locker Tag items are exempt from the right of withdrawal (angrerettloven § 22 b) — the switch exists per product and is off.
9. **Email domain** — SPF/DKIM for the sending address.
10. **Hosting** — a Node.js host, PostgreSQL, HTTPS, the worker/cron, and backups. Nothing has been deployed.
11. **Print-on-demand integration** (optional) — the adapter interface exists but no provider API is implemented; manual fulfilment is the supported flow.
12. **Marketing email sending** — drop sign-ups are collected with double opt-in and can be unsubscribed, but there is no campaign sender; export or connect a newsletter tool before announcing drops.

# Provider steps not yet verified

Everything below is implemented and covered by tests against mocked HTTP and the local simulator, but **has not been run against real Stripe or PayPal sandboxes**, because no sandbox credentials were available. Verify each step in sandbox mode before going live:

**Stripe**
1. `checkout.sessions.create` accepts the request as sent (line items with `price_data`, a fixed-amount shipping option, `payment_intent_data.shipping`, `allowed_payment_method_types=["card"]`, `expires_at` = attempt expiry ≥ 30 min, `locale: "auto"`) and returns `amount_total` equal to our order total.
2. Hosted Checkout shows NOK amounts and the shipping option as expected; paying with a test card fires `checkout.session.completed` with `payment_status: "paid"`, and the order becomes paid via the webhook only.
3. A real `Stripe-Signature` from your endpoint verifies with `STRIPE_WEBHOOK_SECRET`; a tampered body is rejected with HTTP 400 and Stripe retries.
4. Expiring an open session (when a buyer starts a new checkout) succeeds, and `checkout.session.expired` is handled.
5. Refunds: `refunds.create` with the idempotency key and `metadata.refund_id`; `refund.created`/`refund.updated` webhooks update the same refund row (no duplicate); a partial refund leaves the order *partially refunded*.
6. If you enable delayed payment methods: `checkout.session.async_payment_succeeded` / `_failed` move the order from processing to paid / failed.
7. A dispute in test mode (`charge.dispute.created`) flags the order for review.

**PayPal**
1. OAuth client-credentials token request succeeds with your REST app.
2. `POST /v2/checkout/orders` accepts our body (intent `CAPTURE`, item breakdown, `shipping.type: SHIPPING` with our address, `payment_source.paypal.experience_context` with `shipping_preference: SET_PROVIDED_ADDRESS`, `user_action: PAY_NOW`, return/cancel URLs) and returns a `payer-action` link.
3. The buyer cannot change the shipping address on PayPal's page (SET_PROVIDED_ADDRESS); if PayPal still reports a different destination, the order is flagged rather than paid.
4. Returning to `/checkout/return` verifies the order is `APPROVED` and captures it once with `PayPal-Request-Id: capture-<attempt>`; a repeated return or the `CHECKOUT.ORDER.APPROVED` webhook does not capture twice (`ORDER_ALREADY_CAPTURED` is handled).
5. `INSTRUMENT_DECLINED` on capture sends the buyer back to PayPal to choose another funding source.
6. `PAYMENT.CAPTURE.PENDING` followed by `PAYMENT.CAPTURE.COMPLETED` moves the order processing → paid.
7. Webhook verification with `/v1/notifications/verify-webhook-signature` and your `PAYPAL_WEBHOOK_ID` returns `SUCCESS` for genuine events and rejects others.
8. Refunds: `POST /v2/payments/captures/{id}/refund` with `PayPal-Request-Id` and `custom_id`; `PAYMENT.CAPTURE.REFUNDED` updates the same refund row.

**Email** — no real email has been sent; only the `log` provider has been exercised. Send a test order confirmation, shipping and refund email through Resend or SMTP and check links and formatting in real inboxes.

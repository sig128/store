# After Hours Athletics

An interactive gymwear storefront with its own commerce backend: Drop 01 ("Last Set"), six garments, three original print families (Night Garage, Last Rep Club, Coastal Shift), a Locker Tag name/number personalisation, Stripe Checkout and PayPal, and a private admin for running orders.

**Status: development build, not deployed, no live payments.** Prices, stock, measurements and specs in the seed are development data. All product images are generated concept renders and are labelled as such. Policy pages are drafts that need legal review. The launch checklist lives in [LAUNCH.md](LAUNCH.md).

- Storefront: Next.js 16 (App Router) + React 19 + Tailwind CSS 4
- Data: PostgreSQL 16 + Drizzle ORM with SQL migrations (`drizzle/`)
- Admin auth: Better Auth (email + password, no public sign-up), role-based permissions, audit log
- Payments: Stripe-hosted Checkout and PayPal Orders v2 behind typed adapters, plus a local simulator for development
- Jobs: durable outbox in Postgres, processed by `npm run worker` or a cron call
- Media: local disk or any S3-compatible bucket

---

## 1. Run it locally

Prerequisites: Node.js 22, PostgreSQL 16+, and Chrome only if you run the browser tests.

```bash
npm install
cp .env.example .env
# fill in COOKIE_SECRET and BETTER_AUTH_SECRET:  openssl rand -base64 48
# and point DATABASE_URL at an empty database, e.g.:
createdb aha_dev

npm run db:migrate
SEED_ADMIN_PASSWORD='choose-a-long-password' npm run db:seed   # prints the owner login
npm run dev        # http://localhost:3000   (admin: http://localhost:3000/admin)
npm run worker     # second terminal: sends emails, captures PayPal approvals, expires stale checkouts
```

`npm run db:reset` wipes the development database, migrates and seeds again (it refuses to run with `APP_ENV=production`).

With `PAYMENTS_SIMULATOR=1` and no provider keys, "Pay by card" and "PayPal" open a **local payment simulator** (`/dev/simulator/…`) where you can pay, pay with a delayed confirmation, decline, cancel, expire, approve-then-capture, send a duplicate capture or a wrong amount. It signs its webhooks like a real provider and goes through exactly the same order code. It moves no money and cannot be enabled in production.

### Useful scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm run worker` | Background job worker (emails, PayPal capture, reconciliation, expiry sweeps) |
| `npm run db:migrate` | Apply SQL migrations in `drizzle/` |
| `npm run db:generate` | Create a new migration after editing `src/server/db/schema.ts` |
| `npm run db:seed` | Development catalogue, sample stock, owner account |
| `npm run db:seed -- --catalog-only` | Production bootstrap: Drop 01 products, artwork, template and policy drafts as **drafts** — no stock, no size tables, no shipping prices, no users |
| `npm run admin:create -- --email you@example.com --role owner` | Create a staff account (password from `ADMIN_PASSWORD` or generated and shown once) |
| `npm run readiness` | Print the launch checklist; exits 1 while anything required is missing |
| `npm test` | Unit + integration tests (uses a separate `aha_test` database, see §9) |
| `npm run test:e2e` | Browser tests on a narrow phone with reduced motion and on desktop |
| `npm run art:build` | Re-render artwork, concept renders, scenes and social cards from `scripts/art` |
| `npm run art:3d` | Re-bake the 3D garment shells and texture maps for the Rack into `public/3d` (run after `art:build`; pass variant codes to bake only those) |
| `npm run typecheck` | TypeScript check |

---

## 2. Where things live

```
src/config/brand.ts        name, domain, drop name, hero copy, colours  ← rename the brand here
src/config/carriers.ts     carriers + tracking URL templates
src/app/(store)/           storefront: home scenes, shop, product, cart, checkout, policies, support
src/components/store/rack3d/   the real-time 3D Rack (WebGL scene, garment loader)
src/app/admin/             private admin
src/app/api/webhooks/      stripe, paypal, simulator
src/server/                all business logic (pricing, cart, checkout, orders, payments, jobs, email…)
src/server/orders/transitions.ts   the single payment state machine every provider event goes through
src/server/readiness.ts    the launch gate
scripts/                   migrate, seed, admin, readiness, artwork pipeline
scripts/data/              Drop 01 development data and draft policy copy
assets/                    generated print files, concept renders, asset manifest (assets/manifest.json)
public/3d/                 baked 3D garment maps for the Rack (public/3d/manifest.json)
test/                      Vitest unit + integration tests
e2e/                       Playwright browser tests
```

### The Rack in 3D

Home scene 02 ("The Rack") renders the six Drop 01 pieces in real time with WebGL 2 (three.js through @react-three/fiber). One garment at a time floats under a thin linear LED in a dark room. Scrolling picks the piece and turns it. Between pieces the LED cuts out and strikes back on, and moving the pointer shifts the camera slightly.

- The geometry and maps are baked from the same 2D garment drawings as the concept renders. `npm run art:3d` inflates each silhouette into a closed shell with open hems, cuffs and necks, and writes colour, normal and roughness/AO maps plus a height field to `public/3d/` (about 4 MB for all six). This is concept geometry, not a scan of produced stock, and the section keeps its "Concept render" label.
- The WebGL code is a separate chunk. It loads only when the Rack is about to scroll into view, and the canvas stops drawing once the Rack leaves the screen. On phones only the piece in view gets a live canvas, at lower resolution with fewer effects; the others stay as images.
- Fallbacks: without WebGL 2, or with `?flat=1` in the URL, the Rack shows the 2D concept renders as before. With reduced motion the light doesn't flicker, the garments hold still, and the canvas only redraws when you scroll to another piece.
- `/dev/rack3d` (development only) shows the stage full screen. `?i=0..5&t=0..1` picks a piece and how far it has turned.

Business details — legal seller identity, VAT, shipping zones and prices, support email, return-shipping wording — are **operator settings** in the admin (stored in the database), not code. Brand name, domain and colours are in `src/config/brand.ts`.

---

## 3. How an order is paid (and why it can't be paid twice)

1. The browser only ever sends SKU ids, quantities and Locker Tag text. Prices, discounts, bundle savings, VAT and shipping are calculated on the server.
2. Checkout asks for the address and gets a **shipping quote** for that destination and that exact bag before any payment step.
3. "Pay" re-prices the bag, checks the quote is still valid for the bag and destination, and that the total is what the customer saw. Inside one transaction it creates an **immutable pending order** (lines, prices, discounts, tax, shipping, seller details, terms version, exact Locker Tag spec) and **reserves stock** with an expiry (made-to-order items use their lead time instead of stock).
4. One **payment attempt** is created (the database allows only one live attempt per order) and the provider session is created server-side: a Stripe Checkout Session, or a PayPal order with `intent: CAPTURE`.
5. The order becomes paid only when a **verified** provider event arrives: a signed Stripe webhook, a verified PayPal webhook, or our own server-side PayPal capture response. Amount, currency, our order/attempt reference and the destination must match; otherwise the payment is recorded as a mismatch and the order is flagged instead of paid.
6. The thank-you page never marks anything paid. It shows "Confirming payment" until the server has verified it.
7. Every event is stored once (`provider_events`), every payment once (`payments` unique per provider id). A second successful capture on the same order is recorded and flagged for a refund — never shipped twice. A payment arriving after the hold lapsed and the stock sold is accepted but blocked for review.
8. Confirmation emails and fulfilment hand-off are written to the job outbox in the same transaction, with dedupe keys.

Card numbers never reach this app (Stripe and PayPal host the payment pages). Provider secrets live only in the server environment.

---

## 4. Operator guide (admin)

Sign in at `/admin`. There is no public sign-up.

### Users and roles

| Role | Can |
| --- | --- |
| owner | everything, including settings, policies and users |
| manager | catalogue, orders, refunds, returns, reports, jobs |
| fulfillment | orders, packing, shipping, returns, stock |
| viewer | read-only, reports export, audit log |

Create the first owner with `npm run admin:create`, then add the team under **Users**. Disabling a user or changing their role signs them out everywhere. Every staff action is written to the **Audit log**.

### Business settings — `Settings`

Fill in, in this order: **Legal seller identity** (legal name, organisation number, address, contact email — shown on receipts and policies), **Tax** (VAT-inclusive at 25 % MVA, or "not registered"; confirm with your accountant), **Customer support** (support email, withdrawal period, return-shipping wording, dispatch note only if true), **Store & market** (Norway/NOK by default; "Ship to" lists the countries checkout accepts). Changes apply to new orders only — each order keeps the snapshot it was sold with.

### Shipping zones and rates — `Settings → Shipping zones & rates`

1. A zone is a name plus country codes (the seed creates "Norway / NO").
2. Add a rate per delivery option: name, carrier, service, price, optional free-over threshold, optional delivery-day range (shown to customers only when both numbers are set).
3. Tick **approved** together with "price & estimate agreed with carrier". In production customers only see approved, active rates, and checkout stays closed while any "ship to" country has none.

### Add or edit a product — `Products & stock`

1. **New product** → name, URL slug, category. It starts as a hidden draft.
2. **Details**: summary, description (no unverified fabric, weight or performance claims), fulfilment mode — *stocked* or *made to order* with a lead time the manufacturer has confirmed (tick "Lead time confirmed").
3. **Variants**: colour name, swatch hex, optional option label (e.g. the hoodie's "Clean back" vs "Back print").
4. **Sizes & prices** per variant (prices are integer øre in the database; type `549` or `549.00`).
5. **Stock**: record a physical **count** (`count =`) for every size — a count is what marks stock as verified. Use `adjust ±` for deliveries, corrections and damage; every change is an inventory movement.
6. **Images**: upload real product photos (source "product photo") with alt text describing the image. Concept renders stay labelled as renders. Hide any image you don't want shown.
7. **Prints**: choose the artwork version and placement for each variant; tick "method confirmed by supplier" once the printer confirms it.
8. **Specs**: shown only when *approved* with a source (e.g. the supplier's spec sheet).
9. **Size table**: paste garment measurements in cm (CSV), say how each is measured, choose "garment, laid flat", and set it to *approved* only for measured production samples. Customers can switch cm/in.
10. **Approval for real sale**: tick both boxes when everything above is confirmed. In production, unapproved products are never purchasable.

**Archive** a product by setting its status to archived; past orders keep their snapshot. **Outfits (Build the Fit)** are edited on the same page: hotspot positions, bundle saving %, minimum pieces, and a separate approval for the saving.

### Artwork and the Locker Tag template — `Artwork & templates`

- Every artwork has a version, rights status (original / licensed / pending / concept only), credit and licence reference. Only owned or licensed artwork can be **approved**, and approval asks you to confirm the print file was checked with the printer.
- Uploading a new file creates the **next version** as a draft; old orders keep the version they were sold with. Print files download only through the admin (never public URLs).
- The **Locker Tag** template holds the print area (mm), allowed characters, font + version and print colours. It is offered to customers in production only when the template is **approved**, **supplier-approved** (with the supplier's reference) and the product has a **production time** set. To change an approved print area, copy the template to a new version.
- "Exempt from change-of-mind returns" on the product applies to personalised lines only; ordinary printed items always keep the standard right of withdrawal.

### Policy pages — `Policy pages`

Terms, privacy, returns and shipping are seeded as **drafts written for a Norwegian web shop — not legal advice**. `{placeholders}` are filled from Settings. Every page shows a draft notice until someone qualified marks it **reviewed**; editing a page clears that flag.

### Daily fulfilment (manual)

1. **Production sheet** (`/admin/production`): everything paid and not yet packed, with exact print instructions — artwork code/version/placement/file, and for Locker Tags the exact text, font and version, colour hex, print area and template version. Export as **JSON** (structured, schema `aha.production/v1`) or **CSV** for the printer.
2. On an order: **Supplier sheet** and **Packing slip** print views; record the supplier's order reference.
3. **Mark in production → Mark packed → Mark shipped**. Choose the carrier, enter the tracking number (Posten/Bring tracking links are generated automatically; for other carriers paste the URL) and leave "Email the customer" ticked to send the shipping email once.
4. Orders flagged for review (wrong amount, duplicate capture, oversold after a late payment, disputes) can't be packed or shipped until the flag is resolved with a note.

A print-on-demand API can be plugged in behind `src/server/fulfillment/index.ts`; until then it shows as **Not connected** and nothing is sent.

### Returns, exchanges and refunds

- **Record return/exchange** on the order (items, quantities, reason). **Mark received** with condition and whether to restock. For exchanges, **Ship replacement** with tracking.
- **Issue refund**: choose the payment, amount and reason and tick the confirmation. The refund is sent to Stripe or PayPal with an idempotency key; a double click, a retry or two admins at once can't refund twice, and the amount can never exceed what is left on the payment. Refund status is tracked separately from payment status. If the provider doesn't answer, the refund stays *pending* — **Retry (same key)** is safe. Refunds made directly in the Stripe/PayPal dashboard arrive by webhook and are recorded.
- **Cancel order**: unpaid orders close their payment attempt and release stock; paid orders restock and refund in full.

### Reports — `Reports & exports`

Sales by month, VAT by rate (from each order's stored tax snapshot) and provider-confirmed refunds, with CSV exports (orders, VAT summary, refunds) for bookkeeping. Test orders are excluded unless you tick "Include test orders". Your accountant decides how to book them.

### Jobs and emails — `Jobs & emails`

Shows queued, failed and dead jobs and every email delivery. **Retry** puts the same job back in the queue; its dedupe key means a retry never sends a second confirmation or a second supplier order. "Run due jobs now" runs one worker tick from the admin.

---

## 5. Payment providers (sandbox first)

Nothing here has been connected to real Stripe or PayPal accounts. See [LAUNCH.md](LAUNCH.md#provider-steps-not-yet-verified) for the steps that still need a real sandbox.

### Stripe (Checkout)

1. In the Stripe Dashboard (test mode) copy the **secret key** (`sk_test_…`) into `STRIPE_SECRET_KEY`.
2. Webhook endpoint: `https://YOUR-DOMAIN/api/webhooks/stripe` with these events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `refund.created`, `refund.updated`, `refund.failed`, `charge.dispute.created`.
   Put its signing secret (`whsec_…`) in `STRIPE_WEBHOOK_SECRET`.
3. Locally, use the Stripe CLI instead of a public endpoint:
   `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and copy the printed `whsec_…`.
4. Keep `STRIPE_PAYMENT_METHOD_TYPES=card` (cards plus eligible wallets) unless you have reviewed delayed payment methods; the order code supports delayed confirmation either way.
5. Restart the app; **Settings → Payment providers** shows *Sandbox*. Pay with Stripe's test cards.
6. At launch: switch to `sk_live_…` and a live-mode webhook secret. Settings then shows *Live*.

### PayPal (Orders v2)

1. On developer.paypal.com create a **REST app** (sandbox). Copy the client id and secret into `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`; keep `PAYPAL_ENV=sandbox`.
2. Add a webhook to the app: `https://YOUR-DOMAIN/api/webhooks/paypal` with
   `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`, `CUSTOMER.DISPUTE.CREATED`.
   Copy the **webhook id** into `PAYPAL_WEBHOOK_ID` (needed to verify signatures). PayPal can't reach `localhost`; use a tunnel or a staging URL for webhooks. The capture itself happens on our server when the buyer returns, so local testing works without webhooks; pending captures and refunds need them.
3. Approval on PayPal is not payment: when the buyer returns, the server checks the PayPal order, captures it with an idempotent request id, and only a `COMPLETED` capture with the right amount, currency and reference marks the order paid.
4. At launch: `PAYPAL_ENV=live` with live app credentials and a live webhook id.

---

## 6. Email

`EMAIL_PROVIDER=log` prints emails to the console (development). For real email set `EMAIL_PROVIDER=resend` + `RESEND_API_KEY`, or `EMAIL_PROVIDER=smtp` + `SMTP_URL`, and a verified `EMAIL_FROM` domain (SPF/DKIM). Emails sent: order confirmation (with a private order link), shipped (carrier + tracking), cancelled, refunded, order link on request, drop sign-up confirmation (double opt-in). Order links are random, expire (Settings → order link days), and only their hash is stored.

## 7. Media storage

`STORAGE_DRIVER=local` stores files under `STORAGE_LOCAL_DIR` and serves product images through `/media/…` — fine for a single server with a persistent disk. For anything else use `STORAGE_DRIVER=s3` (AWS S3, Cloudflare R2, MinIO) with `S3_PUBLIC_BASE_URL` pointing at a CDN. **Expose only `products/`, `outfits/` and `uploads/products/` publicly; keep `print-files/` private** (print files are downloaded through the admin with the bucket credentials).

## 8. Background work

Run `npm run worker` as a separate long-lived process next to the web server, **or** schedule `GET /api/cron/tick` every minute with `Authorization: Bearer $CRON_SECRET`. Either one sends emails, captures approved PayPal orders, asks providers about checkouts that went quiet, closes expired attempts and releases lapsed stock holds. Launch readiness shows a warning if no worker has checked in for 10 minutes.

## 9. Tests

```bash
createdb aha_test                       # once; or set TEST_DATABASE_URL
npm test                                # 59 unit + integration tests (wipes and re-seeds aha_test)
npm run test:e2e                        # starts/uses the dev server on :3000 and the dev database
```

Integration tests run the real order code against Postgres: verified payment → paid exactly once; duplicate webhook deliveries; delayed (processing → paid / failed) payments; wrong amount, currency, reference or destination; approve-then-capture; cancelled and expired checkouts; replacing a pending order; two buyers racing for the last unit; a late payment after the unit sold; Locker Tag snapshots surviving template changes and the final-sale rule applying only to personalised lines; duplicate and concurrent refunds and a refund webhook racing the API response; private order links and signed access cookies; webhook signature rejection; the background worker, email dedupe and retry; manual fulfilment and shipping; and the production launch gate. Stripe and PayPal adapters are tested against mocked HTTP (real Stripe signature verification). Browser tests buy through the simulator on a 390 px phone with reduced motion and on desktop, check order privacy, keyboard-only shopping, and the admin fulfil → ship → refund flow with a read-only role.

## 10. Deploying (when you're ready)

### Vercel with no settings (demo)

Import the repository in Vercel and deploy: no environment variables are needed. Without `DATABASE_URL` the build seeds the Drop 01 catalogue into embedded Postgres (PGlite) and every server instance starts from that snapshot, so bags and simulated orders reset when an instance restarts. Payments run through the built-in simulator only. The admin owner is `owner@afterhours.test`; its password is printed in the build log ("Admin owner created"). Add a real `DATABASE_URL` (for example Neon from the Vercel Storage tab) to keep data.

### Vercel preview (staging)

`vercel.json` builds with `npm run build:vercel`: apply migrations, seed the development catalogue if the database is empty, copy the concept media into `./storage` (`npm run media:sync`), then `next build`. The media files ship inside the functions that read them (see `outputFileTracingIncludes` in `next.config.ts`), so `STORAGE_DRIVER=local` works there read-only: admin image uploads need S3-compatible storage. Set `APP_ENV=staging`, `PAYMENTS_SIMULATOR=1`, `APP_URL`/`BETTER_AUTH_URL` to the site's address, `DATABASE_URL`, `COOKIE_SECRET`, `BETTER_AUTH_SECRET`, `CRON_SECRET` and `SEED_ADMIN_PASSWORD`. Staging never takes real payments and tells search engines to stay away. The Hobby plan runs the cron once a day; checkout and the PayPal-style capture don't wait for it.

### Production

Not deployed. A production setup needs: a Node.js host for `npm run build && npm start`, PostgreSQL with backups, `npm run db:migrate` on each release, the worker (or cron) running, HTTPS on `APP_URL`, and the environment from `.env.example` with `APP_ENV=production`. Bootstrap the catalogue with `npm run db:seed -- --catalog-only`, create the owner with `npm run admin:create`, then work through `/admin/readiness` until checkout opens.

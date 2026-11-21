/**
 * DRAFT policy copy. Written as a starting point for a Norwegian web shop selling to
 * consumers. It is NOT legal advice and is seeded with reviewed=false so production
 * checkout stays closed until an operator has reviewed and published each page.
 * Placeholders in {curly braces} are filled from operator settings at render time.
 */
export const POLICY_DRAFTS: { slug: string; title: string; body: string }[] = [
  {
    slug: "terms",
    title: "Terms of sale",
    body: `## Who you are buying from
{seller.legalName}, organisation number {seller.orgNumber}, {seller.address}. Contact: {support.email}.

## Prices and payment
Prices are shown in {store.currency}. {tax.priceNote} The total you see at checkout — items, any discounts, delivery and tax — is the amount you pay. Payment is taken by card through Stripe or through PayPal. We never see or store your card details.

## Your order
Your order is confirmed when the payment provider confirms payment and we send an order confirmation by email. If an item sells out between checkout and payment confirmation, we contact you and refund that item.

## Delivery
We currently deliver to: {store.shipsTo}. Delivery options and prices are shown at checkout before you pay. See the shipping page for details.

## Right of withdrawal (angrerett)
You can cancel your purchase within {support.withdrawalDays} days of receiving the goods, under the Norwegian Cancellation Act (angrerettloven). See the returns page for how to do this. {personalization.withdrawalNote}

## Complaints (reklamasjon)
If an item is faulty you can complain under the Consumer Purchases Act (forbrukerkjøpsloven). Contact us at {support.email} with your order number and a description of the fault.

## Disputes
If we cannot agree, you can contact Forbrukerrådet for mediation.

*Draft — must be reviewed before launch.*`,
  },
  {
    slug: "privacy",
    title: "Privacy",
    body: `## What we collect
When you order: your name, email address, delivery address, phone number (optional), what you bought and the payment reference from Stripe or PayPal. If you sign up for drop news: your email address and your consent.

## Why
To deliver your order, send order and shipping emails, handle returns and refunds, and keep the accounting records Norwegian law requires (bokføringsloven).

## Who processes it for us
Payment providers (Stripe, PayPal), our email provider, our hosting provider and the carrier that delivers your parcel. Each only receives what it needs.

## Cookies
We only use cookies needed to run the shop: one that remembers your bag, one that lets you see your order status, and admin login cookies for staff. No advertising or analytics cookies.

## How long
Order records are kept as long as the accounting rules require. Drop-news signups are kept until you unsubscribe.

## Your rights
You can ask to see, correct or delete your data, or object to how we use it. Contact {support.email}. You can also complain to Datatilsynet.

*Draft — must be reviewed before launch.*`,
  },
  {
    slug: "returns",
    title: "Returns and refunds",
    body: `## Changed your mind?
You have {support.withdrawalDays} days from the day you receive your order to tell us you want to return it. Email {support.email} with your order number and the items you are returning. You then have 14 days to send the items back.

## Condition
You may try items on as you would in a shop. Items should be returned unwashed and in the condition you received them.

## Personalised items
{personalization.withdrawalNote}

## Refunds
We refund to the original payment method within 14 days of receiving your cancellation; we may wait until the items have arrived back with us. Return shipping cost: {returns.shippingCostNote}

## Exchanges
Want a different size? Tell us when you contact us and we will reserve it if it is in stock.

## Faulty items
Faulty items are covered by your complaint rights (reklamasjon) — contact us and we will sort it out.

*Draft — must be reviewed before launch.*`,
  },
  {
    slug: "shipping",
    title: "Shipping",
    body: `## Where we ship
We currently ship to: {store.shipsTo}. We do not ship elsewhere yet.

## Options and prices
Available delivery options and their prices are shown at checkout once you enter your address, before you pay.

## When it ships
{support.dispatchNote}

## Made-to-order and personalised items
Made-to-order pieces and Locker Tag personalisation take extra production time. Where we have a confirmed production time, it is shown on the product page and at checkout.

## Tracking
When your order ships we email you the carrier and tracking number.

## Duties and taxes
{tax.dutiesNote}

*Draft — must be reviewed before launch.*`,
  },
];

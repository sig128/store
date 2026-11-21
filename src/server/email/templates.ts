import { brand } from "@/config/brand";
import { formatMoney } from "@/lib/money";
import type { OrderLineRow, OrderRow } from "../payments/types";

/**
 * Transactional email templates: plain, legible HTML (light background for email
 * clients) plus a text version. Every email carries the seller identity and a
 * secure, expiring order link instead of a guessable URL.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function shell(title: string, body: string, footer: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f3f0e9;color:#1c1c1a;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<p style="margin:0 0 20px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;font-size:13px">${esc(brand.name)}</p>
${body}
<hr style="border:0;border-top:1px solid #d9d3c7;margin:28px 0 14px">
<p style="color:#6b665d;font-size:12px;margin:0">${footer}</p>
</div></body></html>`;
}

function sellerLine(o: OrderRow): string {
  const s = o.sellerSnapshot;
  return s.legalName ? `${s.legalName}${s.orgNumber ? `, org. no. ${s.orgNumber}` : ""}${s.addressLines.length ? `, ${s.addressLines.join(", ")}` : ""}` : `${brand.name} (seller details not configured)`;
}

function linesTable(o: OrderRow, lines: OrderLineRow[]): { html: string; text: string } {
  const rows = lines.map((l) => {
    const tag = l.personalization ? ` — Locker Tag: ${l.personalization.displayText} (${l.personalization.color.name})` : "";
    return { label: `${l.productName} — ${l.variantLabel}, ${l.size} × ${l.qty}${tag}`, amount: formatMoney(l.lineTotalMinor, o.currency) };
  });
  const totals = [
    ["Subtotal", formatMoney(o.subtotalMinor, o.currency)],
    ...o.pricingSnapshot.discounts.map((d) => [d.label, `−${formatMoney(d.amountMinor, o.currency)}`]),
    [`Delivery (${o.shippingMethod.name})`, o.shippingMinor === 0 ? "Free" : formatMoney(o.shippingMinor, o.currency)],
    ["Total", formatMoney(o.totalMinor, o.currency)],
  ];
  const vat = o.taxSnapshot.mode === "vat_inclusive" && o.taxMinor > 0 ? `Includes ${formatMoney(o.taxMinor, o.currency)} ${o.taxSnapshot.label}.` : "";
  const html =
    `<table style="width:100%;border-collapse:collapse;margin:16px 0">` +
    rows.map((r) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e3ddd1">${esc(r.label)}</td><td style="padding:8px 0;border-bottom:1px solid #e3ddd1;text-align:right;white-space:nowrap">${esc(r.amount)}</td></tr>`).join("") +
    totals.map(([k, v], i) => `<tr><td style="padding:4px 0;${i === totals.length - 1 ? "font-weight:700" : "color:#6b665d"}">${esc(k!)}</td><td style="padding:4px 0;text-align:right;${i === totals.length - 1 ? "font-weight:700" : ""}">${esc(v!)}</td></tr>`).join("") +
    `</table>${vat ? `<p style="color:#6b665d;font-size:12px">${esc(vat)}</p>` : ""}`;
  const text = rows.map((r) => `- ${r.label}: ${r.amount}`).join("\n") + "\n" + totals.map(([k, v]) => `${k}: ${v}`).join("\n") + (vat ? `\n${vat}` : "");
  return { html, text };
}

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${esc(href)}" style="display:inline-block;background:#1c1c1a;color:#f3f0e9;padding:12px 20px;text-decoration:none;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:13px">${esc(label)}</a></p>`;

export function orderConfirmation(o: OrderRow, lines: OrderLineRow[], link: string, linkDays: number, supportEmail: string, withdrawalDays: number) {
  const t = linesTable(o, lines);
  const a = o.shippingAddress;
  const mto = lines.some((l) => l.fulfillmentMode === "made_to_order" || l.personalization);
  const exempt = lines.some((l) => l.withdrawalRule === "personalized_exempt");
  const subject = `Order ${o.number} confirmed`;
  const notes = [
    mto ? "Made-to-order or personalised pieces are produced for you before they ship." : "",
    `You can cancel standard items within ${withdrawalDays} days of receiving them (see our returns page).${exempt ? " Personalised Locker Tag items are made to your spec and can't be returned for change of mind; faults are always covered." : ""}`,
  ].filter(Boolean);
  const html = shell(
    subject,
    `<h1 style="font-size:26px;margin:0 0 8px">Payment confirmed — order ${esc(o.number)}</h1>
<p>Thanks. Here's what you ordered:</p>${t.html}
<p><strong>Delivering to</strong><br>${esc(a.name)}<br>${esc(a.line1)}${a.line2 ? `, ${esc(a.line2)}` : ""}<br>${esc(a.postalCode)} ${esc(a.city)}, ${esc(a.country)}</p>
${notes.map((n) => `<p style="color:#4b473f">${esc(n)}</p>`).join("")}
${button(link, "View your order")}
<p style="color:#6b665d;font-size:12px">This private link works for ${linkDays} days. Don't forward it.</p>`,
    `${esc(sellerLine(o))}${supportEmail ? ` · Questions: ${esc(supportEmail)}` : ""}`,
  );
  const text = `Payment confirmed — order ${o.number}\n\n${t.text}\n\nDelivering to: ${a.name}, ${a.line1}${a.line2 ? `, ${a.line2}` : ""}, ${a.postalCode} ${a.city}, ${a.country}\n\n${notes.join("\n")}\n\nView your order (private link, ${linkDays} days): ${link}\n\n${sellerLine(o)}${supportEmail ? `\nQuestions: ${supportEmail}` : ""}`;
  return { subject, html, text };
}

export function shippedEmail(o: OrderRow, s: { carrier: string | null; trackingNumber: string | null; trackingUrl: string | null }, link: string, supportEmail: string) {
  const subject = `Order ${o.number} has shipped`;
  const track = s.trackingNumber ? `${s.carrier ?? "Carrier"} tracking number: ${s.trackingNumber}` : `Shipped with ${s.carrier ?? "our carrier"}.`;
  const html = shell(
    subject,
    `<h1 style="font-size:26px;margin:0 0 8px">Your order is on its way</h1>
<p>${esc(track)}</p>${s.trackingUrl ? button(s.trackingUrl, "Track parcel") : ""}
<p><a href="${esc(link)}">View your order</a></p>`,
    `${esc(sellerLine(o))}${supportEmail ? ` · Questions: ${esc(supportEmail)}` : ""}`,
  );
  const text = `Your order ${o.number} is on its way.\n${track}${s.trackingUrl ? `\nTrack: ${s.trackingUrl}` : ""}\n\nView your order: ${link}\n\n${sellerLine(o)}`;
  return { subject, html, text };
}

export function cancelledEmail(o: OrderRow, reason: string, refunded: boolean, supportEmail: string) {
  const subject = `Order ${o.number} cancelled`;
  const body = `Your order ${o.number} has been cancelled${reason ? `: ${reason}` : "."}${refunded ? " Your payment is being refunded to the original payment method." : ""}`;
  const html = shell(subject, `<h1 style="font-size:26px;margin:0 0 8px">Order cancelled</h1><p>${esc(body)}</p>`, `${esc(sellerLine(o))}${supportEmail ? ` · Questions: ${esc(supportEmail)}` : ""}`);
  return { subject, html, text: `${body}\n\n${sellerLine(o)}` };
}

export function refundedEmail(o: OrderRow, amountMinor: number, currency: string, supportEmail: string) {
  const subject = `Refund for order ${o.number}`;
  const body = `We've refunded ${formatMoney(amountMinor, currency)} for order ${o.number} to your original payment method. Banks usually show it within 5–10 working days.`;
  const html = shell(subject, `<h1 style="font-size:26px;margin:0 0 8px">Refund issued</h1><p>${esc(body)}</p>`, `${esc(sellerLine(o))}${supportEmail ? ` · Questions: ${esc(supportEmail)}` : ""}`);
  return { subject, html, text: `${body}\n\n${sellerLine(o)}` };
}

export function orderLinkEmail(o: OrderRow, link: string, linkDays: number) {
  const subject = `Your link to order ${o.number}`;
  const html = shell(subject, `<h1 style="font-size:26px;margin:0 0 8px">Your order link</h1><p>Here's a private link to order ${esc(o.number)}.</p>${button(link, "View your order")}<p style="color:#6b665d;font-size:12px">Valid for ${linkDays} days. If you didn't ask for this, you can ignore it.</p>`, esc(sellerLine(o)));
  return { subject, html, text: `Private link to order ${o.number} (valid ${linkDays} days): ${link}\nIf you didn't ask for this, ignore this email.` };
}

export function signupConfirmEmail(link: string, unsubscribeLink: string) {
  const subject = `Confirm drop emails from ${brand.name}`;
  const html = shell(
    subject,
    `<h1 style="font-size:26px;margin:0 0 8px">One click to confirm</h1><p>Confirm you want emails when a new drop or restock goes live.</p>${button(link, "Confirm")}<p style="color:#6b665d;font-size:12px">If you didn't sign up, ignore this email and nothing happens. Changed your mind later? <a href="${esc(unsubscribeLink)}">Unsubscribe</a>.</p>`,
    esc(brand.name),
  );
  return { subject, html, text: `Confirm drop emails: ${link}\nIf you didn't sign up, ignore this email.\nUnsubscribe any time: ${unsubscribeLink}` };
}

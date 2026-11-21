import "../guard";
import { eq } from "drizzle-orm";
import { brand } from "@/config/brand";
import { db } from "../db";
import { emailDeliveries } from "../db/schema";
import { env } from "../env";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

interface EmailProvider {
  name: string;
  send(msg: OutgoingEmail & { from: string; idempotencyKey: string }): Promise<{ id: string | null }>;
}

const logProvider: EmailProvider = {
  name: "log",
  async send(msg) {
    console.log(`\n[email:log] to=${msg.to} subject="${msg.subject}"\n${msg.text}\n`);
    return { id: null };
  },
};

const resendProvider = (apiKey: string): EmailProvider => ({
  name: "resend",
  async send(msg) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": msg.idempotencyKey.slice(0, 256) },
      body: JSON.stringify({ from: msg.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, reply_to: msg.replyTo }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = (await r.json()) as { id?: string };
    return { id: j.id ?? null };
  },
});

const smtpProvider = (url: string): EmailProvider => ({
  name: "smtp",
  async send(msg) {
    const nodemailer = await import("nodemailer");
    const t = nodemailer.createTransport(url);
    const info = await t.sendMail({ from: msg.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text, replyTo: msg.replyTo, messageId: undefined, headers: { "X-Idempotency-Key": msg.idempotencyKey } });
    return { id: info.messageId ?? null };
  },
});

function provider(): EmailProvider {
  const e = env();
  if (e.EMAIL_PROVIDER === "resend") {
    if (!e.RESEND_API_KEY) throw new Error("EMAIL_PROVIDER=resend requires RESEND_API_KEY");
    return resendProvider(e.RESEND_API_KEY);
  }
  if (e.EMAIL_PROVIDER === "smtp") {
    if (!e.SMTP_URL) throw new Error("EMAIL_PROVIDER=smtp requires SMTP_URL");
    return smtpProvider(e.SMTP_URL);
  }
  return logProvider;
}

/**
 * Send once per dedupe key. A delivery row is written before sending; a key that
 * already reached "sent" is never sent again, so retried jobs and duplicate
 * webhooks cannot produce duplicate customer emails.
 */
/** Order links and confirmation tokens are secrets: keep them out of the stored copy of an email. */
export function redactSecrets(text: string): string {
  return text.replace(/(\/o\/)[A-Za-z0-9_-]{20,}/g, "$1[private link]").replace(/(token=)[A-Za-z0-9_%-]{20,}/g, "$1[redacted]");
}

export async function sendOnce(o: OutgoingEmail & { dedupeKey: string; template: string; orderId?: string | null; jobId?: string | null }): Promise<"sent" | "skipped"> {
  const e = env();
  const p = provider();
  const root = db();
  await root
    .insert(emailDeliveries)
    .values({ dedupeKey: o.dedupeKey, template: o.template, toAddress: o.to, subject: o.subject, provider: p.name, status: "sending", orderId: o.orderId ?? null, jobId: o.jobId ?? null, bodyText: redactSecrets(o.text) })
    .onConflictDoNothing({ target: emailDeliveries.dedupeKey });
  const [row] = await root.select().from(emailDeliveries).where(eq(emailDeliveries.dedupeKey, o.dedupeKey));
  if (row?.status === "sent") return "skipped";
  try {
    const res = await p.send({
      ...o,
      from: e.EMAIL_FROM ?? `${brand.name} <no-reply@${brand.domain}>`,
      replyTo: o.replyTo ?? e.EMAIL_REPLY_TO,
      idempotencyKey: o.dedupeKey,
    });
    await root.update(emailDeliveries).set({ status: "sent", sentAt: new Date(), providerMessageId: res.id, error: null, bodyText: redactSecrets(o.text) }).where(eq(emailDeliveries.dedupeKey, o.dedupeKey));
    return "sent";
  } catch (err) {
    await root.update(emailDeliveries).set({ status: "failed", error: String((err as Error).message).slice(0, 1000) }).where(eq(emailDeliveries.dedupeKey, o.dedupeKey));
    throw err;
  }
}

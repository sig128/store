"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { dropSignups } from "@/server/db/schema";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

/** Confirmation is a POST from a page, so link scanners that pre-open emails can't confirm on someone's behalf. */
export async function confirmSignupAction(f: FormData) {
  const token = String(f.get("token") ?? "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) redirect("/signup/confirm?state=invalid");
  const rows = await db()
    .update(dropSignups)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(and(eq(dropSignups.tokenHash, hash(token)), eq(dropSignups.status, "pending")))
    .returning({ id: dropSignups.id });
  if (rows.length) redirect("/signup/confirm?state=confirmed");
  const [existing] = await db().select({ status: dropSignups.status }).from(dropSignups).where(eq(dropSignups.tokenHash, hash(token)));
  redirect(`/signup/confirm?state=${existing?.status === "confirmed" ? "confirmed" : "invalid"}`);
}

export async function unsubscribeAction(f: FormData) {
  const token = String(f.get("token") ?? "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) redirect("/signup/unsubscribe?state=invalid");
  const rows = await db()
    .update(dropSignups)
    .set({ status: "unsubscribed", unsubscribedAt: new Date() })
    .where(eq(dropSignups.tokenHash, hash(token)))
    .returning({ id: dropSignups.id });
  redirect(`/signup/unsubscribe?state=${rows.length ? "done" : "invalid"}`);
}

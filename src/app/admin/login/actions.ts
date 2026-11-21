"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { audit } from "@/server/audit";

export async function signIn(_prev: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const [u] = await db().select().from(user).where(eq(user.email, email));
  if (u?.disabled) return { error: "This account is disabled." };
  try {
    await getAuth().api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch {
    return { error: "Wrong email or password." };
  }
  if (u) await audit(db(), { id: u.id, email: u.email, role: u.role }, "auth.sign_in", "user", u.id, "Signed in");
  redirect("/admin");
}

export async function signOut() {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/admin/login");
}

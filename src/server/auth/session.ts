import "../guard";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../db";
import { user } from "../db/schema";
import type { Actor } from "../audit";
import { getAuth } from ".";
import { can, type Permission } from "./rbac";

export interface AdminSession {
  id: string;
  email: string;
  name: string;
  role: string;
  actor: Actor;
}

export async function currentAdmin(): Promise<AdminSession | null> {
  const h = await headers();
  const s = await getAuth().api.getSession({ headers: h });
  if (!s) return null;
  // Role and disabled flag are read from the database on every request (never trusted from the cookie).
  const [u] = await db().select().from(user).where(eq(user.id, s.user.id));
  if (!u || u.disabled) return null;
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;
  return { id: u.id, email: u.email, name: u.name, role: u.role, actor: { id: u.id, email: u.email, role: u.role, ip } };
}

/** For pages: redirect to login when signed out; show a 403 page when the role lacks the permission. */
export async function requireAdmin(permission?: Permission): Promise<AdminSession> {
  const a = await currentAdmin();
  if (!a) redirect("/admin/login");
  if (permission && !can(a.role, permission)) redirect(`/admin/forbidden?need=${permission}`);
  return a;
}

/** For server actions: throw instead of redirecting. */
export async function assertAdmin(permission: Permission): Promise<AdminSession> {
  const a = await currentAdmin();
  if (!a) throw new Error("Not signed in.");
  if (!can(a.role, permission)) throw new Error(`Your role (${a.role}) can't do this (${permission}).`);
  return a;
}

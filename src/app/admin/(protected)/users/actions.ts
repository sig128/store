"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/server/db";
import { session, user } from "@/server/db/schema";
import { assertAdmin } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { createAdminUser, setAdminPassword } from "@/server/auth/users";
import { ROLE_PERMISSIONS } from "@/server/auth/rbac";
import type { AdminRole } from "@/lib/types";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const done = (q: string) => {
  revalidatePath("/admin/users");
  redirect(`/admin/users?${q}`);
};
const isRole = (r: string): r is AdminRole => r in ROLE_PERMISSIONS;

export async function createUserAction(f: FormData) {
  const a = await assertAdmin("users:manage");
  const role = s(f, "role");
  if (!isRole(role)) done(`err=${encodeURIComponent("Choose a role.")}`);
  try {
    const id = await createAdminUser(db(), { email: s(f, "email"), name: s(f, "name") || s(f, "email"), role: role as AdminRole, password: s(f, "password") });
    await audit(db(), a.actor, "user.create", "admin_user", id, `Created ${s(f, "email")} as ${role}`);
  } catch (err) {
    done(`err=${encodeURIComponent((err as Error).message)}`);
  }
  done(`msg=${encodeURIComponent("User created. Share the temporary password privately and ask them to change it.")}`);
}

async function otherActiveOwners(exceptId: string) {
  return db().select({ id: user.id }).from(user).where(and(eq(user.role, "owner"), eq(user.disabled, false), ne(user.id, exceptId)));
}

export async function updateUserAction(f: FormData) {
  const a = await assertAdmin("users:manage");
  const id = s(f, "id");
  const role = s(f, "role");
  const disabled = f.get("disabled") === "on";
  const [u] = await db().select().from(user).where(eq(user.id, id));
  if (!u || !isRole(role)) done(`err=${encodeURIComponent("User or role not found.")}`);
  if (id === a.id && (disabled || role !== u!.role)) done(`err=${encodeURIComponent("You can't change your own role or disable yourself.")}`);
  if (u!.role === "owner" && (role !== "owner" || disabled) && (await otherActiveOwners(id)).length === 0) done(`err=${encodeURIComponent("Keep at least one active owner.")}`);
  await db().update(user).set({ role: role as AdminRole, disabled, updatedAt: new Date() }).where(eq(user.id, id));
  if (disabled || role !== u!.role) await db().delete(session).where(eq(session.userId, id)); // sign them out everywhere
  await audit(db(), a.actor, "user.update", "admin_user", id, `${u!.email}: role ${u!.role}→${role}, disabled ${disabled}`);
  done(`msg=${encodeURIComponent("Saved. Their sessions were signed out where access changed.")}`);
}

export async function resetPasswordAction(f: FormData) {
  const a = await assertAdmin("users:manage");
  const id = s(f, "id");
  try {
    await setAdminPassword(db(), id, s(f, "password"));
  } catch (err) {
    done(`err=${encodeURIComponent((err as Error).message)}`);
  }
  if (id !== a.id) await db().delete(session).where(eq(session.userId, id));
  await audit(db(), a.actor, "user.password", "admin_user", id, "Password reset by owner");
  done(`msg=${encodeURIComponent("Password changed.")}`);
}

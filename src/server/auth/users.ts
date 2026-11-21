import "../guard";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import type { Executor } from "../db";
import { account, user } from "../db/schema";
import type { AdminRole } from "@/lib/types";

/** Create an admin user with an email/password credential (sign-up is disabled publicly). */
export async function createAdminUser(
  exec: Executor,
  o: { email: string; name: string; role: AdminRole; password: string },
): Promise<string> {
  if (o.password.length < 12) throw new Error("Password must be at least 12 characters.");
  const email = o.email.trim().toLowerCase();
  const [existing] = await exec.select().from(user).where(eq(user.email, email));
  if (existing) throw new Error(`An admin with ${email} already exists.`);
  const id = randomUUID();
  const now = new Date();
  await exec.insert(user).values({ id, name: o.name, email, emailVerified: true, role: o.role, createdAt: now, updatedAt: now });
  await exec.insert(account).values({
    id: randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: await hashPassword(o.password),
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function setAdminPassword(exec: Executor, userId: string, password: string) {
  if (password.length < 12) throw new Error("Password must be at least 12 characters.");
  await exec
    .update(account)
    .set({ password: await hashPassword(password), updatedAt: new Date() })
    .where(eq(account.userId, userId));
}

import "./guard";
import type { Executor } from "./db";
import { auditLog } from "./db/schema";

export interface Actor {
  id: string;
  email: string;
  role: string;
  ip?: string | null;
}

export const SYSTEM_ACTOR: Actor = { id: "system", email: "system", role: "system" };

/** Append-only audit trail for every operator action. */
export async function audit(
  exec: Executor,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string | null,
  summary: string,
  data?: Record<string, unknown>,
) {
  await exec.insert(auditLog).values({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action,
    entityType,
    entityId,
    summary,
    data: data ?? null,
    ip: actor.ip ?? null,
  });
}

import { asc } from "drizzle-orm";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/session";
import { ROLE_LABELS } from "@/server/auth/rbac";
import { Badge, Card, Flash, Page, dt } from "@/components/admin/ui";
import { Submit } from "@/components/admin/submit";
import { createUserAction, resetPasswordAction, updateUserAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function UsersAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireAdmin("users:manage");
  const sp = await searchParams;
  const users = await db().select().from(user).orderBy(asc(user.email));
  return (
    <Page title="Users & roles" subtitle="Public sign-up is disabled. Only an owner can add staff. Every change is written to the audit log.">
      <Flash sp={sp} />
      <div className="a-card mb-6 overflow-x-auto">
        <table className="a-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role & access</th>
              <th>Password</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <p className="font-semibold">{u.name}</p>
                  <p className="text-xs">{u.email}</p>
                  <p className="text-xs text-neutral-500">added {dt(u.createdAt)}</p>
                  {u.disabled ? <Badge tone="red">disabled</Badge> : null} {u.id === me.id ? <Badge>you</Badge> : null}
                </td>
                <td>
                  <form action={updateUserAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <select name="role" className="a-input w-auto" defaultValue={u.role} aria-label={`Role for ${u.email}`}>
                      {Object.entries(ROLE_LABELS).map(([r, l]) => (
                        <option key={r} value={r}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-sm">
                      <input type="checkbox" name="disabled" defaultChecked={u.disabled} /> disabled
                    </label>
                    <Submit className="a-btn">Save</Submit>
                  </form>
                </td>
                <td>
                  <form action={resetPasswordAction} className="flex gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <input name="password" type="password" minLength={12} autoComplete="new-password" className="a-input w-44" placeholder="new, 12+ chars" aria-label={`New password for ${u.email}`} />
                    <Submit className="a-btn">Set</Submit>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Card title="Add a staff member">
        <form action={createUserAction} className="grid gap-3 sm:grid-cols-4">
          <label>
            <span className="a-label">Email</span>
            <input name="email" type="email" required className="a-input" />
          </label>
          <label>
            <span className="a-label">Name</span>
            <input name="name" className="a-input" />
          </label>
          <label>
            <span className="a-label">Role</span>
            <select name="role" className="a-input" defaultValue="fulfillment">
              {Object.entries(ROLE_LABELS).map(([r, l]) => (
                <option key={r} value={r}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="a-label">Temporary password</span>
            <input name="password" type="password" minLength={12} required autoComplete="new-password" className="a-input" />
          </label>
          <div className="sm:col-span-4">
            <Submit>Create user</Submit>
          </div>
        </form>
      </Card>
    </Page>
  );
}

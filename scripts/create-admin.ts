/**
 * Create the first owner (or any staff account) from the command line.
 *
 *   npm run admin:create -- --email you@example.com --name "Owner" --role owner
 *
 * The password is read from ADMIN_PASSWORD, or a strong one is generated and
 * printed once. Sign-up is disabled in the app, so this is how the first owner
 * gets in; add the rest of the team from /admin/users.
 */
import "./_env";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { closeDb, db } from "../src/server/db";
import { createAdminUser } from "../src/server/auth/users";
import { ROLE_PERMISSIONS } from "../src/server/auth/rbac";
import type { AdminRole } from "../src/lib/types";

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" }, role: { type: "string", default: "owner" } },
  });
  if (!values.email) throw new Error("Pass --email");
  const role = values.role as AdminRole;
  if (!(role in ROLE_PERMISSIONS)) throw new Error(`--role must be one of ${Object.keys(ROLE_PERMISSIONS).join(", ")}`);
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD ?? randomBytes(18).toString("base64url");
  await createAdminUser(db(), { email: values.email, name: values.name ?? values.email, role, password });
  console.log(`Created ${role} ${values.email}.`);
  if (generated) console.log(`Temporary password (shown once): ${password}`);
}

main()
  .catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

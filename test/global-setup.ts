import { execSync } from "node:child_process";
import { Pool } from "pg";
import { TEST_ENV } from "./test-env";

export default async function setup() {
  const url = TEST_ENV.DATABASE_URL!;
  if (!/aha_test|_test\b|test/.test(new URL(url).pathname)) throw new Error(`Refusing to wipe a database that doesn't look like a test database: ${url}`);
  const pool = new Pool({ connectionString: url, max: 1 });
  await pool.query("drop schema if exists public cascade; create schema public; drop schema if exists drizzle cascade;");
  await pool.end();
  const env = { ...process.env, ...TEST_ENV };
  for (const k of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID"]) delete env[k];
  execSync("npx tsx scripts/migrate.ts", { stdio: "inherit", env });
  execSync("npx tsx scripts/seed.ts", { stdio: "ignore", env });
}

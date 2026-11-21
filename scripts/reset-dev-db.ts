/** Drop everything in the DATABASE_URL database, re-run migrations and seed. Development only. */
import "./_env";
import { execSync } from "node:child_process";
import { Pool } from "pg";

async function main() {
  if (process.env.APP_ENV === "production") throw new Error("Refusing to reset a production database.");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: 1 });
  await pool.query("drop schema if exists public cascade; create schema public; drop schema if exists drizzle cascade;");
  await pool.end();
  execSync("npx tsx scripts/migrate.ts", { stdio: "inherit" });
  execSync("npx tsx scripts/seed.ts", { stdio: "inherit" });
  // clear locally stored media from previous seeds is not needed: keys are deterministic
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

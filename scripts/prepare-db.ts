/**
 * Build step for hosted deploys (npm run build:vercel).
 *
 *  - DATABASE_URL set: apply migrations, then seed the development catalogue if the
 *    database is empty.
 *  - No DATABASE_URL (for example a fresh Vercel import with no settings): build a
 *    seeded demo database on embedded Postgres and pack it to .demo-db/seeded.tar.gz,
 *    plus per-build secrets in .demo-db/secrets.json. Every server instance starts
 *    from that snapshot (src/server/db), so the demo resets when instances restart.
 *    Payments run through the built-in simulator; nothing can charge real money.
 */
import "./_env";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

const tsx = join("node_modules", ".bin", "tsx");
const run = (script: string, env: NodeJS.ProcessEnv = process.env) => execFileSync(tsx, [script], { stdio: "inherit", env });

async function main() {
  if (process.env.DATABASE_URL) {
    run("scripts/migrate.ts");
    run("scripts/seed.ts");
    return;
  }
  if (process.env.APP_ENV === "production") throw new Error("DATABASE_URL is required with APP_ENV=production");

  console.log("No DATABASE_URL: building the demo store on embedded Postgres.");
  const root = ".demo-db";
  const dir = join(root, "data");
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  const env = { ...process.env, AHA_DEMO_DB_DIR: dir };
  run("scripts/migrate.ts", env);
  run("scripts/seed.ts", env);

  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite(dir);
  await pg.query("checkpoint");
  const dump = await pg.dumpDataDir("gzip");
  await pg.close();
  writeFileSync(join(root, "seeded.tar.gz"), Buffer.from(await dump.arrayBuffer()));
  rmSync(dir, { recursive: true, force: true });

  writeFileSync(
    join(root, "secrets.json"),
    JSON.stringify({ cookie: randomBytes(48).toString("base64url"), auth: randomBytes(48).toString("base64url") }),
  );
  console.log(`Demo database packed (${root}/seeded.tar.gz).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

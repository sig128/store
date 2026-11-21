import "./_env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Demo build without a database server: migrate the embedded Postgres folder
    // that scripts/prepare-db.ts packs for the server (see src/server/db).
    const dir = process.env.AHA_DEMO_DB_DIR;
    if (!dir || process.env.APP_ENV === "production") throw new Error("DATABASE_URL is not set");
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle: drizzleLite } = await import("drizzle-orm/pglite");
    const { migrate: migrateLite } = await import("drizzle-orm/pglite/migrator");
    const client = new PGlite(dir);
    await migrateLite(drizzleLite({ client }), { migrationsFolder: "./drizzle" });
    await client.close();
    console.log(`Migrations applied to the embedded demo database (${dir}).`);
    return;
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle({ client: pool });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

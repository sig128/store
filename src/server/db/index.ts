import "../guard";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzleLite } from "drizzle-orm/pglite";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
/** Anything that can run a query: the root client or an open transaction. */
export type Executor = DB | Tx;

const g = globalThis as unknown as { __ahaPool?: Pool; __ahaDb?: DB; __ahaLite?: PGlite };

/** The seeded demo database the build leaves behind when no DATABASE_URL is set (scripts/prepare-db.ts). */
export const DEMO_DB_FILE = ".demo-db/seeded.tar.gz";

/** No DATABASE_URL: a demo store on embedded Postgres (PGlite). Never in production. */
export const isDemoDb = () => !process.env.DATABASE_URL;

export function db(): DB {
  if (!g.__ahaDb) {
    const url = process.env.DATABASE_URL;
    if (url) {
      g.__ahaPool = new Pool({
        connectionString: url,
        max: Number(process.env.DB_POOL_MAX ?? 10),
        idleTimeoutMillis: 30_000,
      });
      g.__ahaDb = drizzle({ client: g.__ahaPool, schema });
    } else {
      g.__ahaDb = demoDb();
    }
  }
  return g.__ahaDb;
}

/**
 * Demo mode: real Postgres compiled to WebAssembly, in memory, loaded from the
 * snapshot the build seeded. Each server instance starts from that snapshot, so
 * bags and orders placed in the demo reset when the instance restarts.
 * At build time AHA_DEMO_DB_DIR points at an on-disk folder so migrations and the
 * seed can run as separate steps.
 */
function demoDb(): DB {
  if (process.env.APP_ENV === "production") throw new Error("DATABASE_URL is not set");
  const dir = process.env.AHA_DEMO_DB_DIR;
  let client: PGlite;
  if (dir) {
    client = new PGlite(dir);
  } else {
    const file = resolve(DEMO_DB_FILE);
    if (!existsSync(file)) throw new Error("DATABASE_URL is not set and no demo database was built (run `npm run build:vercel`).");
    client = new PGlite({ loadDataDir: new Blob([readFileSync(file)]) });
  }
  g.__ahaLite = client;
  // Same query builder and schema; only the wire driver differs.
  return drizzleLite({ client, schema }) as unknown as DB;
}

export async function closeDb(): Promise<void> {
  if (g.__ahaPool) {
    await g.__ahaPool.end();
    g.__ahaPool = undefined;
  }
  if (g.__ahaLite) {
    await g.__ahaLite.close();
    g.__ahaLite = undefined;
  }
  g.__ahaDb = undefined;
}

export { schema };

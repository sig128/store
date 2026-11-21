import "../guard";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
/** Anything that can run a query: the root client or an open transaction. */
export type Executor = DB | Tx;

const g = globalThis as unknown as { __ahaPool?: Pool; __ahaDb?: DB };

export function db(): DB {
  if (!g.__ahaDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    g.__ahaPool = new Pool({
      connectionString: url,
      max: Number(process.env.DB_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
    });
    g.__ahaDb = drizzle({ client: g.__ahaPool, schema });
  }
  return g.__ahaDb;
}

export async function closeDb(): Promise<void> {
  if (g.__ahaPool) {
    await g.__ahaPool.end();
    g.__ahaPool = undefined;
    g.__ahaDb = undefined;
  }
}

export { schema };

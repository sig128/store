import "./guard";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";

/**
 * Environment validation. Secrets live only in the server environment — never in
 * NEXT_PUBLIC_* variables, never in the database.
 */
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

const schema = z.object({
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  APP_URL: z.string().default("http://localhost:3000"),
  // Optional outside production: without it the store runs as a demo on embedded Postgres.
  DATABASE_URL: optional,
  COOKIE_SECRET: z.string().min(32, "COOKIE_SECRET must be at least 32 characters"),

  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: optional,

  PAYMENTS_SIMULATOR: optional,
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  STRIPE_PAYMENT_METHOD_TYPES: optional,
  PAYPAL_ENV: z.enum(["sandbox", "live"]).default("sandbox"),
  PAYPAL_CLIENT_ID: optional,
  PAYPAL_CLIENT_SECRET: optional,
  PAYPAL_WEBHOOK_ID: optional,

  EMAIL_PROVIDER: z.enum(["log", "smtp", "resend"]).default("log"),
  EMAIL_FROM: optional,
  EMAIL_REPLY_TO: optional,
  SMTP_URL: optional,
  RESEND_API_KEY: optional,

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_BUCKET: optional,
  S3_REGION: optional,
  S3_ENDPOINT: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  S3_PUBLIC_BASE_URL: optional,

  FULFILLMENT_PROVIDER: z.enum(["manual", "pod"]).default("manual"),
  POD_API_KEY: optional,
  POD_API_BASE: optional,

  CRON_SECRET: optional,
  WORKER_POLL_MS: z.coerce.number().int().positive().default(2000),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Written by the build next to the demo database (scripts/prepare-db.ts). */
export const DEMO_SECRETS_FILE = ".demo-db/secrets.json";

/**
 * Zero-config deploys (a fresh Vercel import with no settings): use the platform's
 * address, and in demo mode (no DATABASE_URL) the build's own secrets and the
 * payment simulator. Never applies in production, and never overrides a value
 * that is set.
 */
function withDemoDefaults(src: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...src };
  if (src.APP_ENV === "production") return out;
  const host = src.VERCEL_PROJECT_PRODUCTION_URL || src.VERCEL_URL;
  if (!src.APP_URL && host) out.APP_URL = `https://${host}`;
  if (!src.DATABASE_URL) {
    if (!src.PAYMENTS_SIMULATOR) out.PAYMENTS_SIMULATOR = "1";
    if (!src.COOKIE_SECRET || !src.BETTER_AUTH_SECRET) {
      const s = demoSecrets();
      out.COOKIE_SECRET ||= s.cookie;
      out.BETTER_AUTH_SECRET ||= s.auth;
    }
  }
  return out;
}

function demoSecrets(): { cookie: string; auth: string } {
  const file = resolve(DEMO_SECRETS_FILE);
  if (existsSync(file)) {
    try {
      const j = JSON.parse(readFileSync(file, "utf8")) as { cookie?: string; auth?: string };
      if (j.cookie && j.auth) return { cookie: j.cookie, auth: j.auth };
    } catch {
      /* fall through to per-process secrets */
    }
  }
  const g = globalThis as unknown as { __ahaDemoSecrets?: { cookie: string; auth: string } };
  g.__ahaDemoSecrets ??= { cookie: randomBytes(48).toString("base64url"), auth: randomBytes(48).toString("base64url") };
  return g.__ahaDemoSecrets;
}

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(withDemoDefaults(process.env));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  if (parsed.data.APP_ENV === "production" && !parsed.data.DATABASE_URL) {
    throw new Error("Invalid environment configuration: DATABASE_URL is required with APP_ENV=production");
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = () => env().APP_ENV === "production";

/** The payment simulator is a test harness. It can never run in production. */
export function simulatorEnabled(): boolean {
  const e = env();
  return e.APP_ENV !== "production" && e.PAYMENTS_SIMULATOR === "1";
}

export function appUrl(path = ""): string {
  const base = env().APP_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") || path === "" ? path : `/${path}`}`;
}

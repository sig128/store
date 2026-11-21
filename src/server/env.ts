import "./guard";
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
  DATABASE_URL: z.string().min(1),
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

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
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

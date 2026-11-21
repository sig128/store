import "../guard";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { brand } from "@/config/brand";
import { db } from "../db";
import { account, session, user, verification } from "../db/schema";
import { env } from "../env";

/**
 * Admin authentication (Better Auth, email + password, database sessions).
 * Public sign-up is disabled: accounts are created by an owner in /admin/users or
 * with `npm run admin:create`. Customers never have accounts.
 */
function create() {
  const e = env();
  return betterAuth({
    appName: `${brand.name} admin`,
    baseURL: e.BETTER_AUTH_URL ?? e.APP_URL,
    secret: e.BETTER_AUTH_SECRET,
    basePath: "/api/auth",
    database: drizzleAdapter(db(), { provider: "pg", schema: { user, session, account, verification } }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: false,
    },
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "viewer", input: false },
        disabled: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 12, // 12 hours
      updateAge: 60 * 60,
    },
    rateLimit: { enabled: true, window: 60, max: 30, customRules: { "/sign-in/email": { window: 60, max: 5 } } },
    advanced: {
      cookiePrefix: "aha_admin",
      useSecureCookies: e.APP_URL.startsWith("https://"),
    },
    trustedOrigins: [e.APP_URL],
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof create>;
const g = globalThis as unknown as { __ahaAuth?: Auth };

export function getAuth(): Auth {
  g.__ahaAuth ??= create();
  return g.__ahaAuth;
}

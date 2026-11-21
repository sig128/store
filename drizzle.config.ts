import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://aha:aha_dev_pw@127.0.0.1:5432/aha_dev",
  },
  strict: true,
  verbose: false,
});

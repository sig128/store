/** Environment for the test run. Never points at the development or production database. */
export const TEST_ENV: Record<string, string> = {
  APP_ENV: "test",
  APP_URL: "http://localhost:3999",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://aha:aha_dev_pw@127.0.0.1:5432/aha_test",
  COOKIE_SECRET: "test-cookie-secret-0123456789abcdef0123456789",
  BETTER_AUTH_SECRET: "test-auth-secret-0123456789abcdef0123456789ab",
  PAYMENTS_SIMULATOR: "1",
  EMAIL_PROVIDER: "log",
  EMAIL_FROM: "After Hours Athletics <orders@example.test>",
  STORAGE_DRIVER: "local",
  STORAGE_LOCAL_DIR: "./storage-test",
  FULFILLMENT_PROVIDER: "manual",
  SEED_ADMIN_EMAIL: "owner@test.invalid",
  SEED_ADMIN_PASSWORD: "test-owner-password-1",
};

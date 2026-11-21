import { TEST_ENV } from "./test-env";

for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
// Provider credentials from a developer's shell must never leak into tests.
for (const k of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "CRON_SECRET", "POD_API_KEY"]) delete process.env[k];

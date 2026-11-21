import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit + integration tests. Integration tests run against a separate PostgreSQL
 * database (TEST_DATABASE_URL, default aha_test) that is wiped, migrated and
 * seeded once per run. Files run one at a time because they share that database.
 */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup-env.ts"],
    globalSetup: ["test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});

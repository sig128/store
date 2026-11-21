// Loads .env for standalone scripts (Next.js loads it itself). Existing
// environment variables always win over the file.
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) {
    try {
      process.loadEnvFile(file);
    } catch {
      /* ignore malformed optional files */
    }
  }
}
export {};

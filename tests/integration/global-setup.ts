import { execSync } from "node:child_process";
import { loadEnv } from "vite";

/**
 * Applies pending migrations to the dedicated test database (non-destructive).
 * Tables are emptied before each test by setup.ts.
 */
export default function setup() {
  const env = loadEnv("test", process.cwd(), "");
  const url = env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is not set (see .env.example)");
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error(`Refusing to run tests against a database whose name does not contain "test": ${url}`);
  }
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
    stdio: "pipe",
  });
}

import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const env = loadEnv("test", process.cwd(), "");
const testDatabaseUrl = env.DATABASE_URL_TEST ?? "";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    // Integration files share one database, so files never run in parallel.
    fileParallelism: false,
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 30_000,
          hookTimeout: 120_000,
          env: {
            DATABASE_URL: testDatabaseUrl,
            AUTH_SECRET: "test-secret-test-secret-test-secret-123",
            SMS_PROVIDER: "console",
            ADMIN_USERNAME: "admin",
            ADMIN_PASSWORD: "Admin@12345",
          },
        },
      },
    ],
  },
});

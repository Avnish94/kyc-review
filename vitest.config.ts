import path from "node:path";
import { defineConfig } from "vitest/config";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://kyc:kyc@localhost:5432/kyc_test";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // Integration tests share one database, so test files run one at a time.
    fileParallelism: false,
    env: { DATABASE_URL: TEST_DATABASE_URL, APP_BASE_URL: "http://localhost:3000" },
  },
});

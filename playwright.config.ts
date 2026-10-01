import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

/**
 * Golden-path browser tests. They reset and reseed the database named by DATABASE_URL, run a
 * production build of the app plus the mock OIDC provider. Run `npm run build` first.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run mock:oidc",
      url: "http://localhost:4011/.well-known/openid-configuration",
      env: { MOCK_OIDC_PORT: "4011" },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npx next start -p ${PORT}`,
      url: `${baseURL}/api/health`,
      env: {
        APP_BASE_URL: baseURL,
        AUTH_MOCK_ENABLED: "true",
        AUTH_OIDC_ISSUER: "http://localhost:4011",
        AUTH_ENTRA_CLIENT_ID: "kyc-review-e2e",
        AUTH_ENTRA_CLIENT_SECRET: "mock-secret",
        SCREENING_WEBHOOK_SECRET: "e2e-webhook-secret",
        STORAGE_DRIVER: "local",
        LOCAL_STORAGE_DIR: "./storage-e2e",
        TEAMS_WEBHOOK_URL: "",
      },
      reuseExistingServer: !process.env.CI,
    },
  ],
});

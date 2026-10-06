import { execSync } from "node:child_process";

/** Recreates the test database from the migrations (including the audit append-only trigger). */
export default function setup() {
  execSync("npx prisma migrate reset --force --skip-seed --skip-generate", {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://kyc:kyc@localhost:5432/kyc_test" },
    stdio: "ignore",
  });
}

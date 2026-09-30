import { execSync } from "node:child_process";

/** Creates a fresh, empty SQLite database for integration tests (prisma/test.db). */
export default function setup() {
  execSync("npx prisma db push --force-reset --skip-generate", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "ignore",
  });
}

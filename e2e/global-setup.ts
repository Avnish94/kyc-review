import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

export default function globalSetup() {
  rmSync("storage-e2e", { recursive: true, force: true });
  execSync("npx prisma migrate reset --force --skip-generate", {
    stdio: "inherit",
    env: { ...process.env, STORAGE_DRIVER: "local", LOCAL_STORAGE_DIR: "./storage-e2e" },
  });
}

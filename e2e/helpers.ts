import { expect, type Page } from "@playwright/test";

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/cases$/);
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Seeded demo fixture case numbers (see prisma/seed.ts DEMO_FIXTURES). */
export const caseRefSuffix = (n: number) => `-${String(n).padStart(4, "0")}`;

/** Searches the queue and opens the first matching case. */
export async function openCase(page: Page, query: string) {
  await page.getByLabel("Search").fill(query);
  await page.getByLabel("Search").press("Enter");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(query);
  await expect(page.getByText(/^1 case/)).toBeVisible();
  await page.getByRole("link", { name: "Review", exact: true }).first().click();
  await expect(page).toHaveURL(/\/cases\/[^/?]+$/);
}

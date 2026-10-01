import { expect, test } from "@playwright/test";
import { syntheticPdf } from "../scripts/synthetic-pdf";
import { caseRefSuffix, login, logout, openCase } from "./helpers";

test.describe.configure({ mode: "serial" });

test("analyst prepares a high-risk case and a different admin approves it (four-eyes)", async ({ page }) => {
  await login(page, "analyst@demo.local", "analyst123");

  // Queue: my open cases, then open the seeded high-risk fixture case.
  await page.getByRole("link", { name: /My open cases/ }).click();
  await expect(page).toHaveURL(/scope=mine/);
  await openCase(page, caseRefSuffix(5));
  await expect(page.getByTestId("assignee-name")).toHaveText("Ava Chen");
  const caseUrl = page.url();

  // High risk: no direct approval, only submit-for-approval.
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Submit for approval" })).toBeEnabled();

  // Upload every missing required evidence item.
  const missing = page.getByTestId("evidence-checklist").locator("li", { hasText: "○" });
  const count = await missing.count();
  for (let i = 0; i < count; i++) {
    const label = (await missing.first().innerText()).replace("○", "").trim();
    await page.getByLabel("Document type").selectOption({ label });
    await page.getByLabel(/^File/).setInputFiles({
      name: `${label.toLowerCase().replace(/\W+/g, "-")}.pdf`,
      mimeType: "application/pdf",
      buffer: Buffer.from(syntheticPdf([`SYNTHETIC ${label}`])),
    });
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(page.getByText("Document uploaded.")).toBeVisible();
    await expect(missing).toHaveCount(count - i - 1);
  }

  await page.getByLabel("Recommend approval").check();
  await page.getByLabel("Reviewer note").fill("Screening hit is a false positive; evidence attached.");
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Awaiting approval" })).toBeVisible();
  await expect(page.getByText("submitted this case for four-eyes approval")).toBeVisible();
  await logout(page);

  // Admin: notification + approvals view, then approve.
  await login(page, "admin@demo.local", "admin123");
  await expect(page.getByRole("link", { name: /Notifications \([1-9]\d* unread\)/ })).toBeVisible();
  await page.goto(caseUrl);
  await page.getByLabel("Reviewer note").fill("Agree with recommendation.");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Approved" })).toBeVisible();

  const timeline = page.getByTestId("audit-timeline");
  await expect(timeline.locator("li").first()).toContainText("Approve");
  await expect(timeline.locator("li").first()).toContainText("Marcus Reid");
  await expect(timeline).toContainText("Submit for approval");
  await expect(timeline).toContainText("Recommend approval");
  await expect(timeline).toContainText("Document uploaded");
});

test("an analyst cannot work a case assigned to someone else and cannot open admin pages", async ({ page }) => {
  await login(page, "analyst2@demo.local", "analyst123");
  await openCase(page, caseRefSuffix(7));
  await expect(page.getByText("This case is assigned to someone else.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Assign to me" })).toHaveCount(0);

  await expect(page.getByRole("link", { name: "Rules" })).toHaveCount(0);
  await page.goto("/admin/rules");
  await expect(page).toHaveURL(/\/cases$/);
  expect((await page.request.get("/api/export/cases")).status()).toBe(403);
});

test("an admin publishes a new rule version", async ({ page }) => {
  await login(page, "admin@demo.local", "admin123");
  await page.getByRole("link", { name: "Rules" }).click();
  await page.getByLabel("SLA hours HIGH").fill("12");
  await page.getByLabel(/Change description/).fill("Tighten high-risk SLA");
  await page.getByRole("button", { name: "Publish as v2" }).click();
  await expect(page.getByText("Published rule set v2.")).toBeVisible();
  await expect(page.getByText("Tighten high-risk SLA")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish as v3" })).toBeVisible();
});

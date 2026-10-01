import { expect, test } from "@playwright/test";
import { SIGNATURE_HEADER, signWebhookBody } from "../src/lib/integrations/webhook-signature";
import { login, openCase } from "./helpers";

test("Microsoft sign-in provisions a user with the role from Entra", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Sign in with Microsoft" }).click();
  await page.getByRole("button", { name: /Priya Nair/ }).click();
  await expect(page).toHaveURL(/\/cases$/);
  await expect(page.getByText("priya.nair@contoso.example")).toBeVisible();
  await expect(page.getByText("Analyst", { exact: true })).toBeVisible();
});

test("Microsoft sign-in without a KYC app role is refused", async ({ page }) => {
  await page.goto("/auth/entra/start");
  await page.getByRole("button", { name: /Casey Morgan/ }).click();
  await expect(page).toHaveURL(/\/login\?error=no_role/);
  await expect(page.getByText("Your Microsoft account has no KYC Review role")).toBeVisible();
});

test("a signed screening webhook creates a case; unsigned requests are rejected", async ({ page, request }) => {
  const alertId = `E2E-${Date.now()}`;
  const body = JSON.stringify({
    eventId: `evt-${alertId}`,
    alertId,
    occurredAt: new Date().toISOString(),
    customer: {
      name: "Webhook Testperson",
      type: "INDIVIDUAL",
      dateOfBirth: "1985-02-03",
      nationality: "Ireland",
      countryOfResidence: "Ireland",
      email: "webhook.testperson@example.com",
      phone: "+1 555-0199",
      address: "1 Synthetic Way, Dublin, Ireland",
      occupation: "Analyst",
      documentType: "Passport",
      documentNumberLast4: "4321",
    },
    alert: { reason: "SANCTIONS_NEAR_MATCH", score: 91, detail: "E2E synthetic alert" },
  });

  expect((await request.post("/api/webhooks/screening", { data: body, headers: { "content-type": "application/json" } })).status()).toBe(401);

  const signed = () => ({
    "content-type": "application/json",
    [SIGNATURE_HEADER]: signWebhookBody(body, "e2e-webhook-secret", Math.floor(Date.now() / 1000)),
  });
  const created = await request.post("/api/webhooks/screening", { data: body, headers: signed() });
  expect(created.status()).toBe(201);
  const duplicate = await request.post("/api/webhooks/screening", { data: body, headers: signed() });
  expect(duplicate.status()).toBe(200);
  expect((await duplicate.json()).status).toBe("duplicate");

  await login(page, "admin2@demo.local", "admin123");
  await openCase(page, "Webhook Testperson");
  await expect(page.getByText("via screening webhook")).toBeVisible();
  await expect(page.getByTestId("audit-timeline")).toContainText("Automated Screening");
});

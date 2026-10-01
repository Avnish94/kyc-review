/**
 * Sends signed synthetic screening alerts to the running app, as a screening vendor would.
 * Usage: npm run simulate:screening -- [count]
 */
import { faker } from "@faker-js/faker";
import { randomUUID } from "node:crypto";
import { SIGNATURE_HEADER, signWebhookBody } from "../src/lib/integrations/webhook-signature";
import { REVIEW_REASONS } from "../src/lib/kyc/types";

const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
const secret = process.env.SCREENING_WEBHOOK_SECRET;
const count = Number(process.argv[2] ?? 1);

async function main() {
  if (!secret) throw new Error("SCREENING_WEBHOOK_SECRET is not set");
  for (let i = 0; i < count; i++) {
    const first = faker.person.firstName();
    const last = faker.person.lastName();
    const country = faker.location.country();
    const body = JSON.stringify({
      eventId: randomUUID(),
      alertId: `SIM-${randomUUID()}`,
      occurredAt: new Date().toISOString(),
      customer: {
        name: `${first} ${last}`,
        type: "INDIVIDUAL",
        dateOfBirth: faker.date.birthdate({ mode: "age", min: 20, max: 80 }).toISOString().slice(0, 10),
        nationality: country,
        countryOfResidence: country,
        email: faker.internet.email({ firstName: first, lastName: last, provider: "example.com" }),
        phone: `+1 555-01${faker.string.numeric(2)}`,
        address: `${faker.location.streetAddress()}, ${faker.location.city()}, ${country}`,
        occupation: faker.person.jobTitle(),
        documentType: "Passport",
        documentNumberLast4: faker.string.numeric(4),
      },
      alert: {
        reason: faker.helpers.arrayElement(REVIEW_REASONS),
        score: faker.number.int({ min: 10, max: 98 }),
        detail: "Synthetic alert from the local screening simulator.",
      },
    });
    const res = await fetch(`${baseUrl}/api/webhooks/screening`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-kyc-provider": "simulator",
        [SIGNATURE_HEADER]: signWebhookBody(body, secret, Math.floor(Date.now() / 1000)),
      },
      body,
    });
    console.log(res.status, await res.text());
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

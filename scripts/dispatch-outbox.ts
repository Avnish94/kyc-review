/** Delivers pending outbox messages (Teams). Run on a schedule, e.g. an Azure Container Apps job. */
import { PrismaClient } from "@prisma/client";
import { dispatchOutbox } from "../src/lib/notifications";

const prisma = new PrismaClient();

dispatchOutbox(prisma)
  .then((r) => console.log(JSON.stringify(r)))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

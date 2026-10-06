import { NextResponse } from "next/server";
import { authorizeExport } from "@/lib/auth/export-user";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/reporting";

export async function GET(request: Request) {
  const auth = await authorizeExport(request, "cases");
  if (auth instanceof NextResponse) return auth;

  const cases = await prisma.kycCase.findMany({
    orderBy: { caseNumber: "asc" },
    include: { assignee: { select: { email: true } } },
  });
  const csv = toCsv(
    ["case_ref", "customer_name", "customer_type", "country_of_residence", "risk_score", "risk_level", "review_reason", "status", "assignee", "created_at", "due_at", "decided_at", "source"],
    cases.map((c) => [
      c.caseRef, c.customerName, c.customerType, c.countryOfResidence, c.riskScore, c.riskLevel, c.reviewReason,
      c.status, c.assignee?.email, c.createdAt, c.dueAt, c.decidedAt, c.source,
    ]),
  );
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="kyc-cases-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}

import { NextResponse } from "next/server";
import { authorizeExport } from "@/lib/auth/export-user";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/reporting";

export async function GET(request: Request) {
  const auth = await authorizeExport(request, "audit");
  if (auth instanceof NextResponse) return auth;

  const events = await prisma.auditEvent.findMany({
    orderBy: { createdAt: "asc" },
    include: { case: { select: { caseRef: true } }, actor: { select: { email: true, role: true } } },
  });
  const csv = toCsv(
    ["timestamp", "case_ref", "action", "from_status", "to_status", "actor_email", "actor_role", "rule_set_version", "note"],
    events.map((e) => [e.createdAt, e.case.caseRef, e.action, e.fromStatus, e.toStatus, e.actor.email, e.actor.role, e.ruleSetVersion, e.note]),
  );
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="kyc-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}

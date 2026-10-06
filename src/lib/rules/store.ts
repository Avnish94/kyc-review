import type { Prisma } from "@prisma/client";
import { DEFAULT_RULES, ruleSetConfigSchema, type ActiveRules, type RuleSetConfig } from "@/lib/rules/config";

type Db = Prisma.TransactionClient;

/** Highest stored rule set version, or the built-in defaults (version 0) if none exist. */
export async function getActiveRules(db: Db): Promise<ActiveRules> {
  const latest = await db.ruleSet.findFirst({ orderBy: { version: "desc" } });
  if (!latest) return { version: 0, config: DEFAULT_RULES };
  const parsed = ruleSetConfigSchema.safeParse(latest.config);
  if (!parsed.success) throw new Error(`Rule set v${latest.version} is invalid: ${parsed.error.message}`);
  return { version: latest.version, config: parsed.data };
}

export async function listRuleSetVersions(db: Db) {
  return db.ruleSet.findMany({
    orderBy: { version: "desc" },
    select: { id: true, version: true, comment: true, createdAt: true, createdBy: { select: { name: true } } },
  });
}

/** Publishes a new rule set version. Versions are immutable; changes always create a new row. */
export async function publishRuleSet(
  db: Db,
  input: { config: RuleSetConfig; comment: string | null; createdById: string },
): Promise<number> {
  const current = await db.ruleSet.findFirst({ orderBy: { version: "desc" }, select: { version: true } });
  const version = (current?.version ?? 0) + 1;
  await db.ruleSet.create({
    data: {
      version,
      config: ruleSetConfigSchema.parse(input.config),
      comment: input.comment,
      createdById: input.createdById,
    },
  });
  return version;
}

import { describe, expect, it } from "vitest";
import { riskLevelForScore } from "@/lib/kyc/types";
import { DEFAULT_RULES, dueDateFor, missingEvidence, ruleSetConfigSchema } from "@/lib/rules/config";
import { parseRulesForm } from "@/lib/rules/form";

describe("rule set config", () => {
  it("accepts the defaults", () => {
    expect(ruleSetConfigSchema.parse(DEFAULT_RULES)).toEqual(DEFAULT_RULES);
  });

  it("rejects a high threshold that is not above the medium threshold", () => {
    const result = ruleSetConfigSchema.safeParse({ ...DEFAULT_RULES, riskThresholds: { medium: 60, high: 60 } });
    expect(result.success).toBe(false);
  });

  it("rejects unknown evidence categories and missing SLA levels", () => {
    expect(
      ruleSetConfigSchema.safeParse({ ...DEFAULT_RULES, requiredEvidence: { ...DEFAULT_RULES.requiredEvidence, PEP_MATCH: ["SELFIE"] } })
        .success,
    ).toBe(false);
    expect(ruleSetConfigSchema.safeParse({ ...DEFAULT_RULES, slaHours: { LOW: 10, MEDIUM: 10 } }).success).toBe(false);
  });

  it("maps scores to risk levels using the thresholds", () => {
    const t = { medium: 40, high: 70 };
    expect([0, 39, 40, 69, 70, 100].map((s) => riskLevelForScore(s, t))).toEqual(["LOW", "LOW", "MEDIUM", "MEDIUM", "HIGH", "HIGH"]);
  });

  it("computes missing evidence and SLA due dates", () => {
    expect(missingEvidence(DEFAULT_RULES, "PEP_MATCH", ["IDENTITY"])).toEqual(["SOURCE_OF_FUNDS"]);
    const from = new Date("2026-01-01T00:00:00Z");
    expect(dueDateFor(DEFAULT_RULES, "HIGH", from).toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });
});

describe("parseRulesForm", () => {
  function formFor(config = DEFAULT_RULES) {
    const fd = new FormData();
    fd.set("threshold.medium", String(config.riskThresholds.medium));
    fd.set("threshold.high", String(config.riskThresholds.high));
    for (const l of config.analystDecisionRiskLevels) fd.set(`analyst.${l}`, "on");
    for (const l of config.fourEyesRiskLevels) fd.set(`fourEyes.${l}`, "on");
    for (const [a, v] of Object.entries(config.notesRequired)) if (v) fd.set(`note.${a}`, "on");
    for (const [l, h] of Object.entries(config.slaHours)) fd.set(`sla.${l}`, String(h));
    for (const [r, cats] of Object.entries(config.requiredEvidence)) for (const c of cats) fd.set(`evidence.${r}.${c}`, "on");
    if (config.requireEvidenceToApprove) fd.set("requireEvidenceToApprove", "on");
    return fd;
  }

  it("round-trips the editor form", () => {
    expect(parseRulesForm(formFor())).toEqual({ ok: true, config: DEFAULT_RULES });
  });

  it("reports validation errors", () => {
    const fd = formFor();
    fd.set("sla.HIGH", "0");
    const result = parseRulesForm(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join()).toContain("slaHours.HIGH");
  });
});

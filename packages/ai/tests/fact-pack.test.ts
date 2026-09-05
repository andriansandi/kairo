import { describe, it, expect } from "vitest";
import {
  buildFactPack,
  SYSTEM_PROMPT,
  validateAnalysisOutput,
  deterministicFallback,
  NotConfiguredError,
  callModel,
  computeAllowedNumbers,
} from "../src/index";
import type { FactPack } from "@kairo/types";

function makeFactPack(): FactPack {
  return buildFactPack({
    snapshotId: "snap-1",
    generatedAt: "2026-09-05T10:00:00.000Z",
    data: {
      projects: [
        {
          id: "p1",
          name: "Apollo",
          deadline: "2026-11-30",
          declared_start: "2026-10-01",
          declared_end: "2026-10-31",
        },
      ],
      people: [{ id: "pe1", name: "Alice" }],
      conflicts: [
        {
          id: "conf-1",
          rule: "C1",
          severity: "at_risk",
          person_id: "pe1",
          project_id: "p1",
          team_id: null,
          phase_id: null,
          window_start: "2026-W41",
          window_end: "2026-W42",
          explanation: "Alice is over-allocated at 1.25 FTE",
          metrics: { max_utilization: 1.25, weeks_affected: 2 },
        },
      ],
      feasibility: [
        {
          project_id: "p1",
          verdict: "warning",
          computed_finish: "2026-11-10",
          slack_days: -10,
          buffer_days: 5,
        },
      ],
      teamWeeks: [
        {
          team_id: "t1",
          week_key: "2026-W41",
          utilization: 1.1,
          available_h: 240,
          planned_h: 264,
        },
      ],
      skillCoverage: [
        {
          skill_id: "s1",
          skill_name: "DevOps",
          total_people: 2,
          free_hours: 40,
          spof: true,
        },
      ],
    },
  });
}

describe("buildFactPack", () => {
  it("produces stable prefixed ids", () => {
    const pack = makeFactPack();
    const ids = pack.facts.map((f) => f.id);
    expect(ids).toEqual([
      "P:1",
      "E:1",
      "C:1",
      "F:1",
      "T:1",
      "S:1",
    ]);
    expect(pack.snapshot_id).toBe("snap-1");
    expect(pack.generated_at).toBe("2026-09-05T10:00:00.000Z");
  });

  it("scopes facts to a subject", () => {
    const pack = buildFactPack({
      snapshotId: "snap-1",
      generatedAt: "2026-09-05T10:00:00.000Z",
      subject: { type: "project", id: "p2" },
      data: {
        projects: [
          { id: "p1", name: "Apollo", deadline: null, declared_start: null, declared_end: null },
          { id: "p2", name: "Borealis", deadline: null, declared_start: null, declared_end: null },
        ],
        people: [],
        conflicts: [
          {
            id: "c1",
            rule: "C1",
            severity: "critical",
            person_id: null,
            project_id: "p2",
            team_id: null,
            phase_id: null,
            window_start: "2026-W41",
            window_end: "2026-W41",
            explanation: "p2 conflict",
            metrics: {},
          },
        ],
        feasibility: [],
        teamWeeks: [],
        skillCoverage: [],
      },
    });
    const types = pack.facts.map((f) => f.type);
    expect(types).toContain("project");
    expect(pack.facts.length).toBe(2);
  });

  it("has required system prompt rules", () => {
    expect(SYSTEM_PROMPT).toContain("only facts");
    expect(SYSTEM_PROMPT).toContain("cited");
  });
});

describe("validateAnalysisOutput", () => {
  it("accepts a valid output", () => {
    const pack = makeFactPack();
    const output = {
      summary: "Apollo has a conflict.",
      claims: [
        { text: "Alice is over-allocated by 1.25 FTE.", fact_ids: ["C:1"] },
      ],
    };
    const result = validateAnalysisOutput(output, pack, computeAllowedNumbers(pack));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects unknown citations", () => {
    const pack = makeFactPack();
    const output = {
      summary: "Bad claim.",
      claims: [{ text: "Something.", fact_ids: ["C:99"] }],
    };
    const result = validateAnalysisOutput(output, pack, []);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("unknown fact id"))).toBe(true);
  });

  it("rejects hallucinated numbers", () => {
    const pack = makeFactPack();
    const output = {
      summary: "Wrong number.",
      claims: [{ text: "Utilization is 7.5.", fact_ids: ["T:1"] }],
    };
    const result = validateAnalysisOutput(output, pack, computeAllowedNumbers(pack));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("7.5"))).toBe(true);
  });

  it("allows arithmetic of known numbers", () => {
    const pack = makeFactPack();
    const output = {
      summary: "Sum.",
      claims: [
        { text: "Total planned and available is 504 hours.", fact_ids: ["T:1"] },
      ],
    };
    const result = validateAnalysisOutput(output, pack, computeAllowedNumbers(pack));
    expect(result.valid).toBe(true);
  });

  it("surfaces errors useful for retry hints", () => {
    const pack = makeFactPack();
    const result = validateAnalysisOutput(
      { summary: "Empty.", claims: [] },
      pack,
      [],
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("deterministicFallback", () => {
  it("builds conflict summary", () => {
    const pack = makeFactPack();
    const result = deterministicFallback(pack, "explain");
    expect(result.summary).toContain("1 conflict");
    expect(result.details[0]).toContain("over-allocated");
    expect(result.cited_fact_ids).toContain("C:1");
  });

  it("builds recommendation summary", () => {
    const pack = makeFactPack();
    const result = deterministicFallback(pack, "recommend");
    expect(result.summary).toContain("Recommend");
    expect(result.details.length).toBeGreaterThan(0);
  });

  it("accepts subject argument", () => {
    const pack = makeFactPack();
    const result = deterministicFallback(pack, { type: "project", id: "p1" }, "explain");
    expect(result.details[0]).toContain("over-allocated");
  });
});

describe("callModel", () => {
  it("throws NotConfiguredError when gateway_url missing", async () => {
    await expect(callModel({}, [])).rejects.toBeInstanceOf(NotConfiguredError);
  });
});

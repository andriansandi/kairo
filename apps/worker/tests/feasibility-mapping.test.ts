import { describe, it, expect } from "vitest";
import {
  toFeasibilityResultPersistence,
  toFeasibilitySummary,
  resolveConflictThresholds,
  buildConflictEngineInput,
  DEFAULT_CONFLICT_THRESHOLDS,
} from "../src/services/snapshot";
import type { FeasibilityResult } from "@kairo/planning-engine";
import type { ConflictEngineInput } from "@kairo/conflict-engine";

describe("feasibility result persistence mapping", () => {
  const baseResult: FeasibilityResult = {
    project_id: "pr1",
    computed_start: "2026-10-01",
    computed_finish: "2026-11-15",
    declared_finish: "2026-11-30",
    deadline: "2026-11-30",
    slack_days: 5,
    buffer_days: 10,
    verdict: "healthy",
    drivers: ["on track"],
    critical_path: ["ph1", "ph2"],
    per_phase: [
      {
        phase_id: "ph1",
        phase_name: "Design",
        computed_start: "2026-10-01",
        computed_finish: "2026-10-15",
        staffed_fte: 1.5,
        effort_hours: 120,
        duration_weeks: 2,
      },
      {
        phase_id: "ph2",
        phase_name: "Build",
        computed_start: "2026-10-16",
        computed_finish: "2026-11-15",
        staffed_fte: 2,
        effort_hours: 320,
        duration_weeks: 5,
      },
    ],
  };

  it("maps a healthy result to a persistence row verbatim", () => {
    const row = toFeasibilityResultPersistence("snap1", baseResult);

    expect(row.snapshot_id).toBe("snap1");
    expect(row.project_id).toBe("pr1");
    expect(row.slack_days).toBe(5);
    expect(row.buffer_days).toBe(10);
    expect(row.verdict).toBe("healthy");
    expect(JSON.parse(row.drivers)).toEqual(["on track"]);
    expect(JSON.parse(row.critical_path)).toEqual(["ph1", "ph2"]);
    expect(JSON.parse(row.per_phase_load)).toEqual({ ph1: 1.5, ph2: 2 });
  });

  it("stores 0 slack and appends a driver when the project has no deadline", () => {
    const result: FeasibilityResult = {
      ...baseResult,
      deadline: null,
      slack_days: null,
      drivers: [],
    };

    const row = toFeasibilityResultPersistence("snap1", result);

    expect(row.slack_days).toBe(0);
    expect(JSON.parse(row.drivers)).toEqual(["no deadline set"]);
  });

  it("summarizes null slack as 0 for conflict engine input", () => {
    const result: FeasibilityResult = {
      ...baseResult,
      slack_days: null,
      buffer_days: 8,
      verdict: "warning",
    };

    const summary = toFeasibilitySummary(result);

    expect(summary.project_id).toBe("pr1");
    expect(summary.slack_days).toBe(0);
    expect(summary.buffer_days).toBe(8);
    expect(summary.verdict).toBe("warning");
  });
});

describe("conflict threshold resolution", () => {
  it("parses a valid app_setting JSON value", () => {
    const thresholds = resolveConflictThresholds(
      JSON.stringify({ personAtRisk: 0.9, deadlineCriticalDays: 14 }),
    );
    expect(thresholds.personAtRisk).toBe(0.9);
    expect(thresholds.deadlineCriticalDays).toBe(14);
    expect(thresholds.personCritical).toBe(
      DEFAULT_CONFLICT_THRESHOLDS.personCritical,
    );
  });

  it("falls back to defaults when JSON is invalid or missing", () => {
    expect(resolveConflictThresholds(undefined)).toEqual(
      DEFAULT_CONFLICT_THRESHOLDS,
    );
    expect(resolveConflictThresholds("not json")).toEqual(
      DEFAULT_CONFLICT_THRESHOLDS,
    );
  });
});

describe("expanded conflict engine input assembly", () => {
  it("passes new fields through and maps feasibility summaries", () => {
    const ledger: ConflictEngineInput["ledger"] = [];
    const teamWeeks: ConflictEngineInput["teamWeeks"] = [];
    const people: ConflictEngineInput["people"] = [];
    const teams: ConflictEngineInput["teams"] = [];
    const projects: ConflictEngineInput["projects"] = [];
    const phases: ConflictEngineInput["phases"] = [];
    const allocations: ConflictEngineInput["allocations"] = [];
    const calendar: ConflictEngineInput["calendar"] = {
      id: "default",
      workingDays: [1, 2, 3, 4, 5],
      holidays: [],
    };
    const horizon: ConflictEngineInput["horizon"] = {
      from: "2026-10-01",
      to: "2026-12-31",
    };
    const skills: ConflictEngineInput["skills"] = [
      { id: "s1", name: "Drupal", category: "cms", aliases: [] },
    ];
    const personSkills: ConflictEngineInput["personSkills"] = [
      {
        id: "ps1",
        person_id: "p1",
        skill_id: "s1",
        level: 4,
        source: "manual",
        verified_by: null,
      },
    ];
    const jrSkillRequirements: ConflictEngineInput["jrSkillRequirements"] = [
      {
        id: "jr1",
        work_item_id: "wi1",
        skill_id: "s1",
        min_level: 3,
        weight: "must",
        source: "manual",
      },
    ];
    const workItems: ConflictEngineInput["workItems"] = [
      {
        id: "wi1",
        project_id: "pr1",
        plane_id: "pl1",
        title: "Task",
        status: "todo",
        priority: 3,
        assignee_ids: [],
        start_date: null,
        due_date: null,
        estimate_raw: null,
        estimate_normalized_hours: 40,
        cycle: null,
        labels: [],
        updated_at: "2026-09-01T00:00:00.000Z",
      },
    ];
    const dependencies: ConflictEngineInput["dependencies"] = [
      {
        id: "d1",
        from_project_id: "pr1",
        from_phase_id: null,
        to_project_id: "pr2",
        to_phase_id: null,
        type: "FS",
        lag_days: 0,
        source: "manual",
      },
    ];
    const teamMemberships: ConflictEngineInput["teamMemberships"] = [
      { id: "tm1", person_id: "p1", team_id: "t1" },
    ];
    const feasibilityResults = [
      {
        project_id: "pr1",
        computed_start: "2026-10-01",
        computed_finish: "2026-11-15",
        declared_finish: "2026-11-30",
        deadline: null,
        slack_days: null,
        buffer_days: 10,
        verdict: "healthy" as const,
        drivers: [],
        critical_path: ["ph1"],
        per_phase: [],
      },
    ];

    const input = buildConflictEngineInput({
      ledger,
      teamWeeks,
      people,
      teams,
      projects,
      phases,
      allocations,
      calendar,
      horizon,
      skills,
      personSkills,
      jrSkillRequirements,
      workItems,
      dependencies,
      teamMemberships,
      feasibilityResults,
      now: "2026-09-15",
    });

    expect(input.skills).toEqual(skills);
    expect(input.personSkills).toEqual(personSkills);
    expect(input.jrSkillRequirements).toEqual(jrSkillRequirements);
    expect(input.workItems).toEqual(workItems);
    expect(input.dependencies).toEqual(dependencies);
    expect(input.teamMemberships).toEqual(teamMemberships);
    expect(input.feasibilityResults).toEqual([
      { project_id: "pr1", slack_days: 0, buffer_days: 10, verdict: "healthy" },
    ]);
    expect(input.now).toBe("2026-09-15");
  });
});

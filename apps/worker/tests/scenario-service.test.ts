import { describe, it, expect } from "vitest";
import { diffScenarioResults, type ScenarioDerived } from "@kairo/scenario";
import type { FeasibilityResult } from "@kairo/planning-engine";
import {
  mapRoleRow,
  mapSkillRow,
  mapPersonSkillRow,
  mapWorkItemRow,
  mapDependencyRow,
  mapJrSkillRequirementRow,
  mapScenarioDefRow,
  mapConflictRowToEngine,
  mapFeasibilityRowToEngine,
} from "../src/services/scenario-service";
import { mapCapacityEntryRow } from "../src/services/snapshot";

describe("source row to scenario source mapping", () => {
  it("maps a role row with JSON seniority ladder", () => {
    const role = mapRoleRow({
      id: "r1",
      name: "Engineer",
      seniority_ladder: '["junior", "senior"]',
    });
    expect(role).toEqual({
      id: "r1",
      name: "Engineer",
      seniority_ladder: ["junior", "senior"],
    });
  });

  it("maps a skill row with aliases", () => {
    const skill = mapSkillRow({
      id: "s1",
      name: "TypeScript",
      category: "language",
      aliases: '["TS", "ts"]',
    });
    expect(skill).toEqual({
      id: "s1",
      name: "TypeScript",
      category: "language",
      aliases: ["TS", "ts"],
    });
  });

  it("maps a person skill row", () => {
    const ps = mapPersonSkillRow({
      id: "ps1",
      person_id: "p1",
      skill_id: "s1",
      level: 3,
      verified_by: null,
      source: "manual",
    });
    expect(ps).toEqual({
      id: "ps1",
      person_id: "p1",
      skill_id: "s1",
      level: 3,
      verified_by: null,
      source: "manual",
    });
  });

  it("maps a work item row with JSON arrays and nullable fields", () => {
    const wi = mapWorkItemRow({
      id: "wi1",
      project_id: "pr1",
      plane_id: "plane-wi1",
      title: "JR One",
      status: "todo",
      priority: 2,
      assignee_ids: '["p1"]',
      start_date: "2026-10-06",
      due_date: "2026-10-10",
      estimate_raw: "8h",
      estimate_normalized_hours: 8,
      cycle: "cycle-1",
      labels: '["backend"]',
      updated_at: "2026-10-01T00:00:00.000Z",
    });
    expect(wi).toEqual({
      id: "wi1",
      project_id: "pr1",
      plane_id: "plane-wi1",
      title: "JR One",
      status: "todo",
      priority: 2,
      assignee_ids: ["p1"],
      start_date: "2026-10-06",
      due_date: "2026-10-10",
      estimate_raw: "8h",
      estimate_normalized_hours: 8,
      cycle: "cycle-1",
      labels: ["backend"],
      updated_at: "2026-10-01T00:00:00.000Z",
    });
  });

  it("maps a dependency row", () => {
    const d = mapDependencyRow({
      id: "d1",
      from_project_id: "pr1",
      from_phase_id: null,
      to_project_id: "pr2",
      to_phase_id: null,
      type: "FS",
      lag_days: 2,
      source: "manual",
    });
    expect(d).toEqual({
      id: "d1",
      from_project_id: "pr1",
      from_phase_id: null,
      to_project_id: "pr2",
      to_phase_id: null,
      type: "FS",
      lag_days: 2,
      source: "manual",
    });
  });

  it("maps a jr skill requirement row", () => {
    const jsr = mapJrSkillRequirementRow({
      id: "jsr1",
      work_item_id: "wi1",
      skill_id: "s1",
      min_level: 2,
      weight: "must",
      source: "manual",
    });
    expect(jsr).toEqual({
      id: "jsr1",
      work_item_id: "wi1",
      skill_id: "s1",
      min_level: 2,
      weight: "must",
      source: "manual",
    });
  });

  it("maps a scenario_def row and parses ops JSON", () => {
    const scenario = mapScenarioDefRow({
      id: "sc1",
      name: "+1 week",
      base_snapshot_id: "snap1",
      ops: '[{"op":"move_project","project_id":"pr1","weeks":1}]',
      created_by: "user@example.com",
      status: "draft",
      created_at: "2026-10-01T00:00:00.000Z",
    });
    expect(scenario.ops).toEqual([
      { op: "move_project", project_id: "pr1", weeks: 1 },
    ]);
    expect(scenario.status).toBe("draft");
  });
});

describe("base-derived row mapping", () => {
  it("maps a conflict row to the engine shape used by diff", () => {
    const conflict = mapConflictRowToEngine({
      id: "c1",
      snapshot_id: "snap1",
      rule: "C1",
      severity: "at_risk",
      person_id: "p1",
      team_id: null,
      project_id: null,
      phase_id: null,
      window_start: "2026-W40",
      window_end: "2026-W41",
      metrics: '{"max_utilization":1.2}',
      explanation: "over allocated",
      status: "open",
    });
    expect(conflict).toEqual({
      rule: "C1",
      severity: "at_risk",
      person_id: "p1",
      window_start: "2026-W40",
      window_end: "2026-W41",
      metrics: { max_utilization: 1.2 },
      explanation: "over allocated",
    });
    expect(conflict.team_id).toBeUndefined();
  });

  it("maps a capacity entry row to a ledger entry", () => {
    const entry = mapCapacityEntryRow({
      id: "ce1",
      snapshot_id: "snap1",
      week_key: "2026-W40",
      person_id: "p1",
      gross_h: 40,
      pto_h: 0,
      overhead_h: 8,
      available_h: 32,
      planned_h: 48,
      utilization: 1.5,
      flags: '["over_capacity"]',
    });
    expect(entry).toEqual({
      week_key: "2026-W40",
      person_id: "p1",
      gross_h: 40,
      pto_h: 0,
      overhead_h: 8,
      available_h: 32,
      planned_h: 48,
      utilization: 1.5,
      flags: ["over_capacity"],
    });
  });

  it("round-trips base derived rows through diffScenarioResults", () => {
    const base: ScenarioDerived = {
      ledger: [
        mapCapacityEntryRow({
          id: "ce1",
          snapshot_id: "snap1",
          week_key: "2026-W40",
          person_id: "p1",
          gross_h: 40,
          pto_h: 0,
          overhead_h: 8,
          available_h: 32,
          planned_h: 32,
          utilization: 1,
          flags: [],
        }),
      ],
      conflicts: [
        mapConflictRowToEngine({
          id: "c1",
          snapshot_id: "snap1",
          rule: "C1",
          severity: "at_risk",
          person_id: "p1",
          team_id: null,
          project_id: null,
          phase_id: null,
          window_start: "2026-W40",
          window_end: "2026-W41",
          metrics: '{"max_utilization":1.2}',
          explanation: "over",
          status: "open",
        }),
      ],
      feasibility: [],
    };

    const scenario: ScenarioDerived = {
      ledger: [
        {
          ...base.ledger[0],
          planned_h: 40,
          utilization: 1.25,
        },
      ],
      conflicts: [],
      feasibility: [],
    };

    const diff = diffScenarioResults(base, scenario);
    expect(diff.capacity_deltas).toHaveLength(1);
    expect(diff.conflict_changes.removed).toHaveLength(1);
    expect(diff.conflict_changes.added).toHaveLength(0);
  });
});

describe("feasibility map to diff shape", () => {
  it("maps a feasibility_result row to the verdict/finish shape", () => {
    const f = mapFeasibilityRowToEngine({
      id: "fr1",
      snapshot_id: "snap1",
      project_id: "pr1",
      computed_start: "2026-10-06",
      computed_finish: "2026-10-20",
      slack_days: 5,
      buffer_days: 3,
      verdict: "healthy",
      drivers: "[]",
      critical_path: "[]",
      per_phase_load: "{}",
    });
    expect(f).toMatchObject({
      project_id: "pr1",
      computed_finish: "2026-10-20",
      verdict: "healthy",
    });
  });

  it("produces feasibility deltas when verdict/finish change", () => {
    const baseFeasibility: FeasibilityResult = mapFeasibilityRowToEngine({
      id: "fr1",
      snapshot_id: "snap1",
      project_id: "pr1",
      computed_start: "2026-10-06",
      computed_finish: "2026-10-20",
      slack_days: 5,
      buffer_days: 3,
      verdict: "healthy",
      drivers: "[]",
      critical_path: "[]",
      per_phase_load: "{}",
    });

    const scenarioFeasibility: FeasibilityResult = {
      ...baseFeasibility,
      computed_finish: "2026-10-27",
      verdict: "warning",
    };

    const diff = diffScenarioResults(
      { ledger: [], conflicts: [], feasibility: [baseFeasibility] },
      { ledger: [], conflicts: [], feasibility: [scenarioFeasibility] },
    );

    expect(diff.feasibility_deltas).toEqual([
      {
        project_id: "pr1",
        base: { verdict: "healthy", computed_finish: "2026-10-20" },
        scenario: { verdict: "warning", computed_finish: "2026-10-27" },
      },
    ]);
    expect(diff.summary.feasibility_changed_projects).toBe(1);
  });

  it("parses JSON arrays in feasibility_result row", () => {
    const f = mapFeasibilityRowToEngine({
      id: "fr1",
      snapshot_id: "snap1",
      project_id: "pr1",
      computed_start: "2026-10-06",
      computed_finish: "2026-10-20",
      slack_days: 5,
      buffer_days: 3,
      verdict: "healthy",
      drivers: '["unstaffed"]',
      critical_path: '["ph1"]',
      per_phase_load: "{}",
    });
    expect(f.drivers).toEqual(["unstaffed"]);
    expect(f.critical_path).toEqual(["ph1"]);
  });
});

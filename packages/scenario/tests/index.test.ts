import { describe, it, expect } from "vitest";
import {
  applyScenarioOps,
  diffScenarioResults,
  ScenarioSourceData,
  ScenarioDerived,
  EngineConflict,
} from "../src/index";
import { OrgCalendar, Person, Project, ProjectPhase, Allocation, WorkItem, JrSkillRequirement, Skill, Team, TeamMembership, Role, PersonSkill, PtoEntry, Dependency } from "@kairo/types";
import type { FeasibilityResult } from "@kairo/planning-engine";

const calendar: OrgCalendar = {
  id: "cal-1",
  workingDays: [1, 2, 3, 4, 5],
  holidays: [],
};

function person(id: string): Person {
  return {
    id,
    name: id,
    email: `${id}@example.com`,
    role_id: "r1",
    seniority: 3,
    hours_per_day: 8,
    overhead_pct: 0.2,
    active: true,
  };
}

function baseSource(): ScenarioSourceData {
  const project: Project = {
    id: "p1",
    plane_id: null,
    code: "P1",
    name: "Project One",
    status: "active",
    priority: 1,
    deadline: "2026-10-30",
    declared_start: "2026-10-06",
    declared_end: "2026-10-10",
    team_scope: [],
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };

  const phase: ProjectPhase = {
    id: "ph1",
    project_id: "p1",
    name: "Phase 1",
    sequence: 1,
    declared_start: "2026-10-06",
    declared_end: "2026-10-10",
    effort_hours: 80,
  };

  const allocation: Allocation = {
    id: "a1",
    person_id: "pe1",
    project_id: "p1",
    phase_id: "ph1",
    fte: 0.5,
    start_date: "2026-10-06",
    end_date: "2026-10-10",
    status: "committed",
    source: "manual",
  };

  const workItem: WorkItem = {
    id: "wi1",
    project_id: "p1",
    plane_id: "plane-wi1",
    title: "JR One",
    status: "todo",
    priority: 1,
    start_date: "2026-10-06",
    due_date: "2026-10-10",
    estimate_raw: "8h",
    estimate_normalized_hours: 8,
    updated_at: "2026-10-01T00:00:00Z",
  };

  const jrSkill: JrSkillRequirement = {
    id: "jsr1",
    work_item_id: "wi1",
    skill_id: "s1",
    min_level: 2,
    weight: "must",
    source: "manual",
  };

  return {
    people: [person("pe1")],
    teams: [{ id: "t1", name: "Builder A", type: "builder" }],
    memberships: [{ id: "m1", person_id: "pe1", team_id: "t1" }],
    roles: [{ id: "r1", name: "Dev", seniority_ladder: [] }],
    skills: [{ id: "s1", name: "TypeScript", category: "lang", aliases: [] }],
    personSkills: [],
    allocations: [allocation],
    ptoEntries: [],
    projects: [project],
    phases: [phase],
    workItems: [workItem],
    dependencies: [],
    jrSkillRequirements: [jrSkill],
    calendar,
  };
}

function weekendFixture(): ScenarioSourceData {
  // Dates start on Saturday to exercise weekend snapping.
  const data = baseSource();
  data.projects[0].deadline = "2026-10-03";
  data.projects[0].declared_start = "2026-10-04"; // Sunday to keep declared_start non-null; end Saturday
  data.projects[0].declared_end = "2026-10-10";
  data.phases[0].declared_start = "2026-10-03";
  data.phases[0].declared_end = "2026-10-04";
  data.allocations[0].start_date = "2026-10-03";
  data.allocations[0].end_date = "2026-10-04";
  data.workItems[0].start_date = "2026-10-03";
  data.workItems[0].due_date = "2026-10-04";
  return data;
}

describe("applyScenarioOps", () => {
  it("does not mutate the source", () => {
    const source = baseSource();
    const original = JSON.stringify(source);
    applyScenarioOps(
      source,
      [{ op: "change_allocation_fte", allocation_id: "a1", fte: 1.0 }],
      () => "id-x",
    );
    expect(JSON.stringify(source)).toBe(original);
  });

  it("move_project shifts all date families and snaps weekends", () => {
    const source = weekendFixture();
    const { data, changes } = applyScenarioOps(
      source,
      [{ op: "move_project", project_id: "p1", weeks: 1 }],
      () => "unused",
    );

    expect(changes).toEqual(["moved project p1 by 1 week(s)"]);

    // All dates are moved by 7 days and then snapped to the next working day.
    expect(data.projects[0].deadline).toBe("2026-10-12");
    expect(data.projects[0].declared_start).toBe("2026-10-12");
    expect(data.projects[0].declared_end).toBe("2026-10-19");

    expect(data.phases[0].declared_start).toBe("2026-10-12");
    expect(data.phases[0].declared_end).toBe("2026-10-12");

    expect(data.allocations[0].start_date).toBe("2026-10-12");
    expect(data.allocations[0].end_date).toBe("2026-10-12");

    expect(data.workItems[0].start_date).toBe("2026-10-12");
    expect(data.workItems[0].due_date).toBe("2026-10-12");
  });

  it("set_deadline updates the project deadline", () => {
    const source = baseSource();
    const { data, changes } = applyScenarioOps(
      source,
      [{ op: "set_deadline", project_id: "p1", date: "2026-12-31" }],
      () => "unused",
    );
    expect(data.projects[0].deadline).toBe("2026-12-31");
    expect(changes).toEqual(["set deadline for project p1 to 2026-12-31"]);
  });

  it("add_allocation creates a proposed manual allocation", () => {
    const source = baseSource();
    const { data, changes } = applyScenarioOps(
      source,
      [
        {
          op: "add_allocation",
          person_id: "pe1",
          project_id: "p1",
          phase_id: "ph1",
          fte: 0.25,
          start_date: "2026-11-01",
          end_date: "2026-11-07",
        },
      ],
      () => "new-a2",
    );
    expect(data.allocations).toHaveLength(2);
    const added = data.allocations.find((a) => a.id === "new-a2")!;
    expect(added).toEqual({
      id: "new-a2",
      person_id: "pe1",
      project_id: "p1",
      phase_id: "ph1",
      fte: 0.25,
      start_date: "2026-11-01",
      end_date: "2026-11-07",
      status: "proposed",
      source: "manual",
    });
    expect(changes).toEqual(["added allocation new-a2 to project p1"]);
  });

  it("remove_allocation drops the allocation", () => {
    const source = baseSource();
    const { data, changes } = applyScenarioOps(
      source,
      [{ op: "remove_allocation", allocation_id: "a1" }],
      () => "unused",
    );
    expect(data.allocations).toHaveLength(0);
    expect(changes).toEqual(["removed allocation a1"]);
  });

  it("change_allocation_fte updates FTE", () => {
    const source = baseSource();
    const { data, changes } = applyScenarioOps(
      source,
      [{ op: "change_allocation_fte", allocation_id: "a1", fte: 0.9 }],
      () => "unused",
    );
    expect(data.allocations[0].fte).toBe(0.9);
    expect(changes).toEqual(["changed allocation a1 FTE to 0.9"]);
  });

  it("defer_work_items removes work items and their skill requirements", () => {
    const source = baseSource();
    const { data, changes } = applyScenarioOps(
      source,
      [{ op: "defer_work_items", work_item_ids: ["wi1"] }],
      () => "unused",
    );
    expect(data.workItems).toHaveLength(0);
    expect(data.jrSkillRequirements).toHaveLength(0);
    expect(changes).toEqual(["deferred work items: wi1"]);
  });

  it("add_person_skill appends a manual unverified skill", () => {
    const source = baseSource();
    const { data, changes } = applyScenarioOps(
      source,
      [{ op: "add_person_skill", person_id: "pe1", skill_id: "s1", level: 3 }],
      () => "ps1",
    );
    expect(data.personSkills).toHaveLength(1);
    expect(data.personSkills[0]).toEqual({
      id: "ps1",
      person_id: "pe1",
      skill_id: "s1",
      level: 3,
      source: "manual",
      verified_by: null,
    });
    expect(changes).toEqual(["added person skill ps1"]);
  });

  it("throws on invalid references", () => {
    const source = baseSource();
    expect(() =>
      applyScenarioOps(source, [
        { op: "move_project", project_id: "missing-project", weeks: 1 },
      ]),
    ).toThrow("project missing-project not found");

    expect(() =>
      applyScenarioOps(source, [
        {
          op: "add_allocation",
          person_id: "missing-person",
          project_id: "p1",
          fte: 0.5,
          start_date: "2026-11-01",
          end_date: "2026-11-07",
        },
      ]),
    ).toThrow("person missing-person not found");

    expect(() =>
      applyScenarioOps(source, [
        { op: "remove_allocation", allocation_id: "missing-allocation" },
      ]),
    ).toThrow("allocation missing-allocation not found");

    expect(() =>
      applyScenarioOps(source, [
        { op: "defer_work_items", work_item_ids: ["missing-wi"] },
      ]),
    ).toThrow("work item missing-wi not found");
  });
});

describe("diffScenarioResults", () => {
  function derived(
    overrides: {
      ledger?: { person_id: string; week_key: string; utilization: number }[];
      conflicts?: EngineConflict[];
      feasibility?: FeasibilityResult[];
    } = {},
  ): ScenarioDerived {
    return {
      ledger:
        overrides.ledger?.map((e) => ({
          week_key: e.week_key,
          person_id: e.person_id,
          gross_h: 40,
          pto_h: 0,
          overhead_h: 8,
          available_h: 32,
          planned_h: 40,
          utilization: e.utilization,
          flags: [],
        })) ?? [],
      conflicts: overrides.conflicts ?? [],
      feasibility: overrides.feasibility ?? [],
    };
  }

  it("reports capacity utilization deltas only when changed", () => {
    const base = derived({
      ledger: [
        { person_id: "pe1", week_key: "2026-W40", utilization: 0.8 },
        { person_id: "pe1", week_key: "2026-W41", utilization: 1.0 },
      ],
    });
    const scenario = derived({
      ledger: [
        { person_id: "pe1", week_key: "2026-W40", utilization: 1.0 },
        { person_id: "pe1", week_key: "2026-W41", utilization: 1.0 },
      ],
    });
    const diff = diffScenarioResults(base, scenario);
    expect(diff.capacity_deltas).toEqual([
      {
        person_id: "pe1",
        week_key: "2026-W40",
        base_utilization: 0.8,
        scenario_utilization: 1.0,
        delta: 0.2,
      },
    ]);
    expect(diff.summary.utilization_changed_person_weeks).toBe(1);
  });

  it("matches conflicts by rule + entity ids and reports added/removed", () => {
    const common: EngineConflict = {
      rule: "C1",
      severity: "at_risk",
      person_id: "pe1",
      window_start: "2026-W40",
      window_end: "2026-W41",
      metrics: { max_utilization: 1.2 },
      explanation: "over",
    };
    const removed: EngineConflict = {
      ...common,
      rule: "C2",
      person_id: undefined,
      team_id: "t1",
    };
    const added: EngineConflict = {
      ...common,
      rule: "C2",
      person_id: undefined,
      team_id: "t2",
    };

    const base = derived({ conflicts: [common, removed] });
    const scenario = derived({ conflicts: [common, added] });
    const diff = diffScenarioResults(base, scenario);

    expect(diff.conflict_changes.removed).toEqual([removed]);
    expect(diff.conflict_changes.added).toEqual([added]);
    expect(diff.summary.conflicts_added).toBe(1);
    expect(diff.summary.conflicts_removed).toBe(1);
  });

  it("reports feasibility changes by project", () => {
    const unchangedFeasibility: FeasibilityResult = {
      project_id: "p1",
      computed_start: "2026-10-06",
      computed_finish: "2026-10-20",
      declared_finish: "2026-10-20",
      deadline: "2026-10-30",
      slack_days: 5,
      buffer_days: 3,
      verdict: "healthy",
      drivers: [],
      critical_path: [],
      per_phase: [],
    };
    const changedBase: FeasibilityResult = {
      ...unchangedFeasibility,
      project_id: "p2",
      computed_finish: "2026-10-30",
      declared_finish: "2026-10-30",
      deadline: "2026-10-30",
      verdict: "warning",
    };
    const changedScenario: FeasibilityResult = {
      ...changedBase,
      computed_finish: "2026-11-06",
      declared_finish: "2026-10-30",
      verdict: "at_risk",
    };

    const base = derived({ feasibility: [unchangedFeasibility, changedBase] });
    const scenario = derived({ feasibility: [unchangedFeasibility, changedScenario] });
    const diff = diffScenarioResults(base, scenario);

    expect(diff.feasibility_deltas).toEqual([
      {
        project_id: "p2",
        base: { verdict: "warning", computed_finish: "2026-10-30" },
        scenario: { verdict: "at_risk", computed_finish: "2026-11-06" },
      },
    ]);
    expect(diff.summary.feasibility_changed_projects).toBe(1);
  });

  it("returns an empty diff for identical inputs", () => {
    const base = derived();
    const diff = diffScenarioResults(base, base);
    expect(diff.summary).toEqual({
      utilization_changed_person_weeks: 0,
      conflicts_added: 0,
      conflicts_removed: 0,
      feasibility_changed_projects: 0,
    });
    expect(diff.capacity_deltas).toEqual([]);
    expect(diff.conflict_changes.added).toEqual([]);
    expect(diff.conflict_changes.removed).toEqual([]);
    expect(diff.feasibility_deltas).toEqual([]);
  });
});

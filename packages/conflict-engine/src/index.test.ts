import { describe, it, expect } from "vitest";
import {
  evaluateConflicts,
  DEFAULT_CONFLICT_THRESHOLDS,
  EngineConflict,
  ConflictEngineInput,
} from "./index";
import type {
  Person,
  Team,
  Project,
  ProjectPhase,
  Allocation,
  OrgCalendar,
  CapacityWeekEntry,
} from "@kairo/types";
import { buildCapacityLedger, TeamWeekEntry } from "@kairo/capacity-engine";

function cal(holidays: string[] = []): OrgCalendar {
  return {
    id: "org",
    workingDays: [1, 2, 3, 4, 5],
    holidays,
  };
}

function person(overrides: Partial<Person> & { id: string }): Person {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    email: `${overrides.id}@example.com`,
    role_id: "dev",
    seniority: 1,
    hours_per_day: overrides.hours_per_day ?? 8,
    overhead_pct: overrides.overhead_pct ?? 0.2,
    active: overrides.active ?? true,
  };
}

function alloc(overrides: {
  id: string;
  person_id: string;
  project_id: string;
  fte: number;
  start_date: string;
  end_date: string;
  phase_id?: string;
  status?: Allocation["status"];
}): Allocation {
  return {
    id: overrides.id,
    person_id: overrides.person_id,
    project_id: overrides.project_id,
    phase_id: overrides.phase_id ?? null,
    fte: overrides.fte,
    start_date: overrides.start_date,
    end_date: overrides.end_date,
    status: overrides.status ?? "committed",
    source: "manual",
  };
}

function project(overrides: Partial<Project> & { id: string }): Project {
  return {
    id: overrides.id,
    plane_id: null,
    code: overrides.code ?? overrides.id,
    name: overrides.name ?? overrides.id,
    status: "active",
    priority: 1,
    deadline: overrides.deadline ?? null,
    declared_start: overrides.declared_start ?? null,
    declared_end: overrides.declared_end ?? null,
    team_scope: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function phase(overrides: Partial<ProjectPhase> & { id: string; project_id: string; declared_start: string; declared_end: string }): ProjectPhase {
  return {
    id: overrides.id,
    project_id: overrides.project_id,
    name: overrides.name ?? overrides.id,
    sequence: 1,
    declared_start: overrides.declared_start,
    declared_end: overrides.declared_end,
    effort_hours: 0,
    status: "confirmed",
    source: "manual",
  };
}

function team(id: string, name = id): Team {
  return { id, name, type: "builder" };
}

describe("C1 person over-allocation", () => {
  it("escalates to critical when over-allocation is sustained for 2+ weeks", () => {
    const people = [person({ id: "dana", name: "Dana" })];
    const allocations = [
      alloc({ id: "a1", person_id: "dana", project_id: "alpha", fte: 1, start_date: "2026-09-07", end_date: "2026-09-18" }),
    ];
    const ledger = buildCapacityLedger({
      people,
      allocations,
      ptoEntries: [],
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-18" },
    }) as CapacityWeekEntry[];

    const input: ConflictEngineInput = {
      ledger,
      teamWeeks: [],
      people,
      teams: [],
      projects: [project({ id: "alpha", name: "Alpha" })],
      phases: [],
      allocations,
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-18" },
    };

    const conflicts = evaluateConflicts(input);
    expect(conflicts).toHaveLength(1);
    const c = conflicts[0];
    expect(c.rule).toBe("C1");
    expect(c.severity).toBe("critical");
    expect(c.window_start).toBe("2026-W37");
    expect(c.window_end).toBe("2026-W38");
    expect(c.metrics.weeks).toBe(2);
    expect(c.metrics.max_utilization).toBe(1.25);
    expect(c.explanation).toContain("Dana");
    expect(c.explanation).toContain("2026-W37–2026-W38");
  });

  it("splits conflicts when a non-overloaded week creates a gap", () => {
    const people = [person({ id: "dana", name: "Dana" })];
    const allocations: Allocation[] = [
      alloc({ id: "a1", person_id: "dana", project_id: "alpha", fte: 1.5, start_date: "2026-09-07", end_date: "2026-09-11" }),
      alloc({ id: "a2", person_id: "dana", project_id: "alpha", fte: 1.5, start_date: "2026-09-21", end_date: "2026-09-25" }),
    ];
    const ledger = buildCapacityLedger({
      people,
      allocations,
      ptoEntries: [],
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-25" },
    }) as CapacityWeekEntry[];

    const input: ConflictEngineInput = {
      ledger,
      teamWeeks: [],
      people,
      teams: [],
      projects: [project({ id: "alpha", name: "Alpha" })],
      phases: [],
      allocations,
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-25" },
    };

    const conflicts = evaluateConflicts(input).filter((c) => c.rule === "C1");
    expect(conflicts).toHaveLength(2);
    expect(conflicts.map((c) => `${c.window_start}..${c.window_end}`)).toEqual([
      "2026-W37..2026-W37",
      "2026-W39..2026-W39",
    ]);
  });
});

describe("C2 team over-demand", () => {
  it("uses team threshold boundaries to set severity", () => {
    const teamWeeks: TeamWeekEntry[] = [
      { team_id: "builders", week_key: "2026-W37", member_count: 2, available_h: 80, planned_h: 84, utilization: 1.05, flags: [] },
      { team_id: "builders", week_key: "2026-W38", member_count: 2, available_h: 80, planned_h: 60, utilization: 0.75, flags: [] },
      { team_id: "builders", week_key: "2026-W39", member_count: 2, available_h: 80, planned_h: 100.8, utilization: 1.26, flags: [] },
    ];

    const input: ConflictEngineInput = {
      ledger: [],
      teamWeeks,
      people: [],
      teams: [team("builders")],
      projects: [],
      phases: [],
      allocations: [],
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-25" },
      config: DEFAULT_CONFLICT_THRESHOLDS,
    };

    const conflicts = evaluateConflicts(input).filter((c) => c.rule === "C2");
    expect(conflicts).toHaveLength(2);
    expect(conflicts[0].severity).toBe("critical");
    expect(conflicts[0].window_start).toBe("2026-W39");
    expect(conflicts[1].severity).toBe("at_risk");
    expect(conflicts[1].window_start).toBe("2026-W37");
  });
});

describe("C4 deadline breach", () => {
  it("classifies overshoot exactly at the 10-day boundary as at_risk", () => {
    const projects = [
      project({ id: "p1", name: "Alpha", deadline: "2026-09-07", declared_end: "2026-09-21" }),
    ];

    const input: ConflictEngineInput = {
      ledger: [],
      teamWeeks: [],
      people: [],
      teams: [],
      projects,
      phases: [],
      allocations: [],
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-21" },
      config: DEFAULT_CONFLICT_THRESHOLDS,
    };

    const conflicts = evaluateConflicts(input).filter((c) => c.rule === "C4");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].severity).toBe("at_risk");
    expect(conflicts[0].metrics.overshoot_days).toBe(10);
  });

  it("classifies overshoot beyond the boundary as critical", () => {
    const projects = [
      project({ id: "p1", name: "Alpha", deadline: "2026-09-07", declared_end: "2026-09-22" }),
    ];

    const input: ConflictEngineInput = {
      ledger: [],
      teamWeeks: [],
      people: [],
      teams: [],
      projects,
      phases: [],
      allocations: [],
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-22" },
    };

    const conflicts = evaluateConflicts(input).filter((c) => c.rule === "C4");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].severity).toBe("critical");
    expect(conflicts[0].metrics.overshoot_days).toBe(11);
  });
});

describe("C10 unstaffed phase", () => {
  it("warns about overlapping unstaffed phases only", () => {
    const projects = [project({ id: "p1", name: "Alpha" })];
    const phases: ProjectPhase[] = [
      phase({ id: "ph1", project_id: "p1", name: "Discovery", declared_start: "2026-09-01", declared_end: "2026-09-11" }),
      phase({ id: "ph2", project_id: "p1", name: "Future", declared_start: "2026-10-01", declared_end: "2026-10-15" }),
      phase({ id: "ph3", project_id: "p1", name: "Staffed", declared_start: "2026-09-01", declared_end: "2026-09-11" }),
    ];
    const allocations = [
      alloc({ id: "a1", person_id: "dana", project_id: "p1", phase_id: "ph3", fte: 0.5, start_date: "2026-09-07", end_date: "2026-09-11" }),
    ];

    const input: ConflictEngineInput = {
      ledger: [],
      teamWeeks: [],
      people: [person({ id: "dana" })],
      teams: [],
      projects,
      phases,
      allocations,
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-11" },
    };

    const conflicts = evaluateConflicts(input).filter((c) => c.rule === "C10");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].phase_id).toBe("ph1");
    expect(conflicts[0].explanation).toContain("Discovery");
    expect(conflicts[0].explanation).toContain("Alpha");
  });
});

describe("ordering", () => {
  it("sorts by severity first, then rule, then entity id", () => {
    const teamWeeks: TeamWeekEntry[] = [
      { team_id: "builders", week_key: "2026-W38", member_count: 2, available_h: 80, planned_h: 100.8, utilization: 1.26, flags: [] },
      { team_id: "zulu", week_key: "2026-W38", member_count: 1, available_h: 40, planned_h: 42, utilization: 1.05, flags: [] },
    ];
    const projects = [project({ id: "z1", name: "Zulu", deadline: "2026-09-07", declared_end: "2026-09-22" })];

    const input: ConflictEngineInput = {
      ledger: [],
      teamWeeks,
      people: [],
      teams: [team("builders"), team("zulu")],
      projects,
      phases: [],
      allocations: [],
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-18" },
    };

    const conflicts = evaluateConflicts(input);
    expect(conflicts.map((c) => `${c.severity}:${c.rule}:${c.team_id ?? c.project_id}`)).toEqual([
      "critical:C2:builders",
      "critical:C4:z1",
      "at_risk:C2:zulu",
    ]);
  });
});

describe("clean input", () => {
  it("returns zero conflicts when nothing breaches", () => {
    const input: ConflictEngineInput = {
      ledger: [],
      teamWeeks: [],
      people: [],
      teams: [],
      projects: [],
      phases: [],
      allocations: [],
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-11" },
    };
    expect(evaluateConflicts(input)).toEqual([]);
  });
});

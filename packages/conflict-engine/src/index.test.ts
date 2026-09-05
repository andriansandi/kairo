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
  Skill,
  PersonSkill,
  JrSkillRequirement,
  WorkItem,
  Dependency,
  TeamMembership,
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

function team(id: string, name = id, type: Team["type"] = "builder"): Team {
  return { id, name, type };
}

function teamMembership(person_id: string, team_id: string): TeamMembership {
  return { id: `${person_id}-${team_id}`, person_id, team_id };
}

function skill(id: string, name = id): Skill {
  return { id, name, category: "tech", aliases: [] };
}

function personSkill(person_id: string, skill_id: string, level: number): PersonSkill {
  return { id: `${person_id}-${skill_id}`, person_id, skill_id, level: level as 1 | 2 | 3 | 4, verified_by: null, source: "manual" };
}

function jrReq(work_item_id: string, skill_id: string, min_level: number): JrSkillRequirement {
  return { id: `${work_item_id}-${skill_id}`, work_item_id, skill_id, min_level: min_level as 1 | 2 | 3 | 4, weight: "must", source: "manual" };
}

function workItem(overrides: Partial<WorkItem> & { id: string; project_id: string }): WorkItem {
  return {
    id: overrides.id,
    project_id: overrides.project_id,
    plane_id: `${overrides.id}-plane`,
    title: overrides.title ?? overrides.id,
    status: "backlog",
    priority: 1,
    assignee_ids: [],
    start_date: overrides.start_date ?? null,
    due_date: overrides.due_date ?? null,
    estimate_raw: null,
    estimate_normalized_hours: overrides.estimate_normalized_hours ?? null,
    cycle: null,
    labels: [],
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function dependency(from_project_id: string, to_project_id: string, lag_days = 0): Dependency {
  return { id: `${from_project_id}-${to_project_id}`, from_project_id, from_phase_id: null, to_project_id, to_phase_id: null, type: "FS", lag_days, source: "manual" };
}

function ledgerRow(
  overrides: Partial<CapacityWeekEntry> & {
    week_key: string;
    person_id: string;
    available_h: number;
    planned_h: number;
    utilization: number;
  },
): CapacityWeekEntry {
  return {
    week_key: overrides.week_key,
    person_id: overrides.person_id,
    gross_h: overrides.gross_h ?? overrides.available_h,
    pto_h: overrides.pto_h ?? 0,
    overhead_h: overrides.overhead_h ?? 0,
    available_h: overrides.available_h,
    planned_h: overrides.planned_h,
    utilization: overrides.utilization,
    flags: overrides.flags ?? [],
  };
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

describe("C3 DevOps contention", () => {
  it("fires when DevOps demand exceeds supply across >=2 projects", () => {
    const people = [
      person({ id: "d1", name: "Dev1" }),
      person({ id: "d2", name: "Dev2" }),
    ];
    const projects = [
      project({ id: "alpha", name: "Alpha" }),
      project({ id: "beta", name: "Beta" }),
    ];
    const allocations = [
      alloc({ id: "a1", person_id: "d1", project_id: "alpha", fte: 0.5, start_date: "2026-09-07", end_date: "2026-09-18" }),
      alloc({ id: "a2", person_id: "d1", project_id: "beta", fte: 0.5, start_date: "2026-09-07", end_date: "2026-09-18" }),
      alloc({ id: "a3", person_id: "d2", project_id: "alpha", fte: 0.5, start_date: "2026-09-07", end_date: "2026-09-18" }),
      alloc({ id: "a4", person_id: "d2", project_id: "beta", fte: 0.5, start_date: "2026-09-07", end_date: "2026-09-18" }),
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
      teams: [team("devops", "DevOps", "devops")],
      projects,
      phases: [],
      allocations,
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-18" },
      teamMemberships: [teamMembership("d1", "devops"), teamMembership("d2", "devops")],
    };

    const c3 = evaluateConflicts(input).filter((c) => c.rule === "C3");
    expect(c3).toHaveLength(1);
    expect(c3[0].severity).toBe("critical");
    expect(c3[0].window_start).toBe("2026-W37");
    expect(c3[0].window_end).toBe("2026-W38");
    expect(c3[0].metrics.project_count).toBe(2);
    expect(c3[0].metrics.demand_h).toBe(80);
    expect(c3[0].metrics.available_h).toBe(64);
    expect(c3[0].explanation).toContain("Alpha");
    expect(c3[0].explanation).toContain("Beta");
  });

  it("does not fire when over-demand comes from a single project", () => {
    const people = [person({ id: "d1", name: "Dev1" })];
    const projects = [project({ id: "alpha", name: "Alpha" })];
    const allocations = [
      alloc({ id: "a1", person_id: "d1", project_id: "alpha", fte: 1, start_date: "2026-09-07", end_date: "2026-09-18" }),
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
      teams: [team("devops", "DevOps", "devops")],
      projects,
      phases: [],
      allocations,
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-18" },
      teamMemberships: [teamMembership("d1", "devops")],
    };

    const c3 = evaluateConflicts(input).filter((c) => c.rule === "C3");
    expect(c3).toHaveLength(0);
  });
});

describe("C5 project resource overlap", () => {
  it("warns when a person overlaps on two projects with combined FTE > 1", () => {
    const people = [person({ id: "dana", name: "Dana" })];
    const projects = [project({ id: "alpha", name: "Alpha" }), project({ id: "beta", name: "Beta" })];
    const allocations = [
      alloc({ id: "a1", person_id: "dana", project_id: "alpha", fte: 0.7, start_date: "2026-09-07", end_date: "2026-09-11" }),
      alloc({ id: "a2", person_id: "dana", project_id: "beta", fte: 0.7, start_date: "2026-09-07", end_date: "2026-09-11" }),
    ];

    const input: ConflictEngineInput = {
      ledger: [],
      teamWeeks: [],
      people,
      teams: [],
      projects,
      phases: [],
      allocations,
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-11" },
    };

    const c5 = evaluateConflicts(input).filter((c) => c.rule === "C5");
    expect(c5).toHaveLength(1);
    expect(c5[0].severity).toBe("warning");
    expect(c5[0].metrics.combined_fte).toBe(1.4);
    expect(c5[0].explanation).toContain("no declared dependency");
  });

  it("is suppressed by an existing project-level dependency", () => {
    const people = [person({ id: "dana", name: "Dana" })];
    const projects = [project({ id: "alpha", name: "Alpha" }), project({ id: "beta", name: "Beta" })];
    const allocations = [
      alloc({ id: "a1", person_id: "dana", project_id: "alpha", fte: 0.7, start_date: "2026-09-07", end_date: "2026-09-11" }),
      alloc({ id: "a2", person_id: "dana", project_id: "beta", fte: 0.7, start_date: "2026-09-07", end_date: "2026-09-11" }),
    ];

    const input: ConflictEngineInput = {
      ledger: [],
      teamWeeks: [],
      people,
      teams: [],
      projects,
      phases: [],
      allocations,
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-11" },
      dependencies: [dependency("alpha", "beta")],
    };

    const c5 = evaluateConflicts(input).filter((c) => c.rule === "C5");
    expect(c5).toHaveLength(0);
  });
});

describe("C6 dependency violation", () => {
  it("is critical when the violated successor start is in the past", () => {
    const projects = [
      project({ id: "alpha", name: "Alpha", declared_start: "2026-09-01", declared_end: "2026-09-18" }),
      project({ id: "beta", name: "Beta", declared_start: "2026-09-15", declared_end: "2026-09-25" }),
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
      horizon: { from: "2026-09-07", to: "2026-09-25" },
      dependencies: [dependency("alpha", "beta")],
      now: "2026-09-16",
    };

    const c6 = evaluateConflicts(input).filter((c) => c.rule === "C6");
    expect(c6).toHaveLength(1);
    expect(c6[0].severity).toBe("critical");
    expect(c6[0].metrics.successor_start).toBe("2026-09-15");
    expect(c6[0].metrics.predecessor_end).toBe("2026-09-18");
  });

  it("is at_risk when the violated successor start is still in the future", () => {
    const projects = [
      project({ id: "alpha", name: "Alpha", declared_start: "2026-09-01", declared_end: "2026-09-18" }),
      project({ id: "beta", name: "Beta", declared_start: "2026-09-15", declared_end: "2026-09-25" }),
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
      horizon: { from: "2026-09-07", to: "2026-09-25" },
      dependencies: [dependency("alpha", "beta")],
      now: "2026-09-10",
    };

    const c6 = evaluateConflicts(input).filter((c) => c.rule === "C6");
    expect(c6).toHaveLength(1);
    expect(c6[0].severity).toBe("at_risk");
  });
});

describe("C7 skill bottleneck", () => {
  it("is critical when qualified people have zero free capacity", () => {
    const people = [person({ id: "dana", name: "Dana" })];
    const projects = [project({ id: "alpha", name: "Alpha" })];

    const input: ConflictEngineInput = {
      ledger: [
        ledgerRow({ week_key: "2026-W37", person_id: "dana", gross_h: 40, available_h: 40, planned_h: 40, utilization: 1 }),
      ],
      teamWeeks: [],
      people,
      teams: [],
      projects,
      phases: [],
      allocations: [],
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-11" },
      skills: [skill("node", "Node.js")],
      personSkills: [personSkill("dana", "node", 2)],
      workItems: [workItem({ id: "wi1", project_id: "alpha", estimate_normalized_hours: 40 })],
      jrSkillRequirements: [jrReq("wi1", "node", 2)],
    };

    const c7 = evaluateConflicts(input).filter((c) => c.rule === "C7");
    expect(c7).toHaveLength(1);
    expect(c7[0].severity).toBe("critical");
    expect(c7[0].metrics.required_h).toBe(40);
    expect(c7[0].metrics.free_h).toBe(0);
    expect(c7[0].metrics.qualified_people).toBe(1);
  });

  it("warns when required hours cross the 0.8 free-hour boundary", () => {
    const people = [person({ id: "dana", name: "Dana" })];
    const projects = [project({ id: "alpha", name: "Alpha" })];

    const input: ConflictEngineInput = {
      ledger: [
        ledgerRow({ week_key: "2026-W37", person_id: "dana", gross_h: 125, available_h: 100, planned_h: 0, utilization: 0 }),
      ],
      teamWeeks: [],
      people,
      teams: [],
      projects,
      phases: [],
      allocations: [],
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-11" },
      skills: [skill("node", "Node.js")],
      personSkills: [personSkill("dana", "node", 2)],
      workItems: [workItem({ id: "wi1", project_id: "alpha", estimate_normalized_hours: 81 })],
      jrSkillRequirements: [jrReq("wi1", "node", 2)],
    };

    const c7 = evaluateConflicts(input).filter((c) => c.rule === "C7");
    expect(c7).toHaveLength(1);
    expect(c7[0].severity).toBe("warning");
    expect(c7[0].metrics.required_h).toBe(81);
    expect(c7[0].metrics.free_h).toBe(100);
  });

  it("is at_risk when required hours exceed free hours", () => {
    const people = [person({ id: "dana", name: "Dana" })];
    const projects = [project({ id: "alpha", name: "Alpha" })];

    const input: ConflictEngineInput = {
      ledger: [
        ledgerRow({ week_key: "2026-W37", person_id: "dana", gross_h: 100, available_h: 80, planned_h: 0, utilization: 0 }),
      ],
      teamWeeks: [],
      people,
      teams: [],
      projects,
      phases: [],
      allocations: [],
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-11" },
      skills: [skill("node", "Node.js")],
      personSkills: [personSkill("dana", "node", 2)],
      workItems: [workItem({ id: "wi1", project_id: "alpha", estimate_normalized_hours: 90 })],
      jrSkillRequirements: [jrReq("wi1", "node", 2)],
    };

    const c7 = evaluateConflicts(input).filter((c) => c.rule === "C7");
    expect(c7).toHaveLength(1);
    expect(c7[0].severity).toBe("at_risk");
  });
});

describe("C8 single point of failure", () => {
  it("fires when the only level-3+ holder is loaded across >=2 projects", () => {
    const people = [person({ id: "dana", name: "Dana" })];
    const projects = [project({ id: "alpha", name: "Alpha" }), project({ id: "beta", name: "Beta" })];
    const allocations = [
      alloc({ id: "a1", person_id: "dana", project_id: "alpha", fte: 0.6, start_date: "2026-09-07", end_date: "2026-09-11" }),
      alloc({ id: "a2", person_id: "dana", project_id: "beta", fte: 0.2, start_date: "2026-09-07", end_date: "2026-09-11" }),
    ];

    const input: ConflictEngineInput = {
      ledger: [],
      teamWeeks: [],
      people,
      teams: [],
      projects,
      phases: [],
      allocations,
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-11" },
      skills: [skill("k8s", "Kubernetes")],
      personSkills: [personSkill("dana", "k8s", 3)],
    };

    const c8 = evaluateConflicts(input).filter((c) => c.rule === "C8");
    expect(c8).toHaveLength(1);
    expect(c8[0].severity).toBe("critical");
    expect(c8[0].metrics.total_fte).toBe(0.8);
    expect(c8[0].metrics.project_count).toBe(2);
  });

  it("does not fire when a second level-3+ holder exists", () => {
    const people = [person({ id: "dana", name: "Dana" }), person({ id: "edo", name: "Edo" })];
    const projects = [project({ id: "alpha", name: "Alpha" }), project({ id: "beta", name: "Beta" })];
    const allocations = [
      alloc({ id: "a1", person_id: "dana", project_id: "alpha", fte: 0.6, start_date: "2026-09-07", end_date: "2026-09-11" }),
      alloc({ id: "a2", person_id: "dana", project_id: "beta", fte: 0.2, start_date: "2026-09-07", end_date: "2026-09-11" }),
    ];

    const input: ConflictEngineInput = {
      ledger: [],
      teamWeeks: [],
      people,
      teams: [],
      projects,
      phases: [],
      allocations,
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-11" },
      skills: [skill("k8s", "Kubernetes")],
      personSkills: [personSkill("dana", "k8s", 3), personSkill("edo", "k8s", 3)],
    };

    const c8 = evaluateConflicts(input).filter((c) => c.rule === "C8");
    expect(c8).toHaveLength(0);
  });
});

describe("C9 buffer erosion", () => {
  it("warns when project slack is just under the buffer target", () => {
    const projects = [project({ id: "alpha", name: "Alpha" })];

    const input: ConflictEngineInput = {
      ledger: [],
      teamWeeks: [],
      people: [],
      teams: [],
      projects,
      phases: [],
      allocations: [],
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-11" },
      feasibilityResults: [{ project_id: "alpha", slack_days: 1, buffer_days: 2, verdict: "warning" }],
    };

    const c9 = evaluateConflicts(input).filter((c) => c.rule === "C9");
    expect(c9).toHaveLength(1);
    expect(c9[0].severity).toBe("warning");
    expect(c9[0].metrics.slack_days).toBe(1);
    expect(c9[0].metrics.buffer_days).toBe(2);
  });

  it("warns when a person stays below the personal-buffer threshold for >=2 consecutive weeks", () => {
    const people = [person({ id: "dana", name: "Dana" })];

    const input: ConflictEngineInput = {
      ledger: [
        ledgerRow({ week_key: "2026-W37", person_id: "dana", gross_h: 40, available_h: 40, planned_h: 35, utilization: 0.88 }),
        ledgerRow({ week_key: "2026-W38", person_id: "dana", gross_h: 40, available_h: 40, planned_h: 35, utilization: 0.88 }),
      ],
      teamWeeks: [],
      people,
      teams: [],
      projects: [],
      phases: [],
      allocations: [],
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-18" },
    };

    const c9 = evaluateConflicts(input).filter((c) => c.rule === "C9" && c.person_id);
    expect(c9).toHaveLength(1);
    expect(c9[0].severity).toBe("warning");
    expect(c9[0].window_start).toBe("2026-W37");
    expect(c9[0].window_end).toBe("2026-W38");
    expect(c9[0].metrics.weeks).toBe(2);
  });
});

import { describe, it, expect } from "vitest";
import { computeFeasibility, generateAlternatives } from "./index";
import { Project, ProjectPhase, Person, Allocation, OrgCalendar } from "@kairo/types";

const cal: OrgCalendar = {
  id: "cal",
  workingDays: [1, 2, 3, 4, 5],
  holidays: [],
};

function person(id: string, name: string, hours = 8, overhead = 0): Person {
  return {
    id,
    name,
    email: `${id}@example.com`,
    role_id: "r1",
    seniority: 2,
    hours_per_day: hours,
    overhead_pct: overhead,
    active: true,
  };
}

function proj(id: string, overrides: Partial<Project> = {}): Project {
  return {
    id,
    plane_id: null,
    code: id.toUpperCase(),
    name: `Project ${id}`,
    status: "active",
    priority: 1,
    deadline: null,
    declared_start: null,
    declared_end: null,
    team_scope: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function phase(
  id: string,
  projectId: string,
  sequence: number,
  start: string,
  end: string,
  effort: number,
): ProjectPhase {
  return {
    id,
    project_id: projectId,
    name: `Phase ${id}`,
    sequence,
    declared_start: start,
    declared_end: end,
    effort_hours: effort,
    status: "confirmed",
    source: "manual",
  };
}

function alloc(
  id: string,
  personId: string,
  projectId: string,
  fte: number,
  start: string,
  end: string,
  phaseId?: string,
): Allocation {
  return {
    id,
    person_id: personId,
    project_id: projectId,
    phase_id: phaseId ?? null,
    fte,
    start_date: start,
    end_date: end,
    status: "committed",
    source: "manual",
  };
}

describe("computeFeasibility", () => {
  it("chains phases FS and computes throughput", () => {
    const p = proj("p1", { declared_start: "2026-01-05", deadline: "2026-02-09" });
    const dana = person("dana", "Dana");
    const phases = [
      phase("a", "p1", 1, "2026-01-05", "2026-01-30", 80),
      phase("b", "p1", 2, "2026-01-12", "2026-02-20", 80),
    ];
    const allocations = [
      alloc("a1", "dana", "p1", 1, "2026-01-05", "2026-01-30", "a"),
      alloc("a2", "dana", "p1", 1, "2026-01-12", "2026-02-20", "b"),
    ];

    const result = computeFeasibility({
      project: p,
      phases,
      allocations,
      people: [dana],
      dependencies: [],
      calendar: cal,
    });

    expect(result.per_phase[0]).toMatchObject({
      computed_start: "2026-01-05",
      computed_finish: "2026-01-19",
      duration_weeks: 2,
      effort_hours: 80,
      staffed_fte: 1,
    });
    expect(result.per_phase[1]).toMatchObject({
      computed_start: "2026-01-19",
      computed_finish: "2026-02-02",
      duration_weeks: 2,
    });
    expect(result.computed_finish).toBe("2026-02-02");
    expect(result.slack_days).toBe(5);
    expect(result.buffer_days).toBe(3);
    expect(result.verdict).toBe("healthy");
    expect(result.critical_path).toEqual(["a", "b"]);
  });

  it("treats two people at 50% as equivalent to one at 100%", () => {
    const p = proj("p1", { declared_start: "2026-01-05" });
    const dana = person("dana", "Dana");
    const edo = person("edo", "Edo");
    const phases = [phase("a", "p1", 1, "2026-01-05", "2026-01-30", 80)];

    const resultSingle = computeFeasibility({
      project: p,
      phases,
      allocations: [alloc("a1", "dana", "p1", 1, "2026-01-05", "2026-01-30", "a")],
      people: [dana],
      dependencies: [],
      calendar: cal,
    });

    const resultHalf = computeFeasibility({
      project: p,
      phases,
      allocations: [
        alloc("a1", "dana", "p1", 0.5, "2026-01-05", "2026-01-30", "a"),
        alloc("a2", "edo", "p1", 0.5, "2026-01-05", "2026-01-30", "a"),
      ],
      people: [dana, edo],
      dependencies: [],
      calendar: cal,
    });

    expect(resultHalf.per_phase[0].duration_weeks).toBe(
      resultSingle.per_phase[0].duration_weeks,
    );
    expect(resultHalf.per_phase[0].staffed_fte).toBe(1);
  });

  it("gates a successor on an explicit FS dependency with lag", () => {
    const p = proj("p1", { declared_start: "2026-01-05" });
    const dana = person("dana", "Dana");
    const phases = [
      phase("a", "p1", 1, "2026-01-05", "2026-01-16", 40),
      phase("b", "p1", 2, "2026-01-12", "2026-01-23", 40),
    ];
    const allocations = [
      alloc("a1", "dana", "p1", 1, "2026-01-05", "2026-01-16", "a"),
      alloc("a2", "dana", "p1", 1, "2026-01-12", "2026-01-23", "b"),
    ];
    const dependencies = [
      {
        id: "d1",
        from_project_id: "p1",
        from_phase_id: "a",
        to_project_id: "p1",
        to_phase_id: "b",
        type: "FS" as const,
        lag_days: 5,
        source: "manual" as const,
      },
    ];

    const result = computeFeasibility({
      project: p,
      phases,
      allocations,
      people: [dana],
      dependencies,
      calendar: cal,
    });

    // Phase a finishes 2026-01-12, plus 5 calendar days -> 2026-01-17 (Sat) -> next working day 2026-01-19.
    expect(result.per_phase[0].computed_finish).toBe("2026-01-12");
    expect(result.per_phase[1].computed_start).toBe("2026-01-19");
  });

  it("flags an unstaffed phase and floors verdict at at_risk", () => {
    const p = proj("p1", { declared_start: "2026-01-05" });
    const phases = [phase("a", "p1", 1, "2026-01-05", "2026-01-09", 40)];

    const result = computeFeasibility({
      project: p,
      phases,
      allocations: [],
      people: [],
      dependencies: [],
      calendar: cal,
    });

    expect(result.drivers).toContain("Phase Phase a has effort but no allocation");
    expect(result.per_phase[0].duration_weeks).toBe(1);
    expect(result.verdict).toBe("at_risk");
  });

  it("records external project dependencies as unresolved drivers", () => {
    const p = proj("p1", { declared_start: "2026-01-05" });
    const dana = person("dana", "Dana");
    const phases = [phase("a", "p1", 1, "2026-01-05", "2026-01-16", 40)];
    const dependencies = [
      {
        id: "d1",
        from_project_id: "p2",
        from_phase_id: "x",
        to_project_id: "p1",
        to_phase_id: "a",
        type: "FS" as const,
        lag_days: 0,
        source: "manual" as const,
      },
    ];

    const result = computeFeasibility({
      project: p,
      phases,
      allocations: [alloc("a1", "dana", "p1", 1, "2026-01-05", "2026-01-16", "a")],
      people: [dana],
      dependencies,
      calendar: cal,
    });

    expect(result.drivers).toContain(
      "External dependency d1 from project p2 cannot be resolved",
    );
  });

  it("applies verdict boundaries correctly", () => {
    const p = proj("p1", { declared_start: "2026-01-05" });
    const dana = person("dana", "Dana");
    const phases = [phase("a", "p1", 1, "2026-01-05", "2026-01-16", 80)];
    const allocations = [alloc("a1", "dana", "p1", 1, "2026-01-05", "2026-01-16", "a")];
    // finish 2026-01-19, duration 2 weeks = 10 working days, buffer = 3.

    const base = { project: p, phases, allocations, people: [dana], dependencies: [], calendar: cal };

    const healthy = computeFeasibility({ ...base, project: { ...p, deadline: "2026-01-22" } });
    expect(healthy.slack_days).toBe(3);
    expect(healthy.verdict).toBe("healthy");

    const warning = computeFeasibility({ ...base, project: { ...p, deadline: "2026-01-21" } });
    expect(warning.slack_days).toBe(2);
    expect(warning.verdict).toBe("warning");

    const atRisk = computeFeasibility({ ...base, project: { ...p, deadline: "2026-01-05" } });
    expect(atRisk.slack_days).toBe(-10);
    expect(atRisk.verdict).toBe("at_risk");

    const critical = computeFeasibility({ ...base, project: { ...p, deadline: "2026-01-02" } });
    expect(critical.slack_days).toBe(-11);
    expect(critical.verdict).toBe("critical");
  });

  it("calls no-deadline projects healthy when staffed and at_risk when unstaffed", () => {
    const p = proj("p1", { declared_start: "2026-01-05" });
    const dana = person("dana", "Dana");
    const phases = [phase("a", "p1", 1, "2026-01-05", "2026-01-16", 40)];

    const staffed = computeFeasibility({
      project: p,
      phases,
      allocations: [alloc("a1", "dana", "p1", 1, "2026-01-05", "2026-01-16", "a")],
      people: [dana],
      dependencies: [],
      calendar: cal,
    });
    expect(staffed.deadline).toBeNull();
    expect(staffed.slack_days).toBeNull();
    expect(staffed.verdict).toBe("healthy");

    const unstaffed = computeFeasibility({
      project: p,
      phases,
      allocations: [],
      people: [],
      dependencies: [],
      calendar: cal,
    });
    expect(unstaffed.verdict).toBe("at_risk");
  });
});

describe("generateAlternatives", () => {
  it("levels existing allocations and borrows the freest person", () => {
    const p = proj("p1", { declared_start: "2026-01-05" });
    const dana = person("dana", "Dana");
    const edo = person("edo", "Edo");
    const phases = [phase("a", "p1", 1, "2026-01-05", "2026-01-30", 80)];
    const allocations = [alloc("a1", "dana", "p1", 0.5, "2026-01-05", "2026-01-30", "a")];
    const result = computeFeasibility({
      project: p,
      phases,
      allocations,
      people: [dana, edo],
      dependencies: [],
      calendar: cal,
    });

    const alts = generateAlternatives({
      feasibility: { project: p, phases, allocations, people: [dana, edo], dependencies: [], calendar: cal },
      result,
      workItems: [],
      personFreeHours: { dana: 20, edo: 30 },
    });

    const level = alts.find((a) => a.strategy === "level_resources")!;
    expect(level.ops).toHaveLength(1);
    expect(level.ops[0]).toMatchObject({ op: "change_allocation_fte", allocation_id: "a1", fte: 1 });
    expect(level.tradeoffs[0]).toContain("Dana");

    const borrow = alts.find((a) => a.strategy === "borrow_resources")!;
    expect(borrow.ops[0]).toMatchObject({ op: "add_allocation", person_id: "edo", fte: 0.5 });
  });

  it("extends deadline by the exact weeks needed to restore buffer", () => {
    const p = proj("p1", { declared_start: "2026-01-05", deadline: "2026-01-05" });
    const dana = person("dana", "Dana");
    const phases = [phase("a", "p1", 1, "2026-01-05", "2026-01-16", 80)];
    const allocations = [alloc("a1", "dana", "p1", 1, "2026-01-05", "2026-01-16", "a")];
    const result = computeFeasibility({
      project: p,
      phases,
      allocations,
      people: [dana],
      dependencies: [],
      calendar: cal,
    });
    expect(result.verdict).toBe("at_risk");
    expect(result.slack_days).toBe(-10);
    expect(result.buffer_days).toBe(3);

    const alts = generateAlternatives({
      feasibility: { project: p, phases, allocations, people: [dana], dependencies: [], calendar: cal },
      result,
      workItems: [],
    });

    const extend = alts.find((a) => a.strategy === "extend_deadline")!;
    expect(extend.ops[0]).toMatchObject({ op: "set_deadline", project_id: "p1", date: "2026-01-22" });
    expect(extend.description).toContain("3 week(s)");
  });

  it("does not propose extend_deadline when the project is healthy", () => {
    const p = proj("p1", { declared_start: "2026-01-05", deadline: "2026-01-22" });
    const dana = person("dana", "Dana");
    const phases = [phase("a", "p1", 1, "2026-01-05", "2026-01-16", 80)];
    const allocations = [alloc("a1", "dana", "p1", 1, "2026-01-05", "2026-01-16", "a")];
    const result = computeFeasibility({
      project: p,
      phases,
      allocations,
      people: [dana],
      dependencies: [],
      calendar: cal,
    });

    const alts = generateAlternatives({
      feasibility: { project: p, phases, allocations, people: [dana], dependencies: [], calendar: cal },
      result,
      workItems: [],
    });

    expect(alts.some((a) => a.strategy === "extend_deadline")).toBe(false);
  });

  it("selects reduce_scope items by estimate descending", () => {
    const p = proj("p1", { declared_start: "2026-01-05", deadline: "2026-01-02" });
    const dana = person("dana", "Dana");
    const phases = [phase("a", "p1", 1, "2026-01-05", "2026-01-30", 160)];
    const allocations = [alloc("a1", "dana", "p1", 1, "2026-01-05", "2026-01-30", "a")];
    const result = computeFeasibility({
      project: p,
      phases,
      allocations,
      people: [dana],
      dependencies: [],
      calendar: cal,
    });

    const workItems = [
      { id: "wi1", project_id: "p1", title: "A", status: "todo" as const, priority: 4, estimate_normalized_hours: 40, plane_id: "p1", assignee_ids: [], labels: [], cycle: null, start_date: null, due_date: null, estimate_raw: null, updated_at: "2026-01-01T00:00:00Z" },
      { id: "wi2", project_id: "p1", title: "B", status: "backlog" as const, priority: 2, estimate_normalized_hours: 80, plane_id: "p2", assignee_ids: [], labels: [], cycle: null, start_date: null, due_date: null, estimate_raw: null, updated_at: "2026-01-01T00:00:00Z" },
      { id: "wi3", project_id: "p1", title: "C", status: "todo" as const, priority: 3, estimate_normalized_hours: 10, plane_id: "p3", assignee_ids: [], labels: [], cycle: null, start_date: null, due_date: null, estimate_raw: null, updated_at: "2026-01-01T00:00:00Z" },
    ];

    const alts = generateAlternatives({
      feasibility: { project: p, phases, allocations, people: [dana], dependencies: [], calendar: cal },
      result,
      workItems,
    });

    const reduce = alts.find((a) => a.strategy === "reduce_scope")!;
    expect(reduce.ops[0]).toMatchObject({ op: "defer_work_items", work_item_ids: ["wi2", "wi1"] });
    expect(reduce.tradeoffs[0]).toContain("120h");
  });

  it("emits an empty reduce_scope op when nothing is deferrable", () => {
    const p = proj("p1", { declared_start: "2026-01-05", deadline: "2026-01-02" });
    const dana = person("dana", "Dana");
    const phases = [phase("a", "p1", 1, "2026-01-05", "2026-01-16", 80)];
    const allocations = [alloc("a1", "dana", "p1", 1, "2026-01-05", "2026-01-16", "a")];
    const result = computeFeasibility({
      project: p,
      phases,
      allocations,
      people: [dana],
      dependencies: [],
      calendar: cal,
    });

    const alts = generateAlternatives({
      feasibility: { project: p, phases, allocations, people: [dana], dependencies: [], calendar: cal },
      result,
      workItems: [],
    });

    const reduce = alts.find((a) => a.strategy === "reduce_scope")!;
    expect(reduce.ops).toEqual([]);
    expect(reduce.tradeoffs[0]).toContain("no deferrable");
  });
});

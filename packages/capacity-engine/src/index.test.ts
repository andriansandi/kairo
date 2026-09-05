import { describe, it, expect } from "vitest";
import {
  buildCapacityLedger,
  rollupTeamCapacity,
  rollupProjectDemand,
  CapacityInput,
  MAX_UTILIZATION_SENTINEL,
} from "./index";
import type { Person, Allocation, PtoEntry, OrgCalendar, Team, TeamMembership } from "@kairo/types";

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

function ptoEntry(person_id: string, start: string, end: string): PtoEntry {
  return {
    id: `${person_id}-pto`,
    person_id,
    dates: [start, end],
    type: "pto",
  };
}

describe("buildCapacityLedger", () => {
  it("computes the Dana example exactly", () => {
    const input: CapacityInput = {
      people: [person({ id: "dana", name: "Dana", hours_per_day: 8, overhead_pct: 0.2 })],
      allocations: [
        alloc({ id: "a1", person_id: "dana", project_id: "alpha", fte: 0.5, start_date: "2026-09-07", end_date: "2026-09-11" }),
        alloc({ id: "a2", person_id: "dana", project_id: "beta", fte: 0.5, start_date: "2026-09-07", end_date: "2026-09-11" }),
      ],
      ptoEntries: [ptoEntry("dana", "2026-09-09", "2026-09-09")],
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-11" },
    };

    const rows = buildCapacityLedger(input);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.week_key).toBe("2026-W37");
    expect(r.gross_h).toBe(40);
    expect(r.pto_h).toBe(8);
    expect(r.overhead_h).toBe(8);
    expect(r.available_h).toBe(24);
    expect(r.planned_h).toBe(40);
    expect(r.utilization).toBe(1.67);
    expect((r as any).flags).toContain("over_capacity");
  });

  it("subtracts an in-week holiday from gross capacity", () => {
    const input: CapacityInput = {
      people: [person({ id: "dana", hours_per_day: 8, overhead_pct: 0 })],
      allocations: [],
      ptoEntries: [],
      calendar: cal(["2026-09-09"]),
      horizon: { from: "2026-09-07", to: "2026-09-11" },
    };
    const [r] = buildCapacityLedger(input);
    expect(r.gross_h).toBe(32);
    expect(r.available_h).toBe(32);
  });

  it("handles partial horizon edge weeks", () => {
    const input: CapacityInput = {
      people: [person({ id: "dana", hours_per_day: 8, overhead_pct: 0 })],
      allocations: [],
      ptoEntries: [],
      calendar: cal(),
      horizon: { from: "2026-09-09", to: "2026-09-18" },
    };
    const rows = buildCapacityLedger(input);
    expect(rows).toHaveLength(2);
    const w37 = rows.find((r) => r.week_key === "2026-W37")!;
    const w38 = rows.find((r) => r.week_key === "2026-W38")!;
    expect(w37.gross_h).toBe(24);
    expect(w38.gross_h).toBe(40);
  });

  it("uses the sentinel utilization when all-week PTO leaves no available capacity", () => {
    const input: CapacityInput = {
      people: [person({ id: "dana", hours_per_day: 8, overhead_pct: 0.2 })],
      allocations: [
        alloc({ id: "a1", person_id: "dana", project_id: "alpha", fte: 0.5, start_date: "2026-09-07", end_date: "2026-09-11" }),
      ],
      ptoEntries: [ptoEntry("dana", "2026-09-07", "2026-09-11")],
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-11" },
    };
    const [r] = buildCapacityLedger(input);
    expect(r.gross_h).toBe(40);
    expect(r.pto_h).toBe(40);
    expect(r.available_h).toBe(-8);
    expect(r.planned_h).toBe(20);
    expect(r.utilization).toBe(MAX_UTILIZATION_SENTINEL);
    expect((r as any).flags).toContain("no_available_capacity");
  });

  it("skips inactive people", () => {
    const input: CapacityInput = {
      people: [
        person({ id: "active", active: true }),
        person({ id: "inactive", active: false }),
      ],
      allocations: [
        alloc({ id: "a1", person_id: "inactive", project_id: "alpha", fte: 1, start_date: "2026-09-07", end_date: "2026-09-11" }),
      ],
      ptoEntries: [],
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-11" },
    };
    const rows = buildCapacityLedger(input);
    expect(rows.map((r) => r.person_id)).toEqual(["active"]);
  });

  it("returns an empty ledger for empty inputs", () => {
    const input: CapacityInput = {
      people: [],
      allocations: [],
      ptoEntries: [],
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-11" },
    };
    expect(buildCapacityLedger(input)).toEqual([]);
  });
});

describe("rollupTeamCapacity", () => {
  it("aggregates member availability, demand, utilization, and flags", () => {
    const people: Person[] = [
      person({ id: "a", name: "A" }),
      person({ id: "b", name: "B" }),
    ];
    const input: CapacityInput = {
      people,
      allocations: [
        alloc({ id: "a1", person_id: "a", project_id: "alpha", fte: 1.25, start_date: "2026-09-07", end_date: "2026-09-11" }),
        alloc({ id: "b1", person_id: "b", project_id: "alpha", fte: 1, start_date: "2026-09-07", end_date: "2026-09-11" }),
      ],
      ptoEntries: [],
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-11" },
    };

    const ledger = buildCapacityLedger(input) as any[];
    const teams: Team[] = [{ id: "builders", name: "Builders", type: "builder" }];
    const memberships: TeamMembership[] = [
      { id: "m1", person_id: "a", team_id: "builders" },
      { id: "m2", person_id: "b", team_id: "builders" },
    ];

    const rolled = rollupTeamCapacity({ ledger, teams, memberships });
    expect(rolled).toHaveLength(1);
    const row = rolled[0];
    expect(row.team_id).toBe("builders");
    expect(row.week_key).toBe("2026-W37");
    expect(row.member_count).toBe(2);
    expect(row.available_h).toBe(64);
    expect(row.planned_h).toBe(90);
    expect(row.utilization).toBe(1.41);
    expect(row.flags).toContain("over_capacity");
  });

  it("returns an empty array for empty inputs", () => {
    expect(rollupTeamCapacity({ ledger: [], teams: [], memberships: [] })).toEqual([]);
  });
});

describe("rollupProjectDemand", () => {
  it("sums FTE-weighted gross hours per project week and counts distinct people", () => {
    const people: Person[] = [
      person({ id: "p1", name: "P1" }),
      person({ id: "p2", name: "P2" }),
    ];
    const input: CapacityInput = {
      people,
      allocations: [
        alloc({ id: "a1", person_id: "p1", project_id: "alpha", fte: 0.5, start_date: "2026-09-07", end_date: "2026-09-11" }),
        alloc({ id: "a2", person_id: "p2", project_id: "alpha", fte: 0.25, start_date: "2026-09-07", end_date: "2026-09-11" }),
      ],
      ptoEntries: [],
      calendar: cal(),
      horizon: { from: "2026-09-07", to: "2026-09-11" },
    };

    const demand = rollupProjectDemand({
      allocations: input.allocations,
      people,
      calendar: input.calendar,
      horizon: input.horizon,
    });
    expect(demand).toHaveLength(1);
    expect(demand[0].project_id).toBe("alpha");
    expect(demand[0].planned_h).toBe(30);
    expect(demand[0].person_count).toBe(2);
  });

  it("returns an empty array for empty inputs", () => {
    expect(
      rollupProjectDemand({
        allocations: [],
        people: [],
        calendar: cal(),
        horizon: { from: "2026-09-07", to: "2026-09-11" },
      }),
    ).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import {
  addDays,
  calculatePlanningHorizon,
  conflictKey,
  filterByWeekRange,
  getWeekRange,
  mapAllocationRowToEngine,
  mapCapacityEntryRow,
  mapPersonRowToEngine,
  mapPhaseRowToEngine,
  mapProjectRowToEngine,
  mapPtoRowToEngine,
  mapTeamMembershipRowToEngine,
  mapTeamRowToEngine,
  parseOrgCalendarRow,
  todayIso,
} from "../src/services/snapshot";
import { isoWeekKey, weekStart } from "@kairo/calendar";

describe("planning horizon", () => {
  it("starts 4 weeks before the current Monday", () => {
    const today = "2026-09-02"; // Wednesday
    const horizon = calculatePlanningHorizon([], today);
    expect(horizon.from).toBe(weekStart(addDays(today, -28)));
    expect(horizon.to).toBe(weekStart(addDays(today, 26 * 7)));
  });

  it("extends horizon to the latest allocation end date when it exceeds the default", () => {
    const today = "2026-09-02";
    const allocations = [{ end_date: "2027-12-31" }];
    const horizon = calculatePlanningHorizon(allocations, today);
    expect(horizon.to).toBe("2027-12-31");
    expect(horizon.from).toBe(weekStart(addDays(today, -28)));
  });
});

describe("week range", () => {
  it("defaults to last 4 weeks through next 12 weeks", () => {
    const today = "2026-09-02";
    const range = getWeekRange(undefined, undefined, today);
    expect(range.fromDate).toBe(weekStart(addDays(today, -28)));
    expect(range.toDate).toBe(weekStart(addDays(today, 12 * 7)));
    expect(range.fromKey).toBe(isoWeekKey(range.fromDate));
    expect(range.toKey).toBe(isoWeekKey(range.toDate));
  });

  it("snaps non-Monday dates to Monday week keys", () => {
    const range = getWeekRange("2026-09-02", "2026-10-08");
    expect(range.fromDate).toBe("2026-08-31");
    expect(range.toDate).toBe("2026-10-05");
  });
});

describe("week key filtering", () => {
  it("keeps rows inside the inclusive week range", () => {
    const rows = [
      { week_key: "2026-W01" },
      { week_key: "2026-W05" },
      { week_key: "2026-W12" },
      { week_key: "2026-W52" },
      { week_key: "2027-W01" },
    ];
    const result = filterByWeekRange(rows, "2026-W05", "2026-W52");
    expect(result.map((r) => r.week_key)).toEqual([
      "2026-W05",
      "2026-W12",
      "2026-W52",
    ]);
  });

  it("sorts lexicographically because week numbers are zero-padded", () => {
    const rows = [{ week_key: "2026-W09" }, { week_key: "2026-W10" }];
    expect(filterByWeekRange(rows, "2026-W02", "2026-W12")).toHaveLength(2);
    // W09 < W10 lexicographically only when zero-padded.
    expect("2026-W09" < "2026-W10").toBe(true);
    expect("2026-W9" < "2026-W10").toBe(false);
  });
});

describe("conflict coalescing key", () => {
  it("treats unset IDs as empty segments", () => {
    expect(conflictKey({ rule: "C1" } as any)).toBe("C1||||");
  });

  it("includes all provided IDs", () => {
    expect(
      conflictKey({
        rule: "C1",
        person_id: "p1",
        team_id: "t1",
        project_id: "pr1",
        phase_id: "ph1",
      }),
    ).toBe("C1|p1|t1|pr1|ph1");
  });
});

describe("source row to engine input mapping", () => {
  it("maps a person row and coerces active to boolean", () => {
    const person = mapPersonRowToEngine({
      id: "p1",
      name: "A",
      email: "a@example.com",
      role_id: "r1",
      seniority: 3,
      hours_per_day: 7.5,
      overhead_pct: 0.25,
      active: 0,
    });
    expect(person.active).toBe(false);
    expect(person.hours_per_day).toBe(7.5);
    expect(person.overhead_pct).toBe(0.25);
  });

  it("maps an allocation row with null phase", () => {
    const allocation = mapAllocationRowToEngine({
      id: "a1",
      person_id: "p1",
      project_id: "pr1",
      phase_id: null,
      fte: 0.8,
      start_date: "2026-10-01",
      end_date: "2026-10-31",
      status: "committed",
      source: "manual",
    });
    expect(allocation.phase_id).toBeNull();
    expect(allocation.fte).toBe(0.8);
  });

  it("parses a PTO row with JSON dates", () => {
    const pto = mapPtoRowToEngine({
      id: "pto1",
      person_id: "p1",
      dates: '["2026-10-01", "2026-10-05"]',
      type: "pto",
    });
    expect(pto.dates).toEqual(["2026-10-01", "2026-10-05"]);
  });

  it("provides a default calendar when no row is supplied", () => {
    const cal = parseOrgCalendarRow(undefined);
    expect(cal.workingDays).toEqual([1, 2, 3, 4, 5]);
    expect(cal.holidays).toEqual([]);
  });

  it("parses a calendar with JSON working days and holidays", () => {
    const cal = parseOrgCalendarRow({
      id: "cal1",
      working_days: "[1,2,3]",
      holidays: '["2026-01-01"]',
    });
    expect(cal.workingDays).toEqual([1, 2, 3]);
    expect(cal.holidays).toEqual(["2026-01-01"]);
  });

  it("maps a project row with null dates and JSON team_scope", () => {
    const project = mapProjectRowToEngine({
      id: "pr1",
      plane_id: "pl1",
      code: "PRJ",
      name: "Project",
      status: "active",
      priority: 1,
      deadline: null,
      declared_start: null,
      declared_end: null,
      team_scope: '["t1"]',
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    expect(project.deadline).toBeNull();
    expect(project.team_scope).toEqual(["t1"]);
  });

  it("maps a phase row with defaults", () => {
    const phase = mapPhaseRowToEngine({
      id: "ph1",
      project_id: "pr1",
      name: "Phase 1",
      sequence: 0,
      declared_start: "2026-10-01",
      declared_end: "2026-10-31",
    });
    expect(phase.effort_hours).toBe(0);
    expect(phase.status).toBe("draft");
    expect(phase.source).toBe("manual");
  });

  it("maps team and membership rows", () => {
    const team = mapTeamRowToEngine({
      id: "t1",
      name: "Squad",
      type: "builder",
    });
    expect(team.type).toBe("builder");

    const membership = mapTeamMembershipRowToEngine({
      id: "tm1",
      person_id: "p1",
      team_id: "t1",
    });
    expect(membership.team_id).toBe("t1");
  });

  it("maps a capacity entry row and parses JSON flags", () => {
    const entry = mapCapacityEntryRow({
      week_key: "2026-W05",
      person_id: "p1",
      gross_h: 40,
      pto_h: 0,
      overhead_h: 8,
      available_h: 32,
      planned_h: 48,
      utilization: 1.5,
      flags: '["over_capacity"]',
    });
    expect(entry.flags).toEqual(["over_capacity"]);
    expect(entry.utilization).toBe(1.5);
  });
});

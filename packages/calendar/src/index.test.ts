import { describe, it, expect } from "vitest";
import {
  isWorkingDay,
  workingDaysBetween,
  nextWorkingDay,
  addWorkingDays,
  weekStart,
  isoWeekKey,
} from "./index";
import type { OrgCalendar, IsoDate } from "@kairo/types";

function cal(holidays: IsoDate[] = []): OrgCalendar {
  return {
    id: "cal-test",
    workingDays: [1, 2, 3, 4, 5],
    holidays,
  };
}

describe("calendar", () => {
  it("identifies weekends as non-working", () => {
    const c = cal();
    expect(isWorkingDay("2026-09-07", c)).toBe(true); // Mon
    expect(isWorkingDay("2026-09-11", c)).toBe(true); // Fri
    expect(isWorkingDay("2026-09-12", c)).toBe(false); // Sat
    expect(isWorkingDay("2026-09-13", c)).toBe(false); // Sun
  });

  it("observes holidays", () => {
    const c = cal(["2026-09-07"]);
    expect(isWorkingDay("2026-09-07", c)).toBe(false);
    expect(isWorkingDay("2026-09-08", c)).toBe(true);
  });

  it("counts working days across weeks", () => {
    const c = cal();
    // Mon 7 Sep - Mon 14 Sep (exclusive end) = 5 working days
    expect(workingDaysBetween("2026-09-07", "2026-09-14", c)).toBe(5);
  });

  it("handles zero-length ranges", () => {
    expect(workingDaysBetween("2026-09-07", "2026-09-07", cal())).toBe(0);
  });

  it("adds working days across weekends", () => {
    const c = cal();
    expect(addWorkingDays("2026-09-11", 1, c)).toBe("2026-09-14"); // Fri -> Mon
  });

  it("adds working days across holidays", () => {
    const c = cal(["2026-09-08"]);
    expect(addWorkingDays("2026-09-07", 2, c)).toBe("2026-09-10"); // skips Tue holiday
  });

  it("weekStart returns Monday and spans Sunday→Monday boundary", () => {
    expect(weekStart("2026-09-13")).toBe("2026-09-07"); // Sun
    expect(weekStart("2026-09-14")).toBe("2026-09-14"); // Mon
    expect(weekStart("2026-09-11")).toBe("2026-09-07"); // Fri
  });

  it("isoWeekKey returns ISO week identifiers", () => {
    expect(isoWeekKey("2026-09-07")).toBe("2026-W37");
    expect(isoWeekKey("2026-09-13")).toBe("2026-W37"); // Sun
    expect(isoWeekKey("2026-09-14")).toBe("2026-W38"); // Mon
  });

  it("nextWorkingDay returns the same day when already working", () => {
    expect(nextWorkingDay("2026-09-07", cal())).toBe("2026-09-07");
  });

  it("nextWorkingDay advances from weekend to Monday", () => {
    expect(nextWorkingDay("2026-09-12", cal())).toBe("2026-09-14");
  });
});

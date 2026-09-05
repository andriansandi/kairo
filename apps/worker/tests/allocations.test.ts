import { describe, it, expect } from "vitest";
import {
  AllocationListQuerySchema,
  CreateAllocationSchema,
  mapAllocationRow,
  overlapsRange,
  UpdateAllocationSchema,
  validateAllocationDates,
} from "../src/schemas/allocations";

describe("allocations schemas", () => {
  it("maps an allocation row", () => {
    const a = mapAllocationRow({
      id: "a1",
      person_id: "p1",
      project_id: "pr1",
      phase_id: "ph1",
      fte: 0.8,
      start_date: "2026-10-01",
      end_date: "2026-10-31",
      status: "committed",
      source: "manual",
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    });
    expect(a.fte).toBe(0.8);
    expect(a.phase_id).toBe("ph1");
    expect(a.status).toBe("committed");
  });

  it("rejects fte outside 0-2", () => {
    const result = CreateAllocationSchema.safeParse({
      person_id: "p1",
      project_id: "pr1",
      fte: 2.5,
      start_date: "2026-10-01",
      end_date: "2026-10-31",
    });
    expect(result.success).toBe(false);
  });

  it("rejects end date before start date", () => {
    expect(() =>
      validateAllocationDates("2026-10-10", "2026-10-01"),
    ).toThrow("end_date must be on or after start_date");
  });

  it("applies create defaults", () => {
    const result = CreateAllocationSchema.parse({
      person_id: "p1",
      project_id: "pr1",
      fte: 1,
      start_date: "2026-10-01",
      end_date: "2026-10-31",
    });
    expect(result.status).toBe("committed");
    expect(result.source).toBe("manual");
  });

  it("coerces fte from string", () => {
    const result = CreateAllocationSchema.parse({
      person_id: "p1",
      project_id: "pr1",
      fte: "0.75",
      start_date: "2026-10-01",
      end_date: "2026-10-31",
    });
    expect(result.fte).toBe(0.75);
  });

  it("parses list query with defaults", () => {
    const query = AllocationListQuerySchema.parse({});
    expect(query.limit).toBe(50);
    expect(query.person_id).toBeUndefined();
    expect(query.project_id).toBeUndefined();
    expect(query.from).toBeUndefined();
    expect(query.to).toBeUndefined();
  });

  it("detects overlap with a date range", () => {
    expect(overlapsRange("2026-10-01", "2026-10-31", "2026-10-15", "2026-11-15")).toBe(true);
    expect(overlapsRange("2026-10-01", "2026-10-31", "2026-11-01", "2026-11-15")).toBe(false);
    expect(overlapsRange("2026-10-01", "2026-10-31", undefined, "2026-09-15")).toBe(false);
  });

  it("parses partial update", () => {
    const result = UpdateAllocationSchema.parse({ fte: 0.5 });
    expect(result.fte).toBe(0.5);
  });
});

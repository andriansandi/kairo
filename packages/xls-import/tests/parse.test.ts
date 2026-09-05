import { describe, it, expect } from "vitest";
import {
  parseFteCell,
  validateRows,
  CANONICAL_FIELDS,
  FIELD_LABELS,
  TimelineImportRowSchema,
} from "../src/index";

const validRow = {
  project_name: "Apollo",
  phase_name: "Design",
  start_date: "2026-10-01",
  end_date: "2026-10-31",
  effort_hours: 80,
  person_email: "alice@example.com",
  person_name: "Alice",
  fte: 0.5,
};

function errorCodes(result: ReturnType<typeof validateRows>, row: number) {
  return result.errors
    .filter((e) => e.row === row)
    .map((e) => `${e.code}${e.field ? `:${e.field}` : ""}`);
}

function warningCodes(result: ReturnType<typeof validateRows>, row: number) {
  return result.warnings
    .filter((w) => w.row === row)
    .map((w) => `${w.code}${w.field ? `:${w.field}` : ""}`);
}

describe("parseFteCell", () => {
  it.each([
    [0.5, 0.5],
    ["0.5", 0.5],
    [1, 1],
    ["1", 1],
    ["50%", 0.5],
    ["100%", 1],
    ["25%", 0.25],
    ["  75%  ", 0.75],
  ])("parses %s as %s", (input, expected) => {
    expect(parseFteCell(input)).toBe(expected);
  });

  it.each([null, undefined, "", "not-a-number", "50%%", {}, []])(
    "returns null for %s",
    (input) => {
      expect(parseFteCell(input)).toBeNull();
    },
  );
});

describe("TimelineImportRowSchema", () => {
  it("accepts a canonical row", () => {
    const parsed = TimelineImportRowSchema.parse(validRow);
    expect(parsed.project_name).toBe("Apollo");
    expect(parsed.fte).toBe(0.5);
  });
});

describe("CANONICAL_FIELDS + FIELD_LABELS", () => {
  it("exports every field with a human label", () => {
    for (const field of CANONICAL_FIELDS) {
      expect(typeof FIELD_LABELS[field]).toBe("string");
    }
  });
});

describe("validateRows", () => {
  it("returns valid rows without errors or warnings", () => {
    const result = validateRows([validRow]);
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.rows[0].fte).toBe(0.5);
  });

  it("flags missing required fields", () => {
    const result = validateRows([{}]);
    expect(result.rows).toHaveLength(0);
    expect(errorCodes(result, 1).sort()).toEqual([
      "missing_required:end_date",
      "missing_required:phase_name",
      "missing_required:project_name",
      "missing_required:start_date",
    ]);
  });

  it.each([
    ["start_date", "2026-13-01"],
    ["end_date", "2026-02-30"],
  ])("flags invalid %s", (field, value) => {
    const result = validateRows([{ ...validRow, [field]: value }]);
    expect(errorCodes(result, 1)).toContain(`invalid_date:${field}`);
  });

  it("flags end date before start date", () => {
    const result = validateRows([
      { ...validRow, start_date: "2026-10-31", end_date: "2026-10-01" },
    ]);
    expect(errorCodes(result, 1)).toContain("end_before_start:end_date");
  });

  it("flags FTE out of range", () => {
    const result = validateRows([{ ...validRow, fte: 2.5 }]);
    expect(errorCodes(result, 1)).toContain("fte_out_of_range:fte");
  });

  it("flags invalid FTE", () => {
    const result = validateRows([{ ...validRow, fte: "half" }]);
    expect(errorCodes(result, 1)).toContain("invalid_fte:fte");
  });

  it("flags negative effort", () => {
    const result = validateRows([{ ...validRow, effort_hours: -10 }]);
    expect(errorCodes(result, 1)).toContain("negative_effort:effort_hours");
  });

  it("warns on zero effort", () => {
    const result = validateRows([{ ...validRow, effort_hours: 0 }]);
    expect(result.rows).toHaveLength(1);
    expect(warningCodes(result, 1)).toContain("effort_zero:effort_hours");
  });

  it("parses percentage FTEs", () => {
    const result = validateRows([{ ...validRow, fte: "50%" }]);
    expect(result.rows[0].fte).toBe(0.5);
  });

  it("warns when person fields are missing", () => {
    const result = validateRows([
      {
        project_name: "Apollo",
        phase_name: "Design",
        start_date: "2026-10-01",
        end_date: "2026-10-31",
      },
    ]);
    expect(warningCodes(result, 1)).toContain("person_missing");
  });

  it("warns on duplicate project+phase+person rows", () => {
    const result = validateRows([validRow, validRow]);
    expect(result.warnings.filter((w) => w.code === "duplicate_row")).toHaveLength(2);
  });

  it("keeps optional fields optional", () => {
    const result = validateRows([
      {
        project_name: "Apollo",
        phase_name: "Design",
        start_date: "2026-10-01",
        end_date: "2026-10-31",
      },
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).not.toHaveProperty("fte");
  });

  it("coerces phase_sequence to a number", () => {
    const result = validateRows([
      { ...validRow, phase_sequence: "2" as unknown as number },
    ]);
    expect(result.rows[0].phase_sequence).toBe(2);
  });
});

import { z } from "zod";

// ----------------------------------------------------------------------------
// Canonical row schema + labels for the browser wizard
// ----------------------------------------------------------------------------

export const TimelineImportRowSchema = z.object({
  project_code: z.string().trim().optional(),
  project_name: z.string().trim(),
  phase_name: z.string().trim(),
  phase_sequence: z.coerce.number().int().optional(),
  start_date: z.string().trim(),
  end_date: z.string().trim(),
  effort_hours: z.coerce.number().optional(),
  person_email: z.string().trim().email().optional(),
  person_name: z.string().trim().optional(),
  fte: z.union([z.number(), z.string()]).optional(),
  milestone: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const CANONICAL_FIELDS = [
  "project_code",
  "project_name",
  "phase_name",
  "phase_sequence",
  "start_date",
  "end_date",
  "effort_hours",
  "person_email",
  "person_name",
  "fte",
  "milestone",
  "notes",
] as const;

export const FIELD_LABELS: Record<(typeof CANONICAL_FIELDS)[number], string> = {
  project_code: "Project code",
  project_name: "Project name",
  phase_name: "Phase name",
  phase_sequence: "Phase sequence",
  start_date: "Start date",
  end_date: "End date",
  effort_hours: "Effort (hours)",
  person_email: "Person email",
  person_name: "Person name",
  fte: "FTE",
  milestone: "Milestone",
  notes: "Notes",
};

export interface TimelineImportRow {
  project_code?: string;
  project_name: string;
  phase_name: string;
  phase_sequence?: number;
  start_date: string;
  end_date: string;
  effort_hours?: number;
  person_email?: string;
  person_name?: string;
  fte?: number;
  milestone?: string;
  notes?: string;
}

export interface RowError {
  row: number;
  field?: string;
  code: string;
  message: string;
}

export interface RowWarning {
  row: number;
  field?: string;
  code: string;
  message: string;
}

export interface ValidateRowsResult {
  rows: TimelineImportRow[];
  errors: RowError[];
  warnings: RowWarning[];
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const [y, m, day] = value.split("-").map(Number);
  return (
    d.getUTCFullYear() === y &&
    d.getUTCMonth() + 1 === m &&
    d.getUTCDate() === day
  );
}

export function parseFteCell(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (s === "") return null;
  if (s.endsWith("%")) {
    const n = Number(s.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function trimString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  return undefined;
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// ----------------------------------------------------------------------------
// Main validator
// ----------------------------------------------------------------------------

export function validateRows(rows: unknown[]): ValidateRowsResult {
  const allErrors: RowError[] = [];
  const allWarnings: RowWarning[] = [];
  const validRows: TimelineImportRow[] = [];

  const duplicateMap = new Map<string, number[]>();

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 1;
    const raw = rows[i];

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      allErrors.push({
        row: rowNumber,
        code: "invalid_row",
        message: "Row is not a valid object",
      });
      continue;
    }

    const source = raw as Record<string, unknown>;
    const rowErrors: Omit<RowError, "row">[] = [];
    const rowWarnings: Omit<RowWarning, "row">[] = [];

    // Required fields
    const required: Array<keyof TimelineImportRow> = [
      "project_name",
      "phase_name",
      "start_date",
      "end_date",
    ];
    for (const field of required) {
      const value = source[field];
      if (
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "")
      ) {
        rowErrors.push({
          field,
          code: "missing_required",
          message: `${FIELD_LABELS[field]} is required`,
        });
      }
    }

    // Dates
    const startDate = trimString(source.start_date);
    const endDate = trimString(source.end_date);
    let startValid = false;
    let endValid = false;

    if (startDate !== undefined) {
      if (!isIsoDate(startDate)) {
        rowErrors.push({
          field: "start_date",
          code: "invalid_date",
          message: "Start date is not a valid ISO date (YYYY-MM-DD)",
        });
      } else {
        startValid = true;
      }
    }

    if (endDate !== undefined) {
      if (!isIsoDate(endDate)) {
        rowErrors.push({
          field: "end_date",
          code: "invalid_date",
          message: "End date is not a valid ISO date (YYYY-MM-DD)",
        });
      } else {
        endValid = true;
      }
    }

    if (startValid && endValid && startDate! > endDate!) {
      rowErrors.push({
        field: "end_date",
        code: "end_before_start",
        message: "End date cannot be before start date",
      });
    }

    // FTE
    let fteValue: number | undefined;
    if (source.fte !== undefined && source.fte !== null) {
      const parsedFte = parseFteCell(source.fte);
      if (parsedFte === null) {
        rowErrors.push({
          field: "fte",
          code: "invalid_fte",
          message: "FTE must be a number or percentage (e.g. 0.5, 50%)",
        });
      } else if (parsedFte < 0 || parsedFte > 2) {
        rowErrors.push({
          field: "fte",
          code: "fte_out_of_range",
          message: "FTE must be between 0 and 2",
        });
      } else {
        fteValue = parsedFte;
      }
    }

    // Effort
    const effortValue = parseOptionalNumber(source.effort_hours);
    if (effortValue !== undefined) {
      if (effortValue < 0) {
        rowErrors.push({
          field: "effort_hours",
          code: "negative_effort",
          message: "Effort cannot be negative",
        });
      } else if (effortValue === 0) {
        rowWarnings.push({
          field: "effort_hours",
          code: "effort_zero",
          message: "Effort is 0",
        });
      }
    }

    // Person fields
    const personEmail = trimString(source.person_email);
    const personName = trimString(source.person_name);
    if (!personEmail && !personName) {
      rowWarnings.push({
        code: "person_missing",
        message: "Person email and person name are both missing",
      });
    }

    // Build canonical row from the raw input, coercing types where safe
    const canonical: TimelineImportRow = {
      project_name:
        trimString(source.project_name) ?? String(source.project_name ?? ""),
      phase_name:
        trimString(source.phase_name) ?? String(source.phase_name ?? ""),
      start_date: startDate ?? "",
      end_date: endDate ?? "",
    };

    const projectCode = trimString(source.project_code);
    if (projectCode) canonical.project_code = projectCode;

    const phaseSequence = parseOptionalNumber(source.phase_sequence);
    if (phaseSequence !== undefined) canonical.phase_sequence = phaseSequence;

    if (effortValue !== undefined) canonical.effort_hours = effortValue;

    if (personEmail) canonical.person_email = personEmail;
    if (personName) canonical.person_name = personName;
    if (fteValue !== undefined) canonical.fte = fteValue;

    const milestone = trimString(source.milestone);
    if (milestone) canonical.milestone = milestone;

    const notes = trimString(source.notes);
    if (notes) canonical.notes = notes;

    // If any errors, do not include in valid rows, but still attach all issues
    // for the row-level report in the DB.
    if (rowErrors.length > 0) {
      allErrors.push(...rowErrors.map((e) => ({ row: rowNumber, ...e })));
      allWarnings.push(...rowWarnings.map((w) => ({ row: rowNumber, ...w })));
      continue;
    }

    // Duplicate detection uses valid rows only
    const projectKey = canonical.project_code || canonical.project_name;
    const personKey = canonical.person_email || canonical.person_name || "";
    const duplicateKey = `${projectKey}\x00${canonical.phase_name}\x00${personKey}`;
    const siblings = duplicateMap.get(duplicateKey) ?? [];
    siblings.push(rowNumber);
    duplicateMap.set(duplicateKey, siblings);

    allWarnings.push(...rowWarnings.map((w) => ({ row: rowNumber, ...w })));
    validRows.push(canonical);
  }

  // Emit duplicate warnings for all rows sharing a key
  for (const rowNumbers of duplicateMap.values()) {
    if (rowNumbers.length > 1) {
      for (const row of rowNumbers) {
        allWarnings.push({
          row,
          code: "duplicate_row",
          message: "Duplicate project + phase + person row",
        });
      }
    }
  }

  return { rows: validRows, errors: allErrors, warnings: allWarnings };
}

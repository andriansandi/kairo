import { Hono } from "hono";
import { z } from "zod";
import type { TimelineImportRow } from "@kairo/xls-import";
import { validateRows } from "@kairo/xls-import";
import type { TimelineImport } from "@kairo/types";
import { all, first, newId, nowIso, run, toJson, fromJson } from "../db";
import { badRequest, HTTPException, notFound, parseBody, parseQuery } from "../http";

export const importsRouter = new Hono();

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

const RowStatusQuerySchema = z.object({
  status: z.enum(["valid", "warning", "error"]).optional(),
});

const ConfirmBodySchema = z.object({
  project_mappings: z.array(
    z.object({
      key: z.string(),
      action: z.enum(["link", "create"]),
      project_id: z.string().optional(),
      code: z.string().optional(),
      name: z.string().optional(),
    }),
  ),
  person_mappings: z.array(
    z.object({
      key: z.string(),
      action: z.enum(["link", "create", "skip"]),
      person_id: z.string().optional(),
      name: z.string().optional(),
      email: z.string().optional(),
      role_id: z.string().optional(),
    }),
  ),
});

function sanitizeFilename(name: string): string {
  return name
    .replace(/\\|\//g, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 255) || "upload";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildMappingSummary(rows: unknown[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const key of [
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
  ]) {
    summary[key] = 0;
  }
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    for (const key of Object.keys(summary)) {
      const value = row[key];
      if (value !== undefined && value !== null && value !== "") {
        summary[key]++;
      }
    }
  }
  return summary;
}

function importFromRecord(record: {
  id: string;
  r2_key: string;
  mapping: string;
  row_report: string;
  status: string;
  uploaded_by: string;
  created_at: string;
}): TimelineImport {
  return {
    id: record.id,
    r2_key: record.r2_key,
    mapping: fromJson(record.mapping, {}),
    row_report: fromJson(record.row_report, []),
    status: record.status as TimelineImport["status"],
    uploaded_by: record.uploaded_by,
    created_at: record.created_at,
  };
}

// ----------------------------------------------------------------------------
// POST /api/v1/imports
// ----------------------------------------------------------------------------

importsRouter.post("/", async (c) => {
  const db = c.get("db") as D1Database;
  const env = c.get("env");

  let body: Record<string, unknown>;
  try {
    body = await c.req.parseBody();
  } catch {
    return badRequest("Invalid multipart body");
  }

  const file = body.file;
  const rowsRaw = body.rows;

  if (!(file instanceof File)) {
    return badRequest("file is required");
  }
  if (typeof rowsRaw !== "string") {
    return badRequest("rows must be a JSON string");
  }

  let parsedRows: unknown[];
  try {
    parsedRows = JSON.parse(rowsRaw);
  } catch {
    return badRequest("rows must be valid JSON");
  }
  if (!Array.isArray(parsedRows)) {
    return badRequest("rows must be an array");
  }

  const { rows, errors, warnings } = validateRows(parsedRows);
  const counts = {
    total: parsedRows.length,
    valid: rows.length,
    warning: warnings.length,
    error: errors.length,
  };
  const mapping = buildMappingSummary(parsedRows) as unknown as Record<
    string,
    string
  >;
  const rowReport = { counts, errors, warnings } as unknown as Record<
    string,
    unknown
  >[];

  const importId = newId();
  const safeName = sanitizeFilename(file.name || "upload");
  const r2Key = `imports/${importId}/${safeName}`;

  try {
    await env.IMPORTS.put(r2Key, file);
  } catch (err) {
    const message = err instanceof Error ? err.message : "R2 put failed";
    return c.json(
      {
        error: { code: "internal_error", message },
        counts,
        errors,
        warnings,
      },
      500,
    );
  }

  const ts = nowIso();
  await run(
    db,
    `INSERT INTO timeline_import (id, r2_key, mapping, row_report, status, uploaded_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    importId,
    r2Key,
    toJson(mapping),
    toJson(rowReport),
    "draft",
    "local-dev",
    ts,
    ts,
  );

  const errorsByRow = new Map<number, RowError[]>();
  const warningsByRow = new Map<number, RowWarning[]>();
  for (const e of errors) {
    const list = errorsByRow.get(e.row) ?? [];
    list.push(e);
    errorsByRow.set(e.row, list);
  }
  for (const w of warnings) {
    const list = warningsByRow.get(w.row) ?? [];
    list.push(w);
    warningsByRow.set(w.row, list);
  }

  const rowStatements: D1PreparedStatement[] = [];
  for (let i = 0; i < parsedRows.length; i++) {
    const rowNumber = i + 1;
    const rowErrors = errorsByRow.get(rowNumber) ?? [];
    const rowWarnings = warningsByRow.get(rowNumber) ?? [];
    const status: "valid" | "warning" | "error" = rowErrors.length
      ? "error"
      : rowWarnings.length
        ? "warning"
        : "valid";
    const issues = [...rowErrors, ...rowWarnings];

    rowStatements.push(
      db
        .prepare(
          `INSERT INTO timeline_import_row (id, import_id, row_number, raw, status, issues)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId(),
          importId,
          rowNumber,
          toJson(parsedRows[i]),
          status,
          toJson(issues),
        ),
    );
  }

  if (rowStatements.length > 0) {
    await db.batch(rowStatements);
  }

  const importRecord: TimelineImport = {
    id: importId,
    r2_key: r2Key,
    mapping,
    row_report: rowReport,
    status: "draft",
    uploaded_by: "local-dev",
    created_at: ts,
  };

  return c.json({ import: importRecord, counts, errors, warnings }, 201);
});

// ----------------------------------------------------------------------------
// GET /api/v1/imports
// ----------------------------------------------------------------------------

importsRouter.get("/", async (c) => {
  const db = c.get("db") as D1Database;
  const { limit } = parseQuery(c, ListQuerySchema);

  const records = await all<{
    id: string;
    status: string;
    row_report: string;
    uploaded_by: string;
    created_at: string;
  }>(
    db,
    `SELECT id, status, row_report, uploaded_by, created_at
     FROM timeline_import
     ORDER BY created_at DESC
     LIMIT ?`,
    limit,
  );

  const items = records.map((r) => ({
    id: r.id,
    status: r.status,
    counts:
      fromJson<{ counts?: { total: number; valid: number; warning: number; error: number } }>(
        r.row_report,
        {},
      ).counts ?? { total: 0, valid: 0, warning: 0, error: 0 },
    uploaded_by: r.uploaded_by,
    created_at: r.created_at,
  }));

  return c.json({ items, nextCursor: null });
});

// ----------------------------------------------------------------------------
// GET /api/v1/imports/:id
// ----------------------------------------------------------------------------

importsRouter.get("/:id", async (c) => {
  const db = c.get("db") as D1Database;
  const id = c.req.param("id");
  const { status } = parseQuery(c, RowStatusQuerySchema);

  const record = await first<{
    id: string;
    r2_key: string;
    mapping: string;
    row_report: string;
    status: string;
    uploaded_by: string;
    created_at: string;
  }>(db, "SELECT * FROM timeline_import WHERE id = ?", id);

  if (!record) {
    return notFound("Import not found");
  }

  let sql = "SELECT * FROM timeline_import_row WHERE import_id = ?";
  const params: unknown[] = [id];
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  sql += " ORDER BY row_number";

  const rows = await all(db, sql, ...params);
  return c.json({ import: importFromRecord(record), rows });
});

// ----------------------------------------------------------------------------
// DELETE /api/v1/imports/:id
// ----------------------------------------------------------------------------

importsRouter.delete("/:id", async (c) => {
  const db = c.get("db") as D1Database;
  const env = c.get("env");
  const id = c.req.param("id");

  const record = await first<{ id: string; status: string; r2_key: string }>(
    db,
    "SELECT id, status, r2_key FROM timeline_import WHERE id = ?",
    id,
  );

  if (!record) {
    return notFound("Import not found");
  }
  if (record.status !== "draft") {
    return badRequest("Only draft imports can be deleted");
  }

  await run(db, "DELETE FROM timeline_import WHERE id = ?", id);

  try {
    await env.IMPORTS.delete(record.r2_key);
  } catch {
    // best-effort
  }

  return new Response(null, { status: 204 });
});

// ----------------------------------------------------------------------------
// POST /api/v1/imports/:id/confirm
// ----------------------------------------------------------------------------

type ConfirmBody = z.infer<typeof ConfirmBodySchema>;

interface ValidatedEntry {
  rowNumber: number;
  row: TimelineImportRow;
}

importsRouter.post("/:id/confirm", async (c) => {
  const db = c.get("db") as D1Database;
  const id = c.req.param("id");
  const body = await parseBody(c, ConfirmBodySchema);

  const importRecord = await first<{ id: string; status: string }>(
    db,
    "SELECT id, status FROM timeline_import WHERE id = ?",
    id,
  );
  if (!importRecord) {
    return notFound("Import not found");
  }
  if (importRecord.status !== "draft") {
    return badRequest("Only draft imports can be confirmed");
  }

  const rowRecords = await all<{ row_number: number; raw: string }>(
    db,
    "SELECT row_number, raw FROM timeline_import_row WHERE import_id = ? AND status != 'error' ORDER BY row_number",
    id,
  );

  const entries: ValidatedEntry[] = [];
  for (const record of rowRecords) {
    const parsed = parseRawRow(record.raw);
    if (parsed) {
      entries.push({ rowNumber: record.row_number, row: parsed });
    }
  }

  const ts = nowIso();

  // Projects -----------------------------------------------------------------
  const projectMapping = new Map<string, string>();
  const projectInserts: D1PreparedStatement[] = [];
  const distinctProjects = new Map<string, string>(); // key -> fallback name

  for (const entry of entries) {
    const key = entry.row.project_code || entry.row.project_name;
    distinctProjects.set(key, entry.row.project_name);
  }

  for (const [key, fallbackName] of distinctProjects) {
    const mapping = body.project_mappings.find((m) => m.key === key);
    if (mapping?.action === "link") {
      if (!mapping.project_id) {
        return badRequest(`Project mapping for "${key}" is missing project_id`);
      }
      projectMapping.set(key, mapping.project_id);
    } else {
      const projectId = newId();
      const code = mapping?.code || slugify(mapping?.name || fallbackName);
      const name = mapping?.name || fallbackName;
      projectInserts.push(
        db
          .prepare(
            `INSERT INTO project (id, code, name, status, team_scope, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(projectId, code, name, "draft", "[]", ts, ts),
      );
      projectMapping.set(key, projectId);
    }
  }

  if (projectInserts.length > 0) {
    await db.batch(projectInserts);
  }

  const projectsLinked = body.project_mappings.filter((m) => m.action === "link").length;
  const projectsCreated = distinctProjects.size - projectsLinked;

  // Phases -------------------------------------------------------------------
  interface PhaseGroup {
    projectKey: string;
    phaseName: string;
    sequence?: number;
    startDate: string;
    endDate: string;
    effort: number;
    firstIndex: number;
    phaseId: string;
  }

  const phaseGroups = new Map<string, PhaseGroup>();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const projectKey = entry.row.project_code || entry.row.project_name;
    const groupKey = `${projectKey}\x00${entry.row.phase_name}`;
    let group = phaseGroups.get(groupKey);
    if (!group) {
      group = {
        projectKey,
        phaseName: entry.row.phase_name,
        startDate: entry.row.start_date,
        endDate: entry.row.end_date,
        effort: entry.row.effort_hours ?? 0,
        firstIndex: i,
        phaseId: newId(),
      };
      phaseGroups.set(groupKey, group);
    } else {
      if (entry.row.start_date < group.startDate) group.startDate = entry.row.start_date;
      if (entry.row.end_date > group.endDate) group.endDate = entry.row.end_date;
      group.effort += entry.row.effort_hours ?? 0;
    }

    if (entry.row.phase_sequence !== undefined) {
      if (group.sequence === undefined) {
        group.sequence = entry.row.phase_sequence;
      } else if (group.sequence !== entry.row.phase_sequence) {
        group.sequence = undefined; // mark inconsistent, will fall back to first appearance
      }
    }
  }

  // Resolve final sequence per group. Inconsistent/missing sequences use
  // first-appearance order among groups within the same project.
  const projectFirstOrder = new Map<string, number>();
  const sortedGroups = Array.from(phaseGroups.values()).sort(
    (a, b) => a.firstIndex - b.firstIndex,
  );
  for (const group of sortedGroups) {
    if (group.sequence === undefined) {
      const current = (projectFirstOrder.get(group.projectKey) ?? 0) + 1;
      projectFirstOrder.set(group.projectKey, current);
      group.sequence = current;
    }
  }

  const phaseInserts: D1PreparedStatement[] = [];
  for (const group of phaseGroups.values()) {
    const projectId = projectMapping.get(group.projectKey);
    if (!projectId) continue;
    phaseInserts.push(
      db
        .prepare(
          `INSERT INTO phase (id, project_id, name, sequence, declared_start, declared_end, effort_hours, status, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          group.phaseId,
          projectId,
          group.phaseName,
          group.sequence,
          group.startDate,
          group.endDate,
          group.effort,
          "draft",
          "xls",
          ts,
          ts,
        ),
    );
  }

  if (phaseInserts.length > 0) {
    await db.batch(phaseInserts);
  }

  // People -------------------------------------------------------------------
  const personMapping = new Map<string, ConfirmBody["person_mappings"][number]>();
  for (const m of body.person_mappings) {
    personMapping.set(m.key, m);
  }

  let memberRoleId: string | null = null;
  const resolvedPerson = new Map<string, string>(); // key -> person_id
  const personInserts: D1PreparedStatement[] = [];
  const peopleToCreate = new Map<string, ConfirmBody["person_mappings"][number]>();

  for (const entry of entries) {
    const personKey = entry.row.person_email || entry.row.person_name;
    if (!personKey) continue;

    const mapping = personMapping.get(personKey);
    if (mapping?.action === "skip") continue;

    if (mapping?.action === "link") {
      if (!mapping.person_id) {
        return badRequest(`Person mapping for "${personKey}" is missing person_id`);
      }
      resolvedPerson.set(personKey, mapping.person_id);
    } else {
      peopleToCreate.set(personKey, mapping ?? { key: personKey, action: "create" });
    }
  }

  if (peopleToCreate.size > 0) {
    const memberRole = await first<{ id: string }>(
      db,
      "SELECT id FROM role WHERE name = ?",
      "Member",
    );
    if (memberRole) {
      memberRoleId = memberRole.id;
    } else {
      memberRoleId = newId();
      await run(
        db,
        `INSERT INTO role (id, name, seniority_ladder, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        memberRoleId,
        "Member",
        "[]",
        ts,
        ts,
      );
    }

    for (const [key, mapping] of peopleToCreate) {
      const personId = newId();
      resolvedPerson.set(key, personId);
      const roleId = mapping.role_id || memberRoleId!;
      const name = mapping.name || key;
      const email = mapping.email || (key.includes("@") ? key : `${slugify(key)}@placeholder.local`);
      personInserts.push(
        db
          .prepare(
            `INSERT INTO person (id, name, email, role_id, seniority, active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(personId, name, email, roleId, 2, 1, ts, ts),
      );
    }

    if (personInserts.length > 0) {
      await db.batch(personInserts);
    }
  }

  // Allocations --------------------------------------------------------------
  const allocationInserts: D1PreparedStatement[] = [];
  let allocationsCreated = 0;
  let rowsSkipped = 0;

  for (const entry of entries) {
    const row = entry.row;
    const projectKey = row.project_code || row.project_name;
    const projectId = projectMapping.get(projectKey);
    if (!projectId) {
      rowsSkipped++;
      continue;
    }

    const groupKey = `${projectKey}\x00${row.phase_name}`;
    const phase = phaseGroups.get(groupKey);
    if (!phase) {
      rowsSkipped++;
      continue;
    }

    const personKey = row.person_email || row.person_name;
    if (!personKey) {
      rowsSkipped++;
      continue;
    }

    const mapping = personMapping.get(personKey);
    if (mapping?.action === "skip") {
      rowsSkipped++;
      continue;
    }

    const personId = resolvedPerson.get(personKey);
    if (!personId) {
      rowsSkipped++;
      continue;
    }

    allocationInserts.push(
      db
        .prepare(
          `INSERT INTO allocation (id, person_id, project_id, phase_id, fte, start_date, end_date, status, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId(),
          personId,
          projectId,
          phase.phaseId,
          row.fte ?? 1.0,
          row.start_date,
          row.end_date,
          "proposed",
          "xls",
          ts,
          ts,
        ),
    );
  }

  if (allocationInserts.length > 0) {
    await db.batch(allocationInserts);
    allocationsCreated = allocationInserts.length;
  }

  // Finalize import ----------------------------------------------------------
  await run(
    db,
    "UPDATE timeline_import SET status = ?, updated_at = ? WHERE id = ?",
    "confirmed",
    ts,
    id,
  );

  return c.json({
    projects_linked: projectsLinked,
    projects_created: Math.max(0, projectsCreated),
    phases_created: phaseGroups.size,
    allocations_created: allocationsCreated,
    rows_skipped: rowsSkipped,
  });
});

function parseRawRow(raw: string): TimelineImportRow | null {
  const value = fromJson<unknown>(raw, null);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.project_name !== "string" ||
    typeof row.phase_name !== "string" ||
    typeof row.start_date !== "string" ||
    typeof row.end_date !== "string"
  ) {
    return null;
  }
  return row as unknown as TimelineImportRow;
}

type RowError = {
  row: number;
  field?: string;
  code: string;
  message: string;
};

type RowWarning = {
  row: number;
  field?: string;
  code: string;
  message: string;
};

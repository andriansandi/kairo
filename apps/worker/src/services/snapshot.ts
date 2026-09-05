import { all, first } from "../db";

export const SNAPSHOT_SOURCE_TABLES = [
  "project",
  "work_item",
  "phase",
  "dependency",
  "person",
  "team",
  "team_membership",
  "role",
  "skill",
  "person_skill",
  "allocation",
  "pto_entry",
  "org_calendar",
  "jr_skill_requirement",
  "timeline_import",
  "scenario_def",
] as const;

export async function resolveTimestampColumn(
  db: D1Database,
  table: string,
): Promise<string | null> {
  type ColumnInfo = { name: string };
  const columns = await all<ColumnInfo>(
    db,
    `PRAGMA table_info(${table})`,
  );
  const names = new Set(columns.map((c) => c.name));
  if (names.has("updated_at")) return "updated_at";
  if (names.has("created_at")) return "created_at";
  return null;
}

type FingerprintRow = [string, string];

export async function computeInputsFingerprint(db: D1Database): Promise<{
  fingerprint: string;
  counts: Record<string, number>;
}> {
  const rowsByTable: Record<string, FingerprintRow[]> = {};
  const counts: Record<string, number> = {};

  for (const table of SNAPSHOT_SOURCE_TABLES) {
    const tsCol = await resolveTimestampColumn(db, table);
    const tsSql = tsCol ? `COALESCE(${tsCol}, '')` : "''";
    const rows = await all<{ id: string; ts: string | null }>(
      db,
      `SELECT id, ${tsSql} AS ts FROM ${table} ORDER BY id`,
    );
    counts[table] = rows.length;
    rowsByTable[table] = rows.map((r) => [r.id, r.ts ?? ""]);
  }

  const fingerprint = await fingerprintFromRows(rowsByTable);
  return { fingerprint, counts };
}

export async function fingerprintFromRows(
  rowsByTable: Record<string, FingerprintRow[]>,
): Promise<string> {
  const encoder = new TextEncoder();
  const canonical = canonicalInputsString(rowsByTable);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(canonical),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function canonicalInputsString(
  rowsByTable: Record<string, FingerprintRow[]>,
): string {
  const ordered: Record<string, FingerprintRow[]> = {};
  for (const key of Object.keys(rowsByTable).sort()) {
    ordered[key] = rowsByTable[key]!;
  }
  return JSON.stringify(ordered);
}

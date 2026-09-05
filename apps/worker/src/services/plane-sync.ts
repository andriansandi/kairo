import type { Env } from "../env";
import {
  PlaneClient,
  type PlaneIssue,
  type PlaneMember,
  type PlaneProject,
} from "@kairo/plane-client";
import { all, first, newId, nowIso, run, toJson } from "../db";
import type { Project, SyncRun, WorkItem } from "@kairo/types";

export type SyncType = "full" | "incremental";

export interface PlaneSyncStats {
  projects: number;
  issues: number;
  members: number;
  members_matched: number;
  members_unmatched: number;
  work_items_created: number;
  work_items_updated: number;
  errors: number;
}

export interface PlaneSyncEnv extends Env {
  PLANE_API_KEY?: string;
  PLANE_BASE_URL?: string;
  PLANE_WORKSPACE_SLUG?: string;
}

const DEFAULT_ESTIMATE_HOURS: Record<string, number> = {
  XS: 2,
  S: 4,
  M: 8,
  L: 16,
  XL: 32,
};

function createClient(env: PlaneSyncEnv): PlaneClient | null {
  if (!env.PLANE_API_KEY || !env.PLANE_WORKSPACE_SLUG) return null;
  return new PlaneClient({
    baseUrl: env.PLANE_BASE_URL,
    apiKey: env.PLANE_API_KEY,
    workspaceSlug: env.PLANE_WORKSPACE_SLUG,
  });
}

function priorityValue(priority: string | null): number | null {
  switch ((priority ?? "").toLowerCase()) {
    case "urgent":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return null;
  }
}

function mapPlaneIssueState(stateGroup: string | null): WorkItem["status"] {
  switch ((stateGroup ?? "").toLowerCase()) {
    case "backlog":
      return "backlog";
    case "unstarted":
      return "todo";
    case "started":
      return "in_progress";
    case "completed":
      return "done";
    case "cancelled":
      return "cancelled";
    default:
      return "todo";
  }
}

function stableCode(project: PlaneProject): string {
  const candidate = project.identifier || project.name || project.id;
  const slug = candidate
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug || project.id.slice(0, 8);
}

function estimateRaw(issue: PlaneIssue): string | null {
  const raw = issue.point ?? issue.estimatePoint;
  if (raw == null) return null;
  return String(raw);
}

function normalizeEstimateHours(raw: string | null): number | null {
  if (raw === null) return null;
  const key = raw.toUpperCase().trim();
  const hours = DEFAULT_ESTIMATE_HOURS[key];
  return hours ?? null;
}

async function upsertProject(
  db: D1Database,
  planeProject: PlaneProject,
): Promise<{ created: boolean; id: string }> {
  const isoNow = nowIso();
  const existing = await first<Pick<Project, "id" | "code" | "status">>(
    db,
    "SELECT id, code, status FROM project WHERE plane_id = ?",
    planeProject.id,
  );

  const desiredStatus: Project["status"] = planeProject.archivedAt
    ? "completed"
    : existing?.status ?? "draft";

  if (existing) {
    const deadline = planeProject.targetDate;
    const start = planeProject.startDate;
    const end = planeProject.targetDate;
    await run(
      db,
      `UPDATE project
       SET name = ?, status = ?, deadline = ?, declared_start = ?, declared_end = ?, updated_at = ?
       WHERE id = ?`,
      planeProject.name,
      desiredStatus,
      deadline,
      start,
      end,
      isoNow,
      existing.id,
    );
    return { created: false, id: existing.id };
  }

  const id = newId();
  await run(
    db,
    `INSERT INTO project (id, plane_id, code, name, status, priority, deadline, declared_start, declared_end, team_scope, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    planeProject.id,
    stableCode(planeProject),
    planeProject.name,
    desiredStatus,
    null,
    planeProject.targetDate,
    planeProject.startDate,
    planeProject.targetDate,
    toJson([]),
    isoNow,
    isoNow,
  );
  return { created: true, id };
}

async function upsertWorkItem(
  db: D1Database,
  projectId: string,
  issue: PlaneIssue,
  labelMap: Record<string, string>,
  cycleMap: Record<string, string>,
): Promise<{ created: boolean; issueId: string }> {
  const isoNow = nowIso();
  const existing = await first<{ id: string }>(
    db,
    "SELECT id FROM work_item WHERE project_id = ? AND plane_id = ?",
    projectId,
    issue.id,
  );

  const raw = estimateRaw(issue);
  const cycle = issue.cycleId ? cycleMap[issue.cycleId] ?? null : null;
  const labels = issue.labelIds.map((id) => labelMap[id] ?? id);

  if (existing) {
    await run(
      db,
      `UPDATE work_item
       SET title = ?, status = ?, priority = ?, assignee_ids = ?, start_date = ?, due_date = ?,
           estimate_raw = ?, estimate_normalized_hours = ?, cycle = ?, labels = ?, updated_at = ?
       WHERE id = ?`,
      issue.name,
      mapPlaneIssueState(issue.stateGroup),
      priorityValue(issue.priority),
      toJson(issue.assigneeIds),
      issue.startDate,
      issue.targetDate,
      raw,
      normalizeEstimateHours(raw),
      cycle,
      toJson(labels),
      isoNow,
      existing.id,
    );
    return { created: false, issueId: existing.id };
  }

  const id = newId();
  await run(
    db,
    `INSERT INTO work_item
       (id, project_id, plane_id, title, status, priority, assignee_ids, start_date, due_date,
        estimate_raw, estimate_normalized_hours, cycle, labels, updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    projectId,
    issue.id,
    issue.name,
    mapPlaneIssueState(issue.stateGroup),
    priorityValue(issue.priority),
    toJson(issue.assigneeIds),
    issue.startDate,
    issue.targetDate,
    raw,
    normalizeEstimateHours(raw),
    cycle,
    toJson(labels),
    isoNow,
    isoNow,
  );
  return { created: true, issueId: id };
}

async function loadPersonEmailMap(
  db: D1Database,
): Promise<Map<string, string>> {
  const rows = await all<{ id: string; email: string }>(
    db,
    "SELECT id, email FROM person",
  );
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.email.toLowerCase(), row.id);
  }
  return map;
}

async function upsertMembers(
  db: D1Database,
  members: PlaneMember[],
): Promise<{ matched: number; unmatched: number }> {
  const isoNow = nowIso();
  const personByEmail = await loadPersonEmailMap(db);
  let matched = 0;
  let unmatched = 0;

  for (const member of members) {
    const personId = member.email
      ? personByEmail.get(member.email.toLowerCase()) ?? null
      : null;
    if (personId) {
      matched++;
    } else {
      unmatched++;
    }

    const name = [member.firstName, member.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || member.displayName || "Unnamed";

    await run(
      db,
      `INSERT INTO plane_member (id, name, email, person_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         email = excluded.email,
         person_id = excluded.person_id,
         updated_at = excluded.updated_at`,
      member.id,
      name,
      member.email,
      personId,
      isoNow,
      isoNow,
    );
  }

  return { matched, unmatched };
}

export async function runPlaneSync(
  env: PlaneSyncEnv,
  type: SyncType,
): Promise<SyncRun> {
  const db = env.DB;
  const runId = newId();
  const isoNow = nowIso();

  await run(
    db,
    `INSERT INTO sync_run (id, source, type, status, stats, errors, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    runId,
    "plane",
    type,
    "running",
    toJson({}),
    toJson([]),
    isoNow,
  );

  const client = createClient(env);
  if (!client) {
    await finishRun(db, runId, "failed", { errors: 1 } as PlaneSyncStats, [
      { message: "Plane API credentials not configured" },
    ]);
    const failed = await loadRun(db, runId);
    if (!failed) throw new Error("sync run disappeared");
    return failed;
  }

  const errors: Array<{ message: string; projectId?: string; issueId?: string }> = [];
  const stats: PlaneSyncStats = {
    projects: 0,
    issues: 0,
    members: 0,
    members_matched: 0,
    members_unmatched: 0,
    work_items_created: 0,
    work_items_updated: 0,
    errors: 0,
  };

  let finalStatus: SyncRun["status"] = "success";

  try {
    const projects = await client.listProjects();
    stats.projects = projects.length;

    let members: PlaneMember[] = [];
    try {
      members = await client.listMembers();
      stats.members = members.length;
      const { matched, unmatched } = await upsertMembers(db, members);
      stats.members_matched = matched;
      stats.members_unmatched = unmatched;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ message: `Members sync failed: ${message}` });
    }

    for (const planeProject of projects) {
      try {
        const { created: projectCreated, id: projectId } = await upsertProject(
          db,
          planeProject,
        );
        if (projectCreated) {
          // Project creation is not separately counted; only work items are.
        }

        const [issues, labelMap, cycleMap] = await Promise.all([
          client.listIssues(planeProject.id),
          client.listLabels(planeProject.id),
          client.listCycles(planeProject.id),
        ]);

        for (const issue of issues) {
          try {
            const { created } = await upsertWorkItem(
              db,
              projectId,
              issue,
              labelMap,
              cycleMap,
            );
            if (created) {
              stats.work_items_created++;
            } else {
              stats.work_items_updated++;
            }
            stats.issues++;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push({
              message: `Issue ${issue.id} failed: ${message}`,
              projectId: planeProject.id,
              issueId: issue.id,
            });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          message: `Project ${planeProject.id} failed: ${message}`,
          projectId: planeProject.id,
        });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push({ message: `Sync aborted: ${message}` });
  }

  stats.errors = errors.length;
  if (errors.length > 0) {
    finalStatus = stats.projects > 0 || stats.members > 0 ? "partial" : "failed";
  }

  await finishRun(db, runId, finalStatus, stats, errors);

  const syncRun = await loadRun(db, runId);
  if (!syncRun) throw new Error("sync run disappeared");
  return syncRun;
}

async function finishRun(
  db: D1Database,
  runId: string,
  status: SyncRun["status"],
  stats: PlaneSyncStats,
  errors: unknown[],
): Promise<void> {
  await run(
    db,
    `UPDATE sync_run
     SET status = ?, stats = ?, errors = ?, finished_at = ?
     WHERE id = ?`,
    status,
    toJson(stats),
    toJson(errors.slice(0, 50)),
    nowIso(),
    runId,
  );
}

async function loadRun(db: D1Database, runId: string): Promise<SyncRun | null> {
  const row = await first<SyncRun>(db, "SELECT * FROM sync_run WHERE id = ?", runId);
  if (!row) return null;
  return {
    ...row,
    stats:
      typeof row.stats === "string"
        ? (JSON.parse(row.stats) as Record<string, unknown>)
        : row.stats,
    errors:
      typeof row.errors === "string"
        ? (JSON.parse(row.errors) as unknown[])
        : row.errors,
  };
}

import { Hono } from "hono";
import { z } from "zod";
import type { Analysis, AnalysisSubject, FactPack } from "@kairo/types";
import {
  buildFactPack,
  callModel,
  computeAllowedNumbers,
  deterministicFallback,
  extractJsonFromContent,
  NotConfiguredError,
  toAnalysisMessages,
  validateAnalysisOutput,
} from "@kairo/ai";
import { all, first, newId, nowIso, run } from "../db";
import { badRequest, notFound, parseBody, parseQuery } from "../http";
import { ensureCurrentSnapshot } from "../services/snapshot";

const CreateAnalysisSchema = z.object({
  kind: z.enum(["explain", "recommend", "compare", "qa"]),
  subject_type: z.string(),
  subject_id: z.string(),
});

const ListAnalysisQuerySchema = z.object({
  subject_type: z.string().optional(),
  subject_id: z.string().optional(),
});

interface AiConfigRow {
  value: string;
}

function fromJson<T>(value: string | unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function loadAiConfig(db: D1Database): Promise<{
  gateway_url?: string;
  provider?: string;
  model?: string;
  api_key?: string;
}> {
  const row = await first<AiConfigRow>(
    db,
    "SELECT value FROM app_setting WHERE key = ?",
    "ai_config",
  );
  if (!row) return {};
  return fromJson(row.value, {});
}

async function buildSnapshotFactPack(
  db: D1Database,
  snapshotId: string,
  subject: AnalysisSubject,
): Promise<FactPack> {
  const projectRows = await all<Record<string, unknown>>(
    db,
    "SELECT * FROM project",
  );
  const personRows = await all<Record<string, unknown>>(db, "SELECT * FROM person");
  const conflictRows = await all<Record<string, unknown>>(
    db,
    "SELECT * FROM conflict WHERE snapshot_id = ?",
    snapshotId,
  );
  const feasibilityRows = await all<Record<string, unknown>>(
    db,
    "SELECT * FROM feasibility_result WHERE snapshot_id = ?",
    snapshotId,
  );

  const capacityRows = await all<Record<string, unknown>>(
    db,
    "SELECT * FROM capacity_entry WHERE snapshot_id = ?",
    snapshotId,
  );
  const teamRows = await all<Record<string, unknown>>(db, "SELECT * FROM team");
  const membershipRows = await all<Record<string, unknown>>(
    db,
    "SELECT * FROM team_membership",
  );

  const skillRows = await all<Record<string, unknown>>(db, "SELECT * FROM skill");
  const personSkillRows = await all<Record<string, unknown>>(
    db,
    "SELECT * FROM person_skill",
  );

  const projects = projectRows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    deadline: (r.deadline as string | null) ?? null,
    declared_start: (r.declared_start as string | null) ?? null,
    declared_end: (r.declared_end as string | null) ?? null,
  }));

  const people = personRows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
  }));

  const conflicts = conflictRows.map((r) => ({
    id: r.id as string,
    rule: r.rule as "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8" | "C9" | "C10",
    severity: r.severity as "healthy" | "warning" | "at_risk" | "critical",
    person_id: (r.person_id as string | null) ?? null,
    project_id: (r.project_id as string | null) ?? null,
    team_id: (r.team_id as string | null) ?? null,
    phase_id: (r.phase_id as string | null) ?? null,
    window_start: r.window_start as string,
    window_end: r.window_end as string,
    explanation: String(r.explanation ?? ""),
    metrics: fromJson<Record<string, number>>(r.metrics, {}),
  }));

  const feasibility = feasibilityRows.map((r) => ({
    project_id: r.project_id as string,
    verdict: r.verdict as "healthy" | "warning" | "at_risk" | "critical",
    computed_finish: r.computed_finish as string,
    slack_days: Number(r.slack_days ?? 0),
    buffer_days: Number(r.buffer_days ?? 0),
    computed_start: (r.computed_start as string | undefined) ?? undefined,
    drivers: fromJson<string[]>(r.drivers, []),
  }));

  // Build team-weeks on the fly from capacity entries.
  const capacityEntries = capacityRows.map((r) => ({
    week_key: r.week_key as string,
    person_id: r.person_id as string,
    available_h: Number(r.available_h ?? 0),
    planned_h: Number(r.planned_h ?? 0),
    utilization: Number(r.utilization ?? 0),
  }));

  const teams = teamRows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    type: r.type as "builder" | "devops" | "other",
  }));

  const memberships = membershipRows.map((r) => ({
    person_id: r.person_id as string,
    team_id: r.team_id as string,
  }));

  const teamMembers = new Map<string, Set<string>>();
  for (const m of memberships) {
    const set = teamMembers.get(m.team_id) ?? new Set<string>();
    set.add(m.person_id);
    teamMembers.set(m.team_id, set);
  }

  const groups = new Map<
    string,
    { team_id: string; week_key: string; available_h: number; planned_h: number }
  >();
  for (const entry of capacityEntries) {
    for (const [teamId, members] of teamMembers) {
      if (!members.has(entry.person_id)) continue;
      const key = `${teamId}|${entry.week_key}`;
      const acc = groups.get(key) ?? {
        team_id: teamId,
        week_key: entry.week_key,
        available_h: 0,
        planned_h: 0,
      };
      acc.available_h += entry.available_h;
      acc.planned_h += entry.planned_h;
      groups.set(key, acc);
    }
  }

  const teamWeeks = Array.from(groups.values())
    .map((g) => ({
      team_id: g.team_id,
      week_key: g.week_key,
      utilization: g.available_h > 0 ? g.planned_h / g.available_h : 0,
      available_h: Math.round(g.available_h * 100) / 100,
      planned_h: Math.round(g.planned_h * 100) / 100,
    }))
    .sort(
      (a, b) =>
        a.team_id.localeCompare(b.team_id) || a.week_key.localeCompare(b.week_key),
    );

  // Skill coverage: reuse matching-engine free-hours heuristic.
  const personFree = new Map<string, number>();
  for (const entry of capacityEntries) {
    const slack = Math.max(0, entry.available_h - entry.planned_h);
    personFree.set(entry.person_id, (personFree.get(entry.person_id) ?? 0) + slack);
  }

  const bySkill = new Map<
    string,
    { people: Set<string>; high: Set<string> }
  >();
  for (const skill of skillRows) {
    bySkill.set(skill.id as string, { people: new Set(), high: new Set() });
  }
  for (const ps of personSkillRows) {
    const bucket = bySkill.get(ps.skill_id as string);
    if (!bucket) continue;
    bucket.people.add(ps.person_id as string);
    if (Number(ps.level) >= 3) bucket.high.add(ps.person_id as string);
  }

  const skillCoverage = skillRows.map((skill) => {
    const bucket = bySkill.get(skill.id as string) ?? {
      people: new Set<string>(),
      high: new Set<string>(),
    };
    const freeHours = Array.from(bucket.people).reduce(
      (sum, personId) => sum + (personFree.get(personId) ?? 0),
      0,
    );
    return {
      skill_id: skill.id as string,
      skill_name: skill.name as string,
      total_people: bucket.people.size,
      free_hours: Math.round(freeHours * 100) / 100,
      spof: bucket.high.size === 1,
    };
  });

  return buildFactPack({
    snapshotId,
    generatedAt: nowIso(),
    subject,
    data: {
      projects,
      people,
      conflicts,
      feasibility,
      teamWeeks,
      skillCoverage,
    },
  });
}

async function runAi(
  db: D1Database,
  factPack: FactPack,
  kind: string,
  subject: AnalysisSubject,
): Promise<{
  mode: "ai" | "deterministic";
  summary: string;
  details?: string[];
  provider: string;
  model: string;
  output: unknown;
  validation_result: { valid: boolean; errors: string[] };
  cited_fact_ids: string[];
}> {
  const aiConfig = await loadAiConfig(db);
  const provider = aiConfig.provider ?? "none";
  const model = aiConfig.model ?? "";

  if (!configured(aiConfig)) {
    const fallback = deterministicFallback(factPack, kind);
    return {
      mode: "deterministic",
      summary: fallback.summary,
      details: fallback.details,
      provider: "none",
      model: "",
      output: { mode: "deterministic", summary: fallback.summary, details: fallback.details },
      validation_result: { valid: true, errors: [] },
      cited_fact_ids: fallback.cited_fact_ids,
    };
  }

  const messages = toAnalysisMessages(factPack, kind, subject);
  const allowedNumbers = computeAllowedNumbers(factPack);

  let lastValidation: { valid: boolean; errors: string[] } | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    const promptMessages =
      attempt > 0 && lastValidation
        ? [
            ...messages,
            {
              role: "user" as const,
              content: `Validation errors: ${lastValidation.errors.join("; ")}. Fix the response and try again.`,
            },
          ]
        : messages;

    try {
      const content = await callModel(aiConfig, promptMessages);
      const parsed = extractJsonFromContent(content);
      const validation = validateAnalysisOutput(
        parsed ?? {},
        factPack,
        allowedNumbers,
      );
      lastValidation = validation;
      if (validation.valid && parsed) {
        const output = parsed as { summary: string; claims?: { text: string; fact_ids: string[] }[] };
        const cited = (output.claims ?? []).flatMap((c) => c.fact_ids);
        return {
          mode: "ai",
          summary: output.summary,
          details: output.claims?.map((c) => c.text) ?? [],
          provider,
          model,
          output: { mode: "ai", summary: output.summary, details: output.claims?.map((c) => c.text) },
          validation_result: validation,
          cited_fact_ids: [...new Set(cited)],
        };
      }
    } catch (err) {
      if (err instanceof NotConfiguredError) break;
      lastValidation = {
        valid: false,
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
  }

  const fallback = deterministicFallback(factPack, kind);
  return {
    mode: "deterministic",
    summary: fallback.summary,
    details: fallback.details,
    provider,
    model,
    output: {
      mode: "deterministic",
      summary: fallback.summary,
      details: fallback.details,
      retry_errors: lastValidation?.errors,
    },
    validation_result: lastValidation ?? { valid: false, errors: [] },
    cited_fact_ids: fallback.cited_fact_ids,
  };
}

function configured(ai: { gateway_url?: string; provider?: string; model?: string }): boolean {
  return Boolean(
    ai.gateway_url &&
      ai.gateway_url.startsWith("http") &&
      ai.provider &&
      ai.provider.length > 0 &&
      ai.model &&
      ai.model.length > 0,
  );
}

function mapAnalysisRow(row: Record<string, unknown>): Analysis {
  return {
    id: row.id as string,
    snapshot_id: row.snapshot_id as string,
    kind: row.kind as Analysis["kind"],
    subject: {
      type: row.subject_type as string,
      id: row.subject_id as string,
    },
    prompt_digest: row.prompt_digest as string,
    provider: row.provider as string,
    model: row.model as string,
    output: fromJson(row.output as string, {}),
    validation_result: fromJson(row.validation_result as string, { valid: true, errors: [] }),
    cited_fact_ids: fromJson<string[]>(row.cited_fact_ids as string, []),
    superseded: Boolean(row.superseded),
    created_at: row.created_at as string,
  };
}

export const analysesRouter = new Hono();

analysesRouter.post("/", async (c) => {
  const db = c.get("db") as D1Database;
  const body = (await parseBody(c, CreateAnalysisSchema)) as z.infer<
    typeof CreateAnalysisSchema
  >;

  const { snapshot } = await ensureCurrentSnapshot(db);
  const subject: AnalysisSubject = {
    type: body.subject_type,
    id: body.subject_id,
  };

  // Optional: verify subject exists in the fact pack by attempting to build it.
  const factPack = await buildSnapshotFactPack(db, snapshot.id, subject);

  if (factPack.facts.length === 0) {
    badRequest("Subject not found or has no matching facts");
  }

  const aiResult = await runAi(db, factPack, body.kind, subject);

  const id = newId();
  const now = nowIso();
  const promptDigest = "";

  await run(
    db,
    `INSERT INTO analysis
      (id, snapshot_id, kind, subject_type, subject_id, prompt_digest, provider, model, output, validation_result, cited_fact_ids, superseded, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    snapshot.id,
    body.kind,
    subject.type,
    subject.id,
    promptDigest,
    aiResult.provider,
    aiResult.model,
    JSON.stringify(aiResult.output),
    JSON.stringify(aiResult.validation_result),
    JSON.stringify(aiResult.cited_fact_ids),
    0,
    now,
  );

  const row = await first<Record<string, unknown>>(db, "SELECT * FROM analysis WHERE id = ?", id);

  return c.json({ analysis: mapAnalysisRow(row!) });
});

analysesRouter.get("/", async (c) => {
  const db = c.get("db") as D1Database;
  const query = parseQuery(c, ListAnalysisQuerySchema as any) as {
    subject_type?: string;
    subject_id?: string;
  };

  const params: unknown[] = [];
  const where: string[] = [];

  if (query.subject_type) {
    where.push("subject_type = ?");
    params.push(query.subject_type);
  }
  if (query.subject_id) {
    where.push("subject_id = ?");
    params.push(query.subject_id);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM analysis ${whereClause} ORDER BY created_at DESC LIMIT ?`,
    ...params,
    20,
  );

  return c.json({ items: rows.map(mapAnalysisRow) });
});

analysesRouter.get("/:id", async (c) => {
  const db = c.get("db") as D1Database;
  const id = c.req.param("id");

  const row = await first<Record<string, unknown>>(db, "SELECT * FROM analysis WHERE id = ?", id);
  if (!row) notFound("Analysis not found");

  return c.json({ analysis: mapAnalysisRow(row) });
});

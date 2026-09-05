import { Hono } from "hono";
import { z } from "zod";
import type { AnalysisSubject, FactPack } from "@kairo/types";
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
import { all, first, nowIso } from "../db";
import { parseBody } from "../http";
import { ensureCurrentSnapshot } from "../services/snapshot";

const AskSchema = z.object({
  question: z.string().min(1).max(2000),
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

function configured(ai: {
  gateway_url?: string;
  provider?: string;
  model?: string;
}): boolean {
  return Boolean(
    ai.gateway_url &&
      ai.gateway_url.startsWith("http") &&
      ai.provider &&
      ai.provider.length > 0 &&
      ai.model &&
      ai.model.length > 0,
  );
}

async function buildGlobalFactPack(db: D1Database, snapshotId: string): Promise<FactPack> {
  // Reuse the same fact-gathering logic as analyses but without subject filtering.
  const projectRows = await all<Record<string, unknown>>(db, "SELECT * FROM project");
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
    rule: r.rule as
      | "C1"
      | "C2"
      | "C3"
      | "C4"
      | "C5"
      | "C6"
      | "C7"
      | "C8"
      | "C9"
      | "C10",
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
    data: { projects, people, conflicts, feasibility, teamWeeks, skillCoverage },
  });
}

type IntentAnswer = {
  answer: string;
  mode: "deterministic";
  sources: string[];
};

function resolvePersonName(
  personId: string | null,
  people: { id: string; name: string }[],
): string {
  if (!personId) return "someone";
  return people.find((p) => p.id === personId)?.name ?? personId;
}

function routeIntent(
  question: string,
  factPack: FactPack,
  teamNames: Map<string, string>,
): IntentAnswer | null {
  const lower = question.toLowerCase();
  const payload = (f: { payload: Record<string, unknown> }) => f.payload;
  const projects = factPack.facts
    .filter((f) => f.type === "project")
    .map(payload);
  const people = factPack.facts
    .filter((f) => f.type === "person")
    .map(payload) as { id: string; name: string }[];

  if (/overloaded|over-allocated|over allocated|who is overloaded/.test(lower)) {
    const conflicts = factPack.facts.filter((f) => f.type === "conflict");
    const c1c2 = conflicts.filter(
      (f) => payload(f).rule === "C1" || payload(f).rule === "C2",
    );
    if (c1c2.length === 0) {
      return {
        answer:
          "I don't see any overloaded people in the current snapshot (no C1/C2 conflicts).",
        mode: "deterministic",
        sources: [],
      };
    }
    const lines = c1c2.map((f) => {
      const p = payload(f);
      return `${resolvePersonName(p.person_id as string | null, people)} — ${p.explanation}`;
    });
    const answer = `Overloaded people (${c1c2.length}):\n${lines.join("\n")}`;
    return {
      answer,
      mode: "deterministic",
      sources: c1c2.map((f) => f.id),
    };
  }

  if (/at risk|risky project/.test(lower)) {
    const risks = factPack.facts
      .filter((f) => f.type === "feasibility")
      .filter(
        (f) =>
          payload(f).verdict === "at_risk" || payload(f).verdict === "critical",
      );
    if (risks.length === 0) {
      return {
        answer:
          "No projects are flagged at-risk or critical in the current snapshot.",
        mode: "deterministic",
        sources: [],
      };
    }
    const lines = risks.map((f) => {
      const p = payload(f);
      const projectName =
        projects.find((pr) => pr.id === p.project_id)?.name ?? p.project_id;
      return `${projectName}: ${p.verdict}, computed finish ${p.computed_finish}, slack ${p.slack_days} days`;
    });
    return {
      answer: `At-risk projects (${risks.length}):\n${lines.join("\n")}`,
      mode: "deterministic",
      sources: risks.map((f) => f.id),
    };
  }

  if (/devops/.test(lower)) {
    const devopsWeeks = factPack.facts
      .filter((f) => f.type === "team_week")
      .filter((f) => payload(f).team_id?.toString().toLowerCase().includes("devops"));
    if (devopsWeeks.length === 0) {
      return {
        answer: "No DevOps team weeks are in the current snapshot.",
        mode: "deterministic",
        sources: [],
      };
    }
    const avgUtil =
      devopsWeeks.reduce((sum, f) => sum + Number(payload(f).utilization), 0) /
      devopsWeeks.length;
    const highWeek = devopsWeeks.reduce((max, f) =>
      Number(payload(f).utilization) > Number(payload(max).utilization) ? f : max,
    );
    return {
      answer: `DevOps average utilization is ${(avgUtil * 100).toFixed(0)}% across ${devopsWeeks.length} week(s); peak is ${(Number(payload(highWeek).utilization) * 100).toFixed(0)}% in ${payload(highWeek).week_key}.`,
      mode: "deterministic",
      sources: [highWeek.id, ...devopsWeeks.slice(0, 3).map((f) => f.id)],
    };
  }

  if (/skill gap|spof|single point of failure/.test(lower)) {
    const spofFacts = factPack.facts
      .filter((f) => f.type === "skill_coverage")
      .filter((f) => payload(f).spof);
    if (spofFacts.length === 0) {
      return {
        answer: "No skill coverage single points of failure (SPOF) detected.",
        mode: "deterministic",
        sources: [],
      };
    }
    const lines = spofFacts.map(
      (f) =>
        `${payload(f).skill_name}: only ${payload(f).total_people} person(s), ${payload(f).free_hours} free hours`,
    );
    return {
      answer: `Skills with SPOF (${spofFacts.length}):\n${lines.join("\n")}`,
      mode: "deterministic",
      sources: spofFacts.map((f) => f.id),
    };
  }

  if (/capacity|team weeks|team utilization/.test(lower)) {
    const teamWeekFacts = factPack.facts.filter((f) => f.type === "team_week");
    if (teamWeekFacts.length === 0) {
      return {
        answer: "No team-week capacity facts in the current snapshot.",
        mode: "deterministic",
        sources: [],
      };
    }
    const byTeam = new Map<string, typeof teamWeekFacts>();
    for (const f of teamWeekFacts) {
      const key = payload(f).team_id as string;
      const list = byTeam.get(key) ?? [];
      list.push(f);
      byTeam.set(key, list);
    }
    const lines: string[] = [];
    for (const [teamId, weeks] of byTeam) {
      const teamName = teamNames.get(teamId) ?? teamId;
      const peak = weeks.reduce((max, f) =>
        Number(payload(f).utilization) > Number(payload(max).utilization) ? f : max,
      );
      lines.push(
        `${teamName}: peak utilization ${(Number(payload(peak).utilization) * 100).toFixed(0)}% in ${payload(peak).week_key}`,
      );
    }
    return {
      answer: `Team capacity summary:\n${lines.join("\n")}`,
      mode: "deterministic",
      sources: teamWeekFacts.map((f) => f.id),
    };
  }

  return null;
}

async function aiAnswer(
  db: D1Database,
  question: string,
  factPack: FactPack,
): Promise<{ answer: string; mode: "ai" | "deterministic" | "unavailable"; sources: string[] }> {
  const aiConfig = await loadAiConfig(db);
  if (!configured(aiConfig)) {
    return {
      answer:
        "No AI model is configured. I can currently answer deterministic questions about overload, at-risk projects, DevOps utilization, skill SPOFs, and team capacity.",
      mode: "unavailable",
      sources: [],
    };
  }

  const subject: AnalysisSubject = { type: "qa", id: "ask" };
  const messages = [
    { role: "system", content: toAnalysisMessages(factPack, "qa", subject)[0].content },
    {
      role: "user",
      content: `Question: ${question}\nProduce a JSON response with summary and claims; each claim cites fact ids.`,
    },
  ];

  const allowedNumbers = computeAllowedNumbers(factPack);

  try {
    const content = await callModel(aiConfig, messages);
    const parsed = extractJsonFromContent(content);
    const validation = validateAnalysisOutput(parsed ?? {}, factPack, allowedNumbers);
    if (validation.valid && parsed) {
      const output = parsed as { summary: string; claims?: { text: string; fact_ids: string[] }[] };
      const sources = [...new Set((output.claims ?? []).flatMap((c) => c.fact_ids))];
      return { answer: output.summary, mode: "ai", sources };
    }
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return {
        answer:
          "No AI model is configured. I can currently answer deterministic questions about overload, at-risk projects, DevOps utilization, skill SPOFs, and team capacity.",
        mode: "unavailable",
        sources: [],
      };
    }
  }

  const fallback = deterministicFallback(factPack, "qa");
  return {
    answer: fallback.summary,
    mode: "deterministic",
    sources: fallback.cited_fact_ids,
  };
}

export const askRouter = new Hono();

askRouter.post("/", async (c) => {
  const db = c.get("db") as D1Database;
  const body = (await parseBody(c, AskSchema)) as z.infer<typeof AskSchema>;

  const { snapshot } = await ensureCurrentSnapshot(db);
  const factPack = await buildGlobalFactPack(db, snapshot.id);

  const teamRows = await all<Record<string, unknown>>(db, "SELECT id, name FROM team");
  const teamNames = new Map<string, string>(
    teamRows.map((r) => [r.id as string, r.name as string]),
  );

  const intent = routeIntent(body.question, factPack, teamNames);
  if (intent) {
    return c.json({
      answer: intent.answer,
      mode: intent.mode,
      sources: intent.sources,
    });
  }

  const result = await aiAnswer(db, body.question, factPack);
  return c.json(result);
});

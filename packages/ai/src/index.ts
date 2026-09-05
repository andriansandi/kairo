import type {
  AnalysisSubject,
  CapacityWeekEntry,
  Conflict,
  ConflictRule,
  ConflictSeverity,
  Fact,
  FactPack,
  FeasibilityVerdict,
  Person,
  Project,
  Skill,
  Team,
  TeamMembership,
} from "@kairo/types";

export const SYSTEM_PROMPT = `You are KAIRO's AI Advisor. You answer only from the provided fact pack. Rules:
1. Use only facts whose ids are explicitly listed in the pack.
2. Every claim must include one or more fact ids as citations.
3. Do not introduce dates, names, capacities, allocations, projects, people, skills, or teams that are not in the fact pack.
4. You may perform arithmetic on cited numeric facts, but show the computation.
5. If the fact pack does not contain enough information to answer, say so explicitly.
6. Prefer concise, accurate, management-ready language.
Respond using the requested JSON schema with summary and claims fields.`;

export interface AiConfig {
  gateway_url?: string;
  provider?: string;
  model?: string;
  api_key?: string;
}

export interface BuildFactPackInputProject {
  id: string;
  name: string;
  deadline: string | null;
  declared_start: string | null;
  declared_end: string | null;
}

export interface BuildFactPackInputPerson {
  id: string;
  name: string;
}

export interface BuildFactPackInputConflict {
  id: string;
  rule: ConflictRule;
  severity: ConflictSeverity;
  person_id: string | null;
  project_id: string | null;
  team_id: string | null;
  phase_id: string | null;
  window_start: string;
  window_end: string;
  explanation: string;
  metrics: Record<string, number>;
}

export interface BuildFactPackInputFeasibility {
  project_id: string;
  verdict: FeasibilityVerdict;
  computed_finish: string;
  slack_days: number;
  buffer_days?: number;
  computed_start?: string;
  drivers?: string[];
}

export interface BuildFactPackInputTeamWeek {
  team_id: string;
  week_key: string;
  utilization: number;
  available_h: number;
  planned_h: number;
}

export interface BuildFactPackInputSkillCoverage {
  skill_id: string;
  skill_name: string;
  total_people: number;
  free_hours: number;
  spof: boolean;
}

export interface BuildFactPackInput {
  snapshotId: string;
  generatedAt: string;
  subject?: AnalysisSubject;
  data: {
    projects: BuildFactPackInputProject[];
    people: BuildFactPackInputPerson[];
    conflicts: BuildFactPackInputConflict[];
    feasibility: BuildFactPackInputFeasibility[];
    teamWeeks: BuildFactPackInputTeamWeek[];
    skillCoverage: BuildFactPackInputSkillCoverage[];
  };
}

export interface AnalysisOutput {
  summary: string;
  details?: string[];
  claims?: {
    text: string;
    fact_ids: string[];
  }[];
}

export class NotConfiguredError extends Error {
  constructor() {
    super("AI Gateway is not configured");
    this.name = "NotConfiguredError";
  }
}

/**
 * Build a typed, closed FactPack from deterministic snapshot data.
 */
export function buildFactPack(input: BuildFactPackInput): FactPack {
  const facts: Fact[] = [];

  let pIndex = 0;
  let cIndex = 0;
  let fIndex = 0;
  let tIndex = 0;
  let sIndex = 0;

  const { subject } = input;
  const subjectMatches = (predicate: (s: AnalysisSubject) => boolean) =>
    !subject || predicate(subject);

  for (const project of input.data.projects) {
    if (!subjectMatches((s) => s.type === "project" && s.id === project.id)) {
      continue;
    }
    facts.push({
      id: `P:${++pIndex}`,
      type: "project",
      payload: {
        id: project.id,
        name: project.name,
        deadline: project.deadline,
        declared_start: project.declared_start,
        declared_end: project.declared_end,
      },
    });
  }

  let eIndex = 0;
  for (const person of input.data.people) {
    facts.push({
      id: `E:${++eIndex}`,
      type: "person",
      payload: { id: person.id, name: person.name },
    });
  }

  for (const conflict of input.data.conflicts) {
    if (
      !subjectMatches((s) => s.type === "conflict" && s.id === conflict.id) &&
      !subjectMatches((s) => s.type === "person" && s.id === conflict.person_id) &&
      !subjectMatches((s) => s.type === "project" && s.id === conflict.project_id) &&
      !subjectMatches((s) => s.type === "team" && s.id === conflict.team_id)
    ) {
      continue;
    }
    facts.push({
      id: `C:${++cIndex}`,
      type: "conflict",
      payload: {
        id: conflict.id,
        rule: conflict.rule,
        severity: conflict.severity,
        person_id: conflict.person_id,
        project_id: conflict.project_id,
        team_id: conflict.team_id,
        phase_id: conflict.phase_id,
        window_start: conflict.window_start,
        window_end: conflict.window_end,
        explanation: conflict.explanation,
        metrics: conflict.metrics,
      },
    });
  }

  for (const feasibility of input.data.feasibility) {
    if (
      !subjectMatches(
        (s) => s.type === "project" && s.id === feasibility.project_id,
      )
    ) {
      continue;
    }
    facts.push({
      id: `F:${++fIndex}`,
      type: "feasibility",
      payload: {
        project_id: feasibility.project_id,
        verdict: feasibility.verdict,
        computed_finish: feasibility.computed_finish,
        slack_days: feasibility.slack_days,
        buffer_days: feasibility.buffer_days,
        computed_start: feasibility.computed_start,
        drivers: feasibility.drivers,
      },
    });
  }

  for (const teamWeek of input.data.teamWeeks) {
    if (!subjectMatches((s) => s.type === "team" && s.id === teamWeek.team_id)) {
      continue;
    }
    facts.push({
      id: `T:${++tIndex}`,
      type: "team_week",
      payload: {
        team_id: teamWeek.team_id,
        week_key: teamWeek.week_key,
        utilization: teamWeek.utilization,
        available_h: teamWeek.available_h,
        planned_h: teamWeek.planned_h,
      },
    });
  }

  for (const coverage of input.data.skillCoverage) {
    facts.push({
      id: `S:${++sIndex}`,
      type: "skill_coverage",
      payload: {
        skill_id: coverage.skill_id,
        skill_name: coverage.skill_name,
        total_people: coverage.total_people,
        free_hours: coverage.free_hours,
        spof: coverage.spof,
      },
    });
  }

  return {
    snapshot_id: input.snapshotId,
    generated_at: input.generatedAt,
    facts,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface OpenAIChoice {
  message?: {
    content?: string;
  };
}

function extractChoiceContent(json: Record<string, unknown>): string {
  const choice = Array.isArray(json.choices)
    ? (json.choices[0] as OpenAIChoice | undefined)
    : null;
  if (choice?.message?.content) {
    return choice.message.content;
  }
  return "";
}

function findFacts(output: unknown): string[] {
  const found: string[] = [];
  function walk(value: unknown) {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else if (isPlainObject(value)) {
      for (const [key, val] of Object.entries(value)) {
        if (key === "fact_ids" && Array.isArray(val)) {
          for (const id of val) {
            if (typeof id === "string") found.push(id);
          }
        } else {
          walk(val);
        }
      }
    }
  }
  walk(output);
  return found;
}

function collectNumberTokens(text: string): number[] {
  const tokens: number[] = [];
  // Match signed/unsigned integers and decimals, commas stripped by replacement.
  const matches = text.matchAll(/-?\d{1,3}(?:[,.]?\d{3})*(?:\.\d+)?/g);
  for (const match of matches) {
    const cleaned = match[0].replace(/,/g, "");
    const num = Number(cleaned);
    if (!Number.isNaN(num)) tokens.push(num);
  }
  return tokens;
}

function normalizeForCheck(n: number): number {
  return Math.round(n * 100) / 100;
}

export function validateAnalysisOutput(
  output: unknown,
  factPack: FactPack,
  allowedNumbers: number[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!isPlainObject(output)) {
    return { valid: false, errors: ["Output must be an object"] };
  }

  if (typeof output.summary !== "string") {
    errors.push("Missing or invalid summary");
  }

  if (!Array.isArray(output.claims)) {
    errors.push("Missing or invalid claims array");
    return { valid: errors.length === 0, errors };
  }

  const validFactIds = new Set(factPack.facts.map((f) => f.id));
  const allowNumberSet = new Set(
    allowedNumbers.map(normalizeForCheck).map((n) => n.toString()),
  );
  const factNumbers = new Set<number>();
  for (const fact of factPack.facts) {
    function walk(value: unknown) {
      if (typeof value === "number") {
        factNumbers.add(normalizeForCheck(value));
      } else if (Array.isArray(value)) {
        for (const item of value) walk(item);
      } else if (isPlainObject(value)) {
        for (const v of Object.values(value)) walk(v);
      }
    }
    walk(fact.payload);
  }

  for (let i = 0; i < output.claims.length; i++) {
    const claim = output.claims[i];
    if (!isPlainObject(claim)) {
      errors.push(`Claim ${i} is not an object`);
      continue;
    }
    if (typeof claim.text !== "string") {
      errors.push(`Claim ${i} missing text`);
      continue;
    }
    if (!Array.isArray(claim.fact_ids)) {
      errors.push(`Claim ${i} missing fact_ids`);
      continue;
    }
    if (claim.fact_ids.length === 0) {
      errors.push(`Claim ${i} cites no facts`);
    }
    for (const id of claim.fact_ids) {
      if (typeof id !== "string" || !validFactIds.has(id)) {
        errors.push(`Claim ${i} cites unknown fact id ${id}`);
      }
    }
    const tokens = collectNumberTokens(claim.text);
    for (const token of tokens) {
      const norm = normalizeForCheck(token);
      const isAllowed =
        allowNumberSet.has(norm.toString()) ||
        factNumbers.has(norm) ||
        // Allow simple sums/differences/products of two or three allowlisted numbers within rounding.
        isCombinable(norm, allowedNumbers);
      if (!isAllowed) {
        errors.push(
          `Claim ${i} contains number ${norm} not present in allowed numbers or facts`,
        );
      }
    }
  }

  const cited = findFacts(output);
  if (cited.length === 0) {
    errors.push("No fact ids cited in output");
  }

  return { valid: errors.length === 0, errors };
}

function isCombinable(target: number, numbers: number[]): boolean {
  const pool = [...new Set(numbers.map(normalizeForCheck))].filter(
    (n) => Number.isFinite(n),
  );
  if (pool.length === 0) return false;
  const eps = 0.011;
  for (const a of pool) {
    for (const b of pool) {
      if (
        Math.abs(a + b - target) <= eps ||
        Math.abs(a - b - target) <= eps ||
        Math.abs(a * b - target) <= eps
      ) {
        return true;
      }
      for (const c of pool) {
        if (
          Math.abs(a + b + c - target) <= eps ||
          Math.abs(a + b - c - target) <= eps
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

export async function callModel(
  config: AiConfig,
  messages: { role: string; content: string }[],
): Promise<string> {
  if (!config.gateway_url) {
    throw new NotConfiguredError();
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.api_key) {
    headers["Authorization"] = `Bearer ${config.api_key}`;
  }

  const response = await fetch(config.gateway_url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      provider: config.provider,
      model: config.model,
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `AI Gateway returned ${response.status}: ${await response.text()}`,
    );
  }

  const json = (await response.json()) as Record<string, unknown>;
  const content = extractChoiceContent(json);

  if (!content || content.trim().length === 0) {
    throw new Error("AI returned empty content");
  }

  return content;
}

function pickCitedIds(factPack: FactPack): string[] {
  return factPack.facts.map((f) => f.id);
}

function runDeterministicFallback(
  factPack: FactPack,
  kind: string,
): { summary: string; details: string[]; cited_fact_ids: string[] } {
  const projects = factPack.facts.filter((f) => f.type === "project");
  const conflicts = factPack.facts.filter((f) => f.type === "conflict");
  const feasibility = factPack.facts.filter((f) => f.type === "feasibility");
  const teamWeeks = factPack.facts.filter((f) => f.type === "team_week");
  const skills = factPack.facts.filter((f) => f.type === "skill_coverage");

  const payload = (f: Fact) => f.payload as Record<string, unknown>;

  const formatProject = (f: Fact) => {
    const p = payload(f);
    return `${p.name} (${p.id})`;
  };

  if (kind === "explain") {
    if (conflicts.length > 0) {
      const lines = conflicts.map(
        (f) => `${payload(f).severity}: ${payload(f).explanation}`,
      );
      return {
        summary: `Verified snapshot shows ${conflicts.length} conflict(s).`,
        details: lines,
        cited_fact_ids: conflicts.map((f) => f.id),
      };
    }
    if (feasibility.length > 0) {
      const lines = feasibility.map(
        (f) =>
          `${formatProject(projects.find((p) => payload(p).id === payload(f).project_id) ?? f)} — ${payload(f).verdict}, computed finish ${payload(f).computed_finish}, slack ${payload(f).slack_days} working days.`,
      );
      return {
        summary: `Verified feasibility assessment based on current snapshot.`,
        details: lines,
        cited_fact_ids: feasibility.map((f) => f.id),
      };
    }
  }

  if (kind === "recommend") {
    if (conflicts.length > 0) {
      return {
        summary: `Recommend resolving ${conflicts.length} open conflict(s) in order of severity.`,
        details: conflicts.map(
          (f) => `[${payload(f).rule}] ${payload(f).explanation}`,
        ),
        cited_fact_ids: conflicts.map((f) => f.id),
      };
    }
    if (feasibility.length > 0) {
      const critical = feasibility.filter(
        (f) => payload(f).verdict === "critical" || payload(f).verdict === "at_risk",
      );
      return {
        summary: `Recommend reviewing timelines for ${critical.length} at-risk project(s).`,
        details: critical.map(
          (f) =>
            `${payload(f).project_id}: ${payload(f).verdict} (slack ${payload(f).slack_days} days)`,
        ),
        cited_fact_ids: critical.map((f) => f.id),
      };
    }
  }

  if (kind === "compare") {
    if (projects.length > 1) {
      return {
        summary: `Comparison across ${projects.length} project(s) in the current snapshot.`,
        details: projects.map(formatProject),
        cited_fact_ids: projects.map((f) => f.id),
      };
    }
  }

  // qa / explain fallback
  if (conflicts.length > 0) {
    return {
      summary: `I can answer from ${conflicts.length} verified conflict fact(s).`,
      details: conflicts.map(
        (f) => `[${payload(f).rule}] ${payload(f).explanation}`,
      ),
      cited_fact_ids: conflicts.map((f) => f.id),
    };
  }

  if (feasibility.length > 0) {
    return {
      summary: `I can answer from ${feasibility.length} verified feasibility fact(s).`,
      details: feasibility.map(
        (f) =>
          `${payload(f).project_id}: ${payload(f).verdict}, slack ${payload(f).slack_days} days`,
      ),
      cited_fact_ids: feasibility.map((f) => f.id),
    };
  }

  if (teamWeeks.length > 0) {
    return {
      summary: `I can answer from ${teamWeeks.length} verified team-week fact(s).`,
      details: teamWeeks.map(
        (f) =>
          `Week ${payload(f).week_key}: utilization ${payload(f).utilization} (${payload(f).planned_h}h planned / ${payload(f).available_h}h available)`,
      ),
      cited_fact_ids: teamWeeks.map((f) => f.id),
    };
  }

  if (skills.length > 0) {
    return {
      summary: `I can answer from ${skills.length} verified skill coverage fact(s).`,
      details: skills.map(
        (f) =>
          `${payload(f).skill_name}: ${payload(f).total_people} people, ${payload(f).free_hours} free hours, ${payload(f).spof ? "SPOF" : "no SPOF"}`,
      ),
      cited_fact_ids: skills.map((f) => f.id),
    };
  }

  const allIds = pickCitedIds(factPack);
  return {
    summary: "AI explanation unavailable — showing verified data summary.",
    details: [
      "The snapshot has no matching facts for this subject. Try a broader question.",
    ],
    cited_fact_ids: allIds,
  };
}

export function deterministicFallback(
  factPack: FactPack,
  kindOrSubject: AnalysisSubject | string,
  kind?: string,
): { summary: string; details: string[]; cited_fact_ids: string[] } {
  let effectiveKind: string;
  if (typeof kindOrSubject === "string") {
    effectiveKind = kindOrSubject;
  } else {
    effectiveKind = kind ?? "explain";
  }
  return runDeterministicFallback(factPack, effectiveKind);
}

export function toAnalysisMessages(
  factPack: FactPack,
  kind: string,
  subject?: AnalysisSubject,
): { role: string; content: string }[] {
  const task = subject
    ? `Kind: ${kind}\nSubject type: ${subject.type}\nSubject id: ${subject.id}\nProduce a JSON response with summary and claims fields. Each claim must use fact ids from the pack.`
    : `Kind: ${kind}\nProduce a JSON response with summary and claims fields. Each claim must use fact ids from the pack.`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `${task}\n\nFact pack:\n${JSON.stringify(factPack, null, 2)}`,
    },
  ];
}

export function extractJsonFromContent(content: string): unknown {
  const cleaned = content
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export function computeAllowedNumbers(factPack: FactPack): number[] {
  const result = new Set<number>();
  for (const fact of factPack.facts) {
    const payload = fact.payload as Record<string, unknown>;
    for (const value of Object.values(payload)) {
      if (typeof value === "number") {
        result.add(normalizeForCheck(value));
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "number") {
            result.add(normalizeForCheck(item));
          }
        }
      }
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}

export interface BuildFactPackInputLegacy {
  snapshot: { id: string; created_at: string };
  subject: AnalysisSubject;
  projects: Project[];
  people: Person[];
  conflicts: Conflict[];
  feasibility: BuildFactPackInputFeasibility[];
  teamWeeks: BuildFactPackInputTeamWeek[];
  skillCoverage: BuildFactPackInputSkillCoverage[];
}

export function buildFactPackLegacy(input: BuildFactPackInputLegacy): FactPack {
  return buildFactPack({
    snapshotId: input.snapshot.id,
    generatedAt: input.snapshot.created_at,
    subject: input.subject,
    data: {
      projects: input.projects.map((p) => ({
        id: p.id,
        name: p.name,
        deadline: p.deadline,
        declared_start: p.declared_start,
        declared_end: p.declared_end,
      })),
      people: input.people.map((p) => ({ id: p.id, name: p.name })),
      conflicts: input.conflicts.map((c) => ({
        id: c.id,
        rule: c.rule,
        severity: c.severity,
        person_id: c.person_id,
        project_id: c.project_id,
        team_id: c.team_id,
        phase_id: c.phase_id,
        window_start: c.window_start,
        window_end: c.window_end,
        explanation: c.explanation,
        metrics: c.metrics,
      })),
      feasibility: input.feasibility,
      teamWeeks: input.teamWeeks,
      skillCoverage: input.skillCoverage,
    },
  });
}

// Re-export handy types for consumers.
export type {
  AnalysisSubject,
  CapacityWeekEntry,
  Conflict,
  Fact,
  FactPack,
  FeasibilityVerdict,
  Person,
  Project,
  Skill,
  Team,
  TeamMembership,
} from "@kairo/types";

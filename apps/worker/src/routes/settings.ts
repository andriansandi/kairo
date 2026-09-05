import { Hono } from "hono";
import { z } from "zod";
import { all, first, nowIso, run } from "../db";
import { parseBody } from "../http";
import type { AiConfig } from "@kairo/ai";

const DEFAULT_CONFLICT_THRESHOLDS = {
  utilization_warning: 0.85,
  utilization_critical: 1.0,
  devops_over_demand_warning: 0.85,
  devops_over_demand_critical: 1.0,
  buffer_warning_pct: 0.15,
  buffer_critical_pct: 0.05,
  unstaffed_phase_critical: true,
};

const DEFAULT_MATCH_WEIGHTS = {
  skill: 0.45,
  availability: 0.35,
  context: 0.1,
  role: 0.1,
};

const ConflictThresholdsSchema = z.object({
  utilization_warning: z.number().min(0).max(2).optional(),
  utilization_critical: z.number().min(0).max(2).optional(),
  devops_over_demand_warning: z.number().min(0).max(2).optional(),
  devops_over_demand_critical: z.number().min(0).max(2).optional(),
  buffer_warning_pct: z.number().min(0).max(1).optional(),
  buffer_critical_pct: z.number().min(0).max(1).optional(),
  unstaffed_phase_critical: z.boolean().optional(),
});

const MatchWeightsSchema = z.object({
  skill: z.number().min(0).max(1).optional(),
  availability: z.number().min(0).max(1).optional(),
  context: z.number().min(0).max(1).optional(),
  role: z.number().min(0).max(1).optional(),
});

const AiConfigSchema = z.object({
  gateway_url: z.string().url().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  api_key: z.string().optional(),
});

const SettingsPatchSchema = z.object({
  conflict_thresholds: ConflictThresholdsSchema.optional(),
  match_weights: MatchWeightsSchema.optional(),
  ai_config: AiConfigSchema.optional(),
});

interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
}

function fromJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export const settingsRouter = new Hono();

async function loadSettings(db: D1Database) {
  const rows = await all<SettingRow>(db, "SELECT key, value, updated_at FROM app_setting");
  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    settings[row.key] = fromJson(row.value, {});
  }
  return settings;
}

function configured(ai: Partial<AiConfig>): boolean {
  return Boolean(
    ai.gateway_url &&
      ai.gateway_url.startsWith("http") &&
      ai.provider &&
      ai.provider.length > 0 &&
      ai.model &&
      ai.model.length > 0,
  );
}

function sanitizeAiConfig(ai: Partial<AiConfig>) {
  const { api_key: _key, ...rest } = ai;
  return { configured: configured(ai), ...rest };
}

function mergeAiConfig(
  existing: Partial<AiConfig>,
  patch: Partial<AiConfig>,
): Partial<AiConfig> {
  return {
    gateway_url: patch.gateway_url ?? existing.gateway_url,
    provider: patch.provider ?? existing.provider,
    model: patch.model ?? existing.model,
    api_key: patch.api_key ?? existing.api_key,
  };
}

function makeResponse(settings: Record<string, unknown>) {
  const conflictThresholds =
    typeof settings.conflict_thresholds === "string"
      ? fromJson<Record<string, unknown>>(settings.conflict_thresholds, {})
      : fromJson<Record<string, unknown>>(
          JSON.stringify(settings.conflict_thresholds ?? {}),
          {},
        );
  const matchWeights =
    typeof settings.match_weights === "string"
      ? fromJson<Record<string, unknown>>(settings.match_weights, {})
      : fromJson<Record<string, unknown>>(
          JSON.stringify(settings.match_weights ?? {}),
          {},
        );

  return {
    conflict_thresholds: {
      ...DEFAULT_CONFLICT_THRESHOLDS,
      ...conflictThresholds,
    },
    match_weights: {
      ...DEFAULT_MATCH_WEIGHTS,
      ...matchWeights,
    },
    ai_config: sanitizeAiConfig(
      typeof settings.ai_config === "string"
        ? fromJson<Partial<AiConfig>>(settings.ai_config, {})
        : fromJson<Partial<AiConfig>>(JSON.stringify(settings.ai_config ?? {}), {}),
    ),
  };
}

settingsRouter.get("/", async (c) => {
  const db = c.get("db") as D1Database;
  const settings = await loadSettings(db);
  return c.json(makeResponse(settings));
});

settingsRouter.patch("/", async (c) => {
  const db = c.get("db") as D1Database;
  const body = (await parseBody(c, SettingsPatchSchema)) as z.infer<
    typeof SettingsPatchSchema
  >;

  const settings = await loadSettings(db);

  const setTable = async (key: string, value: unknown) => {
    const existing = await first<SettingRow>(db, "SELECT key FROM app_setting WHERE key = ?", key);
    const json = JSON.stringify(value);
    const now = nowIso();
    if (existing) {
      await run(
        db,
        "UPDATE app_setting SET value = ?, updated_at = ? WHERE key = ?",
        json,
        now,
        key,
      );
    } else {
      await run(
        db,
        "INSERT INTO app_setting (key, value, updated_at) VALUES (?, ?, ?)",
        key,
        json,
        now,
      );
    }
  };

  if (body.conflict_thresholds !== undefined) {
    const merged = {
      ...DEFAULT_CONFLICT_THRESHOLDS,
      ...fromJson<Record<string, unknown>>(
        JSON.stringify(settings.conflict_thresholds ?? {}),
        {},
      ),
      ...body.conflict_thresholds,
    };
    await setTable("conflict_thresholds", merged);
    settings.conflict_thresholds = merged;
  }

  if (body.match_weights !== undefined) {
    const merged = {
      ...DEFAULT_MATCH_WEIGHTS,
      ...fromJson<Record<string, unknown>>(
        JSON.stringify(settings.match_weights ?? {}),
        {},
      ),
      ...body.match_weights,
    };
    await setTable("match_weights", merged);
    settings.match_weights = merged;
  }

  if (body.ai_config !== undefined) {
    const existing = fromJson<Partial<AiConfig>>(
      JSON.stringify(settings.ai_config ?? {}),
      {},
    );
    const merged = mergeAiConfig(existing, body.ai_config);
    await setTable("ai_config", merged);
    settings.ai_config = merged;
  }

  return c.json(makeResponse(settings));
});

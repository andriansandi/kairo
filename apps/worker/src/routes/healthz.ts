import { Hono } from "hono";
import { EnvironmentSchema, HealthResponseSchema } from "@kairo/types";
import type { Env } from "../env";

export const healthzRouter = new Hono();

healthzRouter.get("/", async (c) => {
  const env = c.get("env") as Env;
  let db: "ok" | "error" = "ok";
  try {
    await env.DB.prepare("SELECT 1 as ok").first();
  } catch {
    db = "error";
  }

  const body = {
    status: "ok" as const,
    version: env.VERSION,
    env: EnvironmentSchema.parse(env.ENV),
    timestamp: new Date().toISOString(),
    db,
  };

  HealthResponseSchema.parse(body);
  return c.json(body);
});

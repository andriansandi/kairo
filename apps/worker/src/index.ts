import { Hono } from "hono";
import { EnvironmentSchema, HealthResponseSchema } from "@kairo/types";
import type { Env } from "./env";
import { validateAccessJwt } from "./middleware/access";

export function createApp(env: Env): Hono {
  const app = new Hono();

  app.use("/api/*", validateAccessJwt);

  app.get("/api/v1/healthz", async (c) => {
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

  app.notFound((c) => {
    if (c.req.path.startsWith("/api")) {
      return c.json(
        { error: { code: "not_found", message: "Unknown API route" } },
        404,
      );
    }

    // Static assets are served by the Wrangler assets binding. Anything reaching
    // here is genuinely not found; return a minimal 404 so the app falls through.
    return c.text("Not found", 404);
  });

  app.onError((err, c) => {
    const message = err instanceof Error ? err.message : "Internal server error";
    return c.json({ error: { code: "internal_error", message } }, 500);
  });

  return app;
}

export default {
  fetch(request: Request, env: Env) {
    return createApp(env).fetch(request);
  },
};

import { Hono } from "hono";
import type { Env } from "./env";
import { validateAccessJwt } from "./middleware/access";
import { HTTPException } from "./http";
import { healthzRouter } from "./routes/healthz";
import { peopleRouter } from "./routes/people";
import { teamsRouter } from "./routes/teams";
import { rolesRouter } from "./routes/roles";
import { skillsRouter } from "./routes/skills";
import { allocationsRouter } from "./routes/allocations";
import { dependenciesRouter } from "./routes/dependencies";
import { planeRouter } from "./routes/plane";
import { projectsRouter } from "./routes/projects";
import { workItemsRouter } from "./routes/work-items";
import { importsRouter } from "./routes/imports";
import { snapshotsRouter } from "./routes/snapshots";
import { capacityRouter } from "./routes/capacity";
import { conflictsRouter } from "./routes/conflicts";
import { handleScheduled } from "./services/scheduled";

export function createApp(env: Env): Hono {
  const app = new Hono();

  app.use("/api/*", async (c, next) => {
    c.set("env", env);
    c.set("db", env.DB);
    await next();
  });

  app.use("/api/*", validateAccessJwt);

  app.route("/api/v1/healthz", healthzRouter);
  app.route("/api/v1/people", peopleRouter);
  app.route("/api/v1/teams", teamsRouter);
  app.route("/api/v1/roles", rolesRouter);
  app.route("/api/v1/skills", skillsRouter);
  app.route("/api/v1/allocations", allocationsRouter);
  app.route("/api/v1/dependencies", dependenciesRouter);
  app.route("/api/v1/plane", planeRouter);
  app.route("/api/v1/projects", projectsRouter);
  app.route("/api/v1/work-items", workItemsRouter);
  app.route("/api/v1/imports", importsRouter);
  app.route("/api/v1/snapshots", snapshotsRouter);
  app.route("/api/v1/capacity", capacityRouter);
  app.route("/api/v1/conflicts", conflictsRouter);

  app.notFound((c) => {
    if (c.req.path.startsWith("/api")) {
      return c.json(
        { error: { code: "not_found", message: "Unknown API route" } },
        404,
      );
    }

    return c.text("Not found", 404);
  });

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json(
        {
          error: {
            code: err.code,
            message: err.message,
            details: err.details,
          },
        },
        err.status as any,
      );
    }

    const message =
      err instanceof Error ? err.message : "Internal server error";
    return c.json({ error: { code: "internal_error", message } }, 500);
  });

  return app;
}

export default {
  fetch(request: Request, env: Env) {
    return createApp(env).fetch(request);
  },
  async scheduled(
    _event: { cron: string; scheduledTime: number },
    env: Env,
    _ctx: { waitUntil(promise: Promise<unknown>): void },
  ) {
    await handleScheduled(env);
  },
};

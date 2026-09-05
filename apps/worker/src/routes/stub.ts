import { Hono } from "hono";

export function stubRouter(name: string): Hono {
  const router = new Hono();
  router.get("/*", (c) =>
    c.json(
      {
        error: {
          code: "not_implemented",
          message: `${name} lane pending`,
        },
      },
      501,
    ),
  );
  return router;
}

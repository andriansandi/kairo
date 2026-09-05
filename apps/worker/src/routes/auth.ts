import { Hono } from "hono";
import { z } from "zod";
import { setCookie } from "hono/cookie";
import { AuthUserSchema } from "@kairo/types";
import { parseBody } from "../http";
import { requireAuth } from "../middleware/auth";
import {
  createSessionCookie,
  hashPassword,
  verifyPassword,
} from "../middleware/auth";

const LoginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
});

const SESSION_COOKIE = "kairo_session";

function cookieAttributes(env: { ENV: string }) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: env.ENV === "prod",
  };
}

export const authRouter = new Hono();

authRouter.post("/login", async (c) => {
  const env = c.get("env");
  const body = await parseBody(c, LoginSchema);
  const username = body.username.trim();

  const row = await c
    .get("db")
    .prepare("SELECT id, username, password_hash FROM users WHERE username = ?")
    .bind(username)
    .first<{ id: string; username: string; password_hash: string }>();

  if (!row || !(await verifyPassword(body.password, row.password_hash))) {
    return c.json(
      { error: { code: "unauthorized", message: "Invalid username or password" } },
      401,
    );
  }

  const cookie = await createSessionCookie(row.id, env);
  setCookie(c, cookie.name, cookie.value, {
    ...cookieAttributes(env),
    maxAge: cookie.maxAge,
  });

  const user = AuthUserSchema.parse({ id: row.id, username: row.username });
  return c.json({ user });
});

authRouter.post("/logout", requireAuth, async (c) => {
  const env = c.get("env");
  const user = c.get("user")!;
  void user;
  setCookie(c, SESSION_COOKIE, "", {
    ...cookieAttributes(env),
    maxAge: 0,
    expires: new Date(0),
  });
  return c.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ user });
});

authRouter.put("/password", requireAuth, async (c) => {
  const env = c.get("env");
  const user = c.get("user")!;
  const body = await parseBody(c, ChangePasswordSchema);

  const row = await c
    .get("db")
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ password_hash: string }>();

  if (!row || !(await verifyPassword(body.currentPassword, row.password_hash))) {
    return c.json(
      { error: { code: "unauthorized", message: "Invalid username or password" } },
      401,
    );
  }

  const newHash = await hashPassword(body.newPassword);
  await c
    .get("db")
    .prepare(
      "UPDATE users SET password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    )
    .bind(newHash, user.id)
    .run();

  return c.json({ user });
});

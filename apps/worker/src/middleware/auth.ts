import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { HTTPException } from "../http";
import type { Env } from "../env";

const SALT_BYTES = 16;
const HASH_BYTES = 32;
const ITERATIONS = 100_000;
const ALGORITHM = "PBKDF2";
const HASH_NAME = "SHA-256";
const SESSION_COOKIE = "kairo_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ALLOWLIST = new Set(["/api/v1/healthz", "/api/v1/auth/login"]);

function bufToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: HASH_NAME },
    false,
    ["sign", "verify"],
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    ALGORITHM,
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    {
      name: ALGORITHM,
      salt,
      iterations: ITERATIONS,
      hash: HASH_NAME,
    },
    passwordKey,
    HASH_BYTES * 8,
  );
  return `pbkdf2$${ITERATIONS}$${bufToHex(salt)}$${bufToHex(hash)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1]!, 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const salt = hexToBuf(parts[2]!);
  const expectedHash = hexToBuf(parts[3]!);

  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    ALGORITHM,
    false,
    ["deriveBits"],
  );
  const derived = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: ALGORITHM,
        salt,
        iterations,
        hash: HASH_NAME,
      },
      passwordKey,
      expectedHash.length * 8,
    ),
  );
  return constantTimeEqual(derived, expectedHash);
}

export async function createSessionCookie(
  userId: string,
  env: Env,
): Promise<{ name: string; value: string; maxAge: number }> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${expiresAt}`;
  const key = await importHmacKey(env.AUTH_SECRET);
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
  );
  const value = `${payload}.${bufToHex(signature)}`;
  return { name: SESSION_COOKIE, value, maxAge: SESSION_TTL_MS / 1000 };
}

export async function verifySessionToken(
  token: string,
  env: Env,
): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAtStr, signatureHex] = parts as [
    string,
    string,
    string,
  ];
  const expiresAt = parseInt(expiresAtStr!, 10);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  const payload = `${userId}.${expiresAt}`;
  const key = await importHmacKey(env.AUTH_SECRET);
  const expected = hexToBuf(signatureHex!);
  const actual = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
  );
  if (!constantTimeEqual(actual, expected)) return null;
  return userId;
}

export const requireAuth = createMiddleware(async (c, next) => {
  const path = c.req.path;
  if (ALLOWLIST.has(path)) {
    return next();
  }

  const token = getCookie(c, SESSION_COOKIE);
  if (!token) {
    throw new HTTPException(401, "unauthorized", "Authentication required");
  }

  const userId = await verifySessionToken(token, c.get("env"));
  if (!userId) {
    throw new HTTPException(401, "unauthorized", "Authentication required");
  }

  const row = await c
    .get("db")
    .prepare("SELECT id, username FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: string; username: string }>();
  if (!row) {
    throw new HTTPException(401, "unauthorized", "Authentication required");
  }

  c.set("user", { id: row.id, username: row.username });
  await next();
});

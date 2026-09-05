import type { Context } from "hono";
import { z } from "zod";
import type { ZodType } from "zod";

export class HTTPException extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = "HTTPException";
  }
}

export function badRequest(message: string): never {
  throw new HTTPException(400, "bad_request", message);
}

export function notFound(message: string): never {
  throw new HTTPException(404, "not_found", message);
}

export async function parseBody<S extends ZodType>(
  c: Context,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HTTPException(
      400,
      "validation_error",
      "Request body must be valid JSON",
    );
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new HTTPException(400, "validation_error", "Validation failed", {
      issues: result.error.issues,
    });
  }
  return result.data as z.infer<S>;
}

export function parseQuery<S extends ZodType>(c: Context, schema: S): z.infer<S> {
  const result = schema.safeParse(c.req.query());
  if (!result.success) {
    throw new HTTPException(400, "validation_error", "Query validation failed", {
      issues: result.error.issues,
    });
  }
  return result.data as z.infer<S>;
}

import { createMiddleware } from "hono/factory";

/**
 * Cloudflare Access JWT validation middleware.
 *
 * TODO(blueprint §13): Currently a no-op. Once the Cloudflare Access team domain
 * is configured, this middleware will validate the CF-Access-JWT-Assertion
 * header, extract the user email, and map it to a KAIRO person + role.
 */
export const validateAccessJwt = createMiddleware(async (_c, next) => {
  await next();
});

# KAIRO

Engineering delivery and resource intelligence layer on top of Plane.so and timeline imports.

Full product/technical blueprint: [docs/BLUEPRINT.md](docs/BLUEPRINT.md).

## Structure

```
apps/
  worker                 # Cloudflare Worker: Hono API, D1 migrations, static assets
  web                    # React + Vite + Tailwind + TanStack Router/Query SPA
packages/
  types                  # domain schemas + types (single source of truth)
  calendar               # working-day math (pure)
  capacity-engine        # capacity ledger           (Phase 2 stub)
  conflict-engine        # rules C1-C10               (Phase 4 stub)
  matching-engine        # JR <-> person scoring      (Phase 3 stub)
  planning-engine        # feasibility + alternatives (Phase 5 stub)
  scenario               # what-if ops + diff         (Phase 6 stub)
  ai                     # fact packs + validation    (Phase 5 stub)
  plane-client           # typed Plane API client     (Phase 1 stub)
  xls-import             # timeline import validation (Phase 1 stub)
```

## Commands

- `pnpm install` — install all workspace packages
- `pnpm typecheck` / `pnpm test` — full workspace
- Local dev: `pnpm dev` — starts BOTH the API (http://localhost:8787) and the web app (http://localhost:5173, proxies `/api` to :8787) with prefixed, streamed output. Stop with Ctrl+C.
  - First time only: `pnpm --filter @kairo/worker db:migrate:local` (create local D1 tables) and copy `apps/worker/.dev.vars.example` → `.dev.vars` with your Plane credentials.
- `pnpm --filter @kairo/web build` — production build (CI stages it into `apps/worker/public/`)

## Deployment — Cloudflare Workers Builds (Git integration)

GitHub Actions only runs quality gates (typecheck / test / build). Deployment is done by
Cloudflare pulling directly from this repository:

1. Cloudflare resources (one-time):
   - `wrangler d1 create kairo` — put the returned `database_id` into `apps/worker/wrangler.jsonc`
   - `wrangler r2 bucket create kairo-imports`
2. Cloudflare dashboard: Workers & Pages → `kairo-worker` → Settings → Builds →
   **Connect** this repository, then set:
   - Root directory: `/` (repo root)
   - Build command:
     ```
     corepack enable && pnpm install --frozen-lockfile && pnpm --filter @kairo/web build && rm -rf apps/worker/public && mkdir -p apps/worker/public && cp -r apps/web/dist/. apps/worker/public/
     ```
   - Deploy command:
     ```
     cd apps/worker && npx wrangler d1 migrations apply DB --remote && npx wrangler deploy
     ```
3. Every push to `main` triggers a build and deploy. D1 migrations run as part of the
   deploy command; if the build token lacks D1 write permission, apply them manually:
   `cd apps/worker && npx wrangler d1 migrations apply DB --remote`.

## Phase 0 status

Foundation complete: monorepo, worker API (`/api/v1/healthz`), full D1 schema (migrations),
web shell with live health dashboard, CI quality gates. Engine packages are typed stubs —
see the roadmap in docs/BLUEPRINT.md §12.

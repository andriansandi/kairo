# KAIRO Conventions — Phase 1 foundation

This document is for feature-lane authors building on the Phase 0/1 foundation.

## Error envelope + HTTP status codes

All JSON API errors use this shape:

```json
{ "error": { "code": "not_found", "message": "...", "details?": {} } }
```

Common codes and statuses:

| Code | Status | Use case |
|---|---|---|
| `validation_error` | 400 | Body/query schema failure (see `details.issues`) |
| `bad_request` | 400 | Business/logic refusal with a message |
| `not_found` | 404 | Unknown route or missing resource |
| `not_implemented` | 501 | Stub endpoints owned by another Phase 1 lane |
| `internal_error` | 500 | Unexpected exception (message only, no stack) |

Use `parseBody<T>(c, Schema)` and `parseQuery<T>(c, Schema)` from `apps/worker/src/http.ts`. Use `notFound(message)` / `badRequest(message)` for domain errors.

## Pagination contract

List endpoints accept `?limit=<n>&cursor=<opaque>` and return:

```ts
Paginated<T> = { items: T[]; nextCursor: string | null };
```

Default limit is 50. `nextCursor === null` means no more pages.

## API client

Web components call `apiFetch` inside `useQuery`:

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

function usePeople() {
  return useQuery({
    queryKey: ['people'],
    queryFn: () => apiFetch<Person[]>('/api/v1/people'),
  });
}
```

`apiFetch` throws `ApiError` with `status`, `code`, and optional `details`.

## UI primitives

Build screens with `apps/web/src/components/ui.tsx`:

```tsx
import { PageHeader, Card, Button, Input, Table, THead, TH, TR, TD } from '../components/ui';
```

Variants: `Button {primary|secondary|danger}`, `Badge {neutral|success|warning|danger}`. Use `PageHeader` for every top-level page.

## File ownership — do not edit files owned by another lane

Only the owning lane edits a file. `apps/worker/src/index.ts` and `apps/web/src/router.tsx` are orchestrator-owned; never touch them.

### Worker routes (`apps/worker/src/routes/*.ts`)

| File | Owner | Lane |
|---|---|---|
| `healthz.ts` | Orchestrator | Phase 0 |
| `people.ts` | T-api | People CRUD |
| `teams.ts` | T-api | Teams CRUD |
| `roles.ts` | T-api | Roles CRUD |
| `skills.ts` | T-api | Skills CRUD |
| `allocations.ts` | T-api | Allocations CRUD |
| `dependencies.ts` | T-api | Dependencies |
| `plane.ts` | P-api | Plane sync |
| `auth.ts` | Auth (closed 2026-09-05) | Login/logout/me/password change |
| `projects.ts` | P-api | Plane-synced project reads |
| `work-items.ts` | P-api | Work item (JR) reads |
| `imports.ts` | X-api | XLS import |
| `snapshots.ts` | Orchestrator / foundation | Snapshot builder v1 is real |

### Worker services (`apps/worker/src/services/`)

| File | Owner | Lane |
|---|---|---|
| `snapshot.ts` | Orchestrator | Fingerprint + rebuild |
| `scheduled.ts` | P-api | Cron entry (Plane sync, guarded on `PLANE_API_KEY`) |
| `plane-sync.ts` | P-api | Sync orchestration |

### Migrations (`apps/worker/migrations/`)

| File | Owner | Content |
|---|---|---|
| `0001_init.sql`, `0002_add_timestamps.sql` | Orchestrator | Schema + timestamps |
| `0003_*.sql` | P-api | Plane member table |
| `0004_*.sql` | X-api | Timeline import rows |
| `0006_users.sql` | Auth (closed 2026-09-05) | users table + default admin (username/password auth) |

### Critical rule — `updated_at`

Every SQL `UPDATE` written by any lane MUST set `updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')` (or `nowIso()`). The snapshot fingerprint reads `COALESCE(updated_at, created_at)` per row; forgetting this makes snapshots silently stale.

## Phase 2 ownership (capacity & timeline)

### New / transferred files

| File | Owner | Lane |
|---|---|---|
| `packages/capacity-engine/**` | E | Weekly capacity ledger + team/project rollups (pure) |
| `packages/conflict-engine/**` | E | Rules C1, C2, C4, C10 + severity + templates (pure) |
| `apps/worker/src/routes/capacity.ts` | W | Capacity reads (mounted at /api/v1/capacity) |
| `apps/worker/src/routes/conflicts.ts` | W | Conflict inbox API (mounted at /api/v1/conflicts) |
| `apps/worker/src/services/snapshot.ts` | W | Extended: rebuild now persists derived capacity_entry + conflict rows (transferred from orchestrator) |
| `apps/worker/src/routes/people.ts`, `teams.ts` | W | Adds `GET /:id/capacity` subroutes (transferred from T-api for Phase 2) |
| `apps/web/src/routes/capacity.tsx` | U | Capacity grid + pivots + heat map |
| `apps/web/src/routes/conflicts.tsx` | U | Conflict inbox |
| `apps/web/src/routes/dashboard.tsx` | U | Adds top-conflicts card + capacity strip (transferred from orchestrator; keep the health card) |
| `apps/web/src/routes/people.tsx` | U | Adds person utilization strip (transferred from T-ui) |
| `apps/web/src/api/capacity.ts`, `conflicts.ts` | U | Hooks |

Lane smoke ports: W = 8793. E and U run no dev servers.

### Web routes (`apps/web/src/routes/*.tsx`)

| File | Owner | Lane |
|---|---|---|
| `layout.tsx` | Orchestrator | Shell |
| `dashboard.tsx` | Orchestrator | Dashboard |
| `projects.tsx` | P-ui | Project/Plane views |
| `work-items.tsx` | P-ui | Work / JR list |
| `people.tsx` | T-ui | People management |
| `skills.tsx` | T-ui | Skills matrix |
| `capacity.tsx` | Phase 2 | Capacity views |
| `conflicts.tsx` | Phase 4 | Conflict inbox |
| `scenarios.tsx` | Phase 6 | What-if lab |
| `ai-advisor.tsx` | Phase 5 | Central Q&A |
| `settings/layout.tsx` | Orchestrator | Settings shell |
| `settings/index.tsx` | T-ui | General settings placeholder |
| `settings/teams.tsx` | T-ui | Team settings |
| `settings/sync.tsx` | P-ui | Plane sync settings + runs |
| `settings/imports.tsx` | X-ui | Import templates + queue |
| `login.tsx` | Auth (closed 2026-09-05) | Login page (public route) |

## Snapshot endpoints

- `GET /api/v1/snapshots/current` → `{ snapshot: PlanningSnapshot | null }`
- `POST /api/v1/snapshots/rebuild` → `{ snapshot: PlanningSnapshot, rebuilt: boolean, counts?: Record<string, number> }`

Only `/rebuild` computes a new `inputs_hash` when source data has changed. Snapshots are immutable; derived tables are keyed to `snapshot_id`.

## Local dev commands

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm --filter @kairo/web build
pnpm --filter @kairo/worker dev
```

Copy `apps/worker/.dev.vars.example` to `.dev.vars` and fill `PLANE_API_KEY` + `PLANE_WORKSPACE_SLUG` before Plane sync work.

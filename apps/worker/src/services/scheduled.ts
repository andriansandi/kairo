import type { Env } from "../env";
import { runPlaneSync, type PlaneSyncEnv } from "./plane-sync";

/**
 * Cron entry point. Runs an incremental Plane sync when credentials are
 * configured; otherwise dev/test environments are a quiet no-op.
 */
export async function handleScheduled(env: Env): Promise<void> {
  const planeEnv = env as PlaneSyncEnv;
  if (!planeEnv.PLANE_API_KEY) return;

  try {
    await runPlaneSync(planeEnv, "incremental");
  } catch {
    // Failures are recorded in the sync_run row; the cron must not throw.
  }
}

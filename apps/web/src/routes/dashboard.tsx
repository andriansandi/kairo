import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './layout';
import { useHealth } from '../api/health';

function Dashboard() {
  const { data, isLoading, error } = useHealth();

  const indicatorColor = isLoading
    ? 'bg-gray-400'
    : error || data?.db !== 'ok'
      ? 'bg-red-500'
      : 'bg-emerald-500';

  const statusText = isLoading
    ? 'Loading...'
    : error
      ? 'API unreachable'
      : data?.db === 'ok'
        ? 'Healthy'
        : 'Unhealthy';

  return (
    <div className="max-w-4xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">KAIRO</h1>
        <p className="mt-1 text-lg text-slate-600">Engineering Delivery & Resource Intelligence</p>
      </header>

      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Phase 0 status</h2>
        <p className="text-slate-700">
          The app shell is wired up. Routes, the API client, and live health checks are in place. Domain pages arrive in later phases.
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${indicatorColor}`} aria-hidden="true" />
          <h2 className="text-lg font-semibold text-slate-900">Worker health</h2>
          <span className="ml-auto text-sm font-medium text-slate-600">{statusText}</span>
        </div>

        {error ? (
          <div className="text-sm text-red-700">
            <p className="mb-2">API unreachable — start the worker with:</p>
            <code className="block rounded bg-slate-100 p-3 font-mono text-slate-800">
              pnpm --filter @kairo/worker dev
            </code>
          </div>
        ) : isLoading ? (
          <p className="text-sm text-slate-500">Waiting for health response...</p>
        ) : data ? (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">{data.status}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Version</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">{data.version}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Env</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">{data.env}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">DB</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">{data.db}</dd>
            </div>
          </dl>
        ) : null}
      </section>
    </div>
  );
}

export const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Dashboard,
});

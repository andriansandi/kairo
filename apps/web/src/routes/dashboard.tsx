import { createRoute, Link } from '@tanstack/react-router';
import { rootRoute } from './layout';
import { useHealth } from '../api/health';
import {
  Card,
  Spinner,
  ErrorState,
  EmptyState,
  Badge,
  Table,
  THead,
  TH,
  TR,
  TD,
} from '../components/ui';
import { useConflicts, type ConflictView, type ConflictSeverity } from '../api/conflicts';
import {
  useCapacity,
  type TeamWeekEntry,
  dashboardTeamRange,
  weekColumns,
  formatWeekRange,
  shortWeekLabel,
} from '../api/capacity';
import { useTeams } from '../api/teams';

export const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Dashboard,
});

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
    <div className="max-w-5xl space-y-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">KAIRO</h1>
        <p className="mt-1 text-lg text-slate-600">Engineering Delivery & Resource Intelligence</p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
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

      <TopConflictsCard />
      <TeamCapacityStrip />
    </div>
  );
}

function TopConflictsCard() {
  const { data, isLoading, error, refetch } = useConflicts({ limit: 5 });

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Top conflicts</h2>
        <Link
          to="/conflicts"
          className="inline-flex items-center justify-center rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          View all
        </Link>
      </div>

      {error ? (
        <ErrorState title="Failed to load conflicts" message={error.message} retry={refetch} />
      ) : isLoading ? (
        <div className="flex items-center gap-2 py-4">
          <Spinner />
          <span className="text-slate-500">Loading conflicts...</span>
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No open conflicts" message="The snapshot is clean or needs a rebuild." />
      ) : (
        <div className="divide-y divide-slate-200">
          {data.items.map((c) => (
            <Link
              key={c.id}
              to="/conflicts"
              className="flex items-center gap-3 py-3 hover:bg-slate-50"
            >
              <Badge tone="neutral">{c.rule}</Badge>
              <span className="flex-1 text-sm font-medium text-slate-900">{entityName(c)}</span>
              <Badge tone={severityBadgeTone(c.severity)}>{severityLabel(c.severity)}</Badge>
              <span className="text-xs text-slate-500">
                {c.window_start} → {c.window_end}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function TeamCapacityStrip() {
  const { from, to } = dashboardTeamRange();
  const { data, isLoading, error, refetch } = useCapacity<TeamWeekEntry>('teams', { from, to });
  const { data: teams } = useTeams();
  const columns = weekColumns(from, to);

  const names = new Map(teams?.map((t) => [t.id, t.name]) ?? []);
  const rows = new Map(
    data?.entries
      .reduce(
        (acc, entry) => {
          let row = acc.get(entry.team_id);
          if (!row) {
            row = {
              id: entry.team_id,
              name: names.get(entry.team_id) ?? entry.team_id,
              entries: new Map(),
            };
            acc.set(entry.team_id, row);
          }
          row.entries.set(entry.week_key, entry);
          return acc;
        },
        new Map<string, { id: string; name: string; entries: Map<string, TeamWeekEntry> }>(),
      )
      .entries(),
  );

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Team capacity</h2>
      {error ? (
        <ErrorState title="Failed to load capacity" message={error.message} retry={refetch} />
      ) : isLoading ? (
        <div className="flex items-center gap-2 py-4">
          <Spinner />
          <span className="text-slate-500">Loading capacity...</span>
        </div>
      ) : rows.size === 0 ? (
        <EmptyState title="No team capacity data" message="Rebuild the snapshot to refresh derived data." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <Table>
            <THead>
              <tr>
                <TH className="min-w-[12rem]">Team</TH>
                {columns.map((w) => (
                  <TH key={w} className="w-16 text-center" title={formatWeekRange(w)}>
                    {shortWeekLabel(w)}
                  </TH>
                ))}
              </tr>
            </THead>
            <tbody className="divide-y divide-slate-200">
              {Array.from(rows.values())
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((row) => (
                  <TR key={row.id}>
                    <TD>{row.name}</TD>
                    {columns.map((w) => {
                      const entry = row.entries.get(w);
                      if (!entry) return <TD key={w} className="text-center">—</TD>;
                      const flagged = entry.flags?.includes('no_available_capacity');
                      const display = flagged ? '∞' : `${Math.round(entry.utilization)}%`;
                      return (
                        <TD key={w} className={`text-center ${heatClass(entry.utilization, flagged)}`}>
                          <span title={formatWeekRange(w)}>{display}</span>
                        </TD>
                      );
                    })}
                  </TR>
                ))}
            </tbody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function heatClass(value: number, hasFlag?: boolean): string {
  if (hasFlag || !isFinite(value) || value > 125) return 'bg-red-100 text-red-900';
  if (value <= 85) return 'bg-emerald-100 text-emerald-900';
  if (value <= 100) return 'bg-amber-100 text-amber-900';
  if (value <= 125) return 'bg-orange-100 text-orange-900';
  return 'bg-red-100 text-red-900';
}

function entityName(c: ConflictView): string {
  return (
    c.person_name ??
    c.team_name ??
    c.project_name ??
    c.phase_name ??
    c.person_id ??
    c.team_id ??
    c.project_id ??
    c.phase_id ??
    'Unknown'
  );
}

function severityBadgeTone(severity: ConflictSeverity): 'warning' | 'danger' {
  return severity === 'warning' ? 'warning' : 'danger';
}

function severityLabel(severity: ConflictSeverity): string {
  return severity === 'at_risk' ? 'At Risk' : severity.charAt(0).toUpperCase() + severity.slice(1);
}

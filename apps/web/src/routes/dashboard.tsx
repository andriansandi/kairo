import { useMemo } from 'react';
import { createRoute, Link } from '@tanstack/react-router';
import { rootRoute } from './layout';
import { useHealth } from '../api/health';
import { useProjects } from '../api/projects';
import {
  PageHeader,
  Card,
  Spinner,
  ErrorState,
  EmptyState,
  Badge,
  type BadgeProps,
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
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="At-a-glance view of delivery health and capacity" />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PortfolioHealthCard />
        </div>
        <HealthStatusCard />
      </div>

      <TopConflictsCard />
      <TeamCapacityStrip />
    </div>
  );
}

function HealthStatusCard() {
  const { data, isLoading, error } = useHealth();

  const indicatorColor = isLoading
    ? 'bg-k-text-muted'
    : error || data?.db !== 'ok'
      ? 'bg-k-heat-critical'
      : 'bg-k-heat-low';

  const statusText = isLoading
    ? 'Loading...'
    : error
      ? 'API unreachable'
      : data?.db === 'ok'
        ? 'Healthy'
        : 'Unhealthy';

  return (
    <Card className="flex flex-col justify-between">
      <div>
        <h2 className="text-sm font-semibold text-k-text">Worker health</h2>
        <div className="mt-3 flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${indicatorColor}`} aria-hidden="true" />
          <span className="text-sm font-medium text-k-text-secondary">{statusText}</span>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-k-danger-border bg-k-danger-bg p-3 text-xs text-k-danger-text">
          <p>API unreachable — start the worker with:</p>
          <code className="mt-1 block rounded bg-white/50 p-2 font-mono text-k-danger-text">
            pnpm --filter @kairo/worker dev
          </code>
        </div>
      ) : isLoading ? (
        <p className="mt-4 text-xs text-k-text-muted">Waiting for health response...</p>
      ) : data ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-k-text-muted">Status</dt>
            <dd className="mt-0.5 font-medium text-k-text">{data.status}</dd>
          </div>
          <div>
            <dt className="text-k-text-muted">Version</dt>
            <dd className="mt-0.5 font-medium text-k-text">{data.version}</dd>
          </div>
          <div>
            <dt className="text-k-text-muted">Env</dt>
            <dd className="mt-0.5 font-medium text-k-text">{data.env}</dd>
          </div>
          <div>
            <dt className="text-k-text-muted">DB</dt>
            <dd className="mt-0.5 font-medium text-k-text">{data.db}</dd>
          </div>
        </dl>
      ) : null}
    </Card>
  );
}

function PortfolioHealthCard() {
  const { data, isLoading, error, refetch } = useProjects({ limit: 1000 });

  const distribution = useMemo(() => {
    const map = new Map<string, number>();
    data?.items.forEach((p) => {
      const verdict = p.feasibility_verdict ?? 'unknown';
      map.set(verdict, (map.get(verdict) ?? 0) + 1);
    });
    return map;
  }, [data]);

  const total = data?.items.length ?? 0;

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-k-text">Portfolio health</h2>
        <span className="text-xs font-medium text-k-text-secondary">{total} project(s)</span>
      </div>

      {error ? (
        <ErrorState title="Failed to load projects" message={error.message} retry={refetch} />
      ) : isLoading ? (
        <div className="flex items-center gap-2 py-4">
          <Spinner />
          <span className="text-k-text-secondary">Loading projects…</span>
        </div>
      ) : total === 0 ? (
        <EmptyState title="No projects" message="Add or sync projects to see portfolio health." />
      ) : (
        <>
          <div className="flex h-3 overflow-hidden rounded-full">
            {Array.from(distribution.entries()).map(([verdict, count]) => (
              <div
                key={verdict}
                className={`first:rounded-l-full last:rounded-r-full ${verdictColorClass(verdict)}`}
                style={{ width: `${(count / total) * 100}%` }}
                title={`${verdict}: ${count}`}
              />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-5">
            {Array.from(distribution.entries()).map(([verdict, count]) => (
              <div key={verdict} className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${verdictColorClass(verdict)}`} />
                <span className="font-medium capitalize text-k-text">{verdict.replace('_', ' ')}</span>
                <span className="ml-auto text-k-text-muted">{count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function verdictColorClass(verdict: string): string {
  switch (verdict) {
    case 'healthy':
      return 'bg-k-heat-low';
    case 'warning':
      return 'bg-k-heat-med';
    case 'at_risk':
      return 'bg-k-heat-high';
    case 'critical':
      return 'bg-k-heat-critical';
    default:
      return 'bg-k-text-muted';
  }
}

function verdictTone(verdict: string): BadgeProps['tone'] {
  switch (verdict) {
    case 'healthy':
      return 'success';
    case 'warning':
      return 'warning';
    case 'at_risk':
      return 'risk';
    case 'critical':
      return 'danger';
    default:
      return 'neutral';
  }
}

function TopConflictsCard() {
  const { data, isLoading, error, refetch } = useConflicts({ limit: 5 });

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-k-text">Top conflicts</h2>
        <Link
          to="/conflicts"
          className="inline-flex items-center justify-center rounded-md border border-k-border bg-k-surface px-3 py-1.5 text-xs font-medium text-k-text-secondary transition-colors hover:bg-k-elevated hover:text-k-text"
        >
          View all
        </Link>
      </div>

      {error ? (
        <ErrorState title="Failed to load conflicts" message={error.message} retry={refetch} />
      ) : isLoading ? (
        <div className="flex items-center gap-2 py-4">
          <Spinner />
          <span className="text-k-text-secondary">Loading conflicts...</span>
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No open conflicts" message="The snapshot is clean or needs a rebuild." />
      ) : (
        <div className="divide-y divide-k-border rounded-lg border border-k-border">
          {data.items.map((c) => (
            <Link
              key={c.id}
              to="/conflicts"
              className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-k-elevated/50"
            >
              <span className={`h-2 w-1 rounded-full ${severityStripeColor(c.severity)}`} />
              <Badge tone="neutral" className="shrink-0">
                {c.rule}
              </Badge>
              <span className="flex-1 text-sm font-medium text-k-text">{entityName(c)}</span>
              <Badge tone={severityBadgeTone(c.severity)}>{severityLabel(c.severity)}</Badge>
              <span className="whitespace-nowrap text-xs text-k-text-muted">
                {c.window_start} → {c.window_end}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function severityStripeColor(severity: ConflictSeverity): string {
  switch (severity) {
    case 'warning':
      return 'bg-k-heat-med';
    case 'at_risk':
      return 'bg-k-heat-high';
    case 'critical':
      return 'bg-k-heat-critical';
    default:
      return 'bg-k-text-muted';
  }
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
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-k-text">Team capacity</h2>
        <CapacityLegend />
      </div>

      {error ? (
        <ErrorState title="Failed to load capacity" message={error.message} retry={refetch} />
      ) : isLoading ? (
        <div className="flex items-center gap-2 py-4">
          <Spinner />
          <span className="text-k-text-secondary">Loading capacity...</span>
        </div>
      ) : rows.size === 0 ? (
        <EmptyState title="No team capacity data" message="Rebuild the snapshot to refresh derived data." />
      ) : (
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
          <tbody>
            {Array.from(rows.values())
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((row) => (
                <TR key={row.id}>
                  <TD className="font-medium text-k-text">{row.name}</TD>
                  {columns.map((w) => {
                    const entry = row.entries.get(w);
                    if (!entry) return <TD key={w} className="text-center k-no-data">—</TD>;
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
      )}
    </Card>
  );
}

function CapacityLegend() {
  return (
    <div className="hidden flex-wrap items-center gap-3 text-xs text-k-text-secondary md:flex">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-k-success-bg ring-1 ring-inset ring-k-success-border" /> ≤85%
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-k-warning-bg ring-1 ring-inset ring-k-warning-border" /> ≤100%
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-k-risk-bg ring-1 ring-inset ring-k-risk-border" /> ≤125%
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-k-danger-bg ring-1 ring-inset ring-k-danger-border" /> &gt;125%
      </span>
    </div>
  );
}

function heatClass(value: number, hasFlag?: boolean): string {
  if (hasFlag || !isFinite(value) || value > 125) return 'k-heat-critical';
  if (value <= 85) return 'k-heat-low';
  if (value <= 100) return 'k-heat-med';
  if (value <= 125) return 'k-heat-high';
  return 'k-heat-critical';
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

function severityBadgeTone(severity: ConflictSeverity): 'warning' | 'danger' | 'risk' {
  if (severity === 'warning') return 'warning';
  if (severity === 'at_risk') return 'risk';
  return 'danger';
}

function severityLabel(severity: ConflictSeverity): string {
  return severity === 'at_risk' ? 'At Risk' : severity.charAt(0).toUpperCase() + severity.slice(1);
}

import { useEffect, useMemo, useState } from 'react';
import { createRoute, Link, Outlet, useParams } from '@tanstack/react-router';
import { toast } from 'sonner';
import type { Project, ProjectPhase, ProjectStatus, ScenarioOp } from '@kairo/types';
import { rootRoute } from './layout';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui';
import {
  useProject,
  useProjects,
  useUpdateProject,
  type ProjectFilters,
} from '../api/projects';
import {
  useFeasibility,
  useGenerateAlternatives,
  type FeasibilityResult,
  type Alternative,
  type AlternativeStrategy,
} from '../api/feasibility';

const statusOptions: ProjectStatus[] = ['draft', 'active', 'paused', 'completed', 'cancelled'];
const limit = 25;

function projectStatusTone(status: ProjectStatus) {
  switch (status) {
    case 'active':
      return 'success';
    case 'paused':
      return 'warning';
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

function phaseStatusTone(status: ProjectPhase['status']) {
  switch (status) {
    case 'confirmed':
      return 'success';
    case 'in_progress':
      return 'warning';
    case 'done':
      return 'success';
    default:
      return 'neutral';
  }
}

function formatDate(value: string | null) {
  return value ?? '—';
}

function feasibilityBadgeTone(verdict: string | null): 'success' | 'warning' | 'risk' | 'danger' | 'neutral' {
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

function feasibilityLabel(verdict: string | null): string {
  return verdict ? verdict.replace('_', ' ') : 'Unknown';
}

function strategyLabel(strategy: AlternativeStrategy): string {
  switch (strategy) {
    case 'level_resources':
      return 'Level resources';
    case 'borrow_resources':
      return 'Borrow resources';
    case 'extend_deadline':
      return 'Extend deadline';
    case 'reduce_scope':
      return 'Reduce scope';
  }
}

function opHumanLine(op: ScenarioOp): string {
  switch (op.op) {
    case 'move_project':
      return `Move project by ${op.weeks} week(s)`;
    case 'set_deadline':
      return `Set deadline to ${op.date}`;
    case 'add_allocation':
      return `Add ${op.person_id} at ${op.fte} FTE from ${op.start_date} to ${op.end_date}`;
    case 'remove_allocation':
      return `Remove allocation ${op.allocation_id}`;
    case 'change_allocation_fte':
      return `Change allocation ${op.allocation_id} to ${op.fte} FTE`;
    case 'defer_work_items':
      return `Defer ${op.work_item_ids.length} work item(s)`;
    case 'add_person_skill':
      return `Add skill ${op.skill_id} at level ${op.level} to person ${op.person_id}`;
  }
}

function ProjectsPage() {
  const [filters, setFilters] = useState<ProjectFilters>({ limit, cursor: undefined });
  const { projectId } = useParams({ strict: false });
  const { data, isLoading, error, refetch } = useProjects(filters);

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Plane-synced projects and KAIRO-managed planning fields"
      />

      <Card className="mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="min-w-[16rem] flex-1">
            <label htmlFor="project-search" className="mb-1 block text-xs font-medium text-k-text-secondary">
              Search
            </label>
            <Input
              id="project-search"
              placeholder="Code or name"
              value={filters.q ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value || undefined, cursor: undefined }))}
            />
          </div>
          <div className="w-48">
            <label htmlFor="project-status" className="mb-1 block text-xs font-medium text-k-text-secondary">
              Status
            </label>
            <Select
              id="project-status"
              value={filters.status ?? ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  status: e.target.value || undefined,
                  cursor: undefined,
                }))
              }
            >
              <option value="">All</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {error ? (
        <ErrorState title="Failed to load projects" message={error.message} retry={refetch} />
      ) : isLoading ? (
        <div className="flex items-center gap-3 py-8 text-k-text-secondary">
          <Spinner />
          <span>Loading projects…</span>
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No projects" message="Try changing filters or run a Plane sync." />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>Code</TH>
                <TH>Name</TH>
                <TH>Status</TH>
                <TH>Health</TH>
                <TH>Priority</TH>
                <TH>Deadline</TH>
                <TH>JRs</TH>
              </tr>
            </THead>
            <tbody>
              {data.items.map((p) => (
                <TR key={p.id} className={projectId === p.id ? 'bg-k-elevated' : undefined}>
                  <TD>
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: p.id }}
                      className="font-medium text-k-text hover:underline"
                    >
                      {p.code}
                    </Link>
                  </TD>
                  <TD>{p.name}</TD>
                  <TD>
                    <Badge tone={projectStatusTone(p.status)}>{p.status.replace('_', ' ')}</Badge>
                  </TD>
                  <TD>
                    <Badge tone={feasibilityBadgeTone(p.feasibility_verdict)}>
                      {feasibilityLabel(p.feasibility_verdict)}
                    </Badge>
                  </TD>
                  <TD>{p.priority ?? '—'}</TD>
                  <TD>{formatDate(p.deadline)}</TD>
                  <TD>{p.work_item_count}</TD>
                </TR>
              ))}
            </tbody>
          </Table>

          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="secondary"
              disabled={!filters.cursor}
              onClick={() => setFilters((f) => ({ ...f, cursor: undefined }))}
            >
              First
            </Button>
            <Button
              variant="secondary"
              disabled={!data.nextCursor}
              onClick={() => setFilters((f) => ({ ...f, cursor: data.nextCursor ?? undefined }))}
            >
              Next
            </Button>
          </div>
        </>
      )}

      <div className="mt-8">
        <Outlet />
      </div>
    </div>
  );
}

function ProjectDetail() {
  const { projectId } = useParams({ from: '/projects/$projectId' });
  const { data, isLoading, error, refetch } = useProject(projectId);
  const update = useUpdateProject();

  const [draft, setDraft] = useState({
    priority: null as number | null,
    deadline: null as string | null,
    declared_start: null as string | null,
    declared_end: null as string | null,
  });

  useEffect(() => {
    if (data) {
      setDraft({
        priority: data.project.priority,
        deadline: data.project.deadline,
        declared_start: data.project.declared_start,
        declared_end: data.project.declared_end,
      });
    }
  }, [data]);

  const changed = useMemo(() => {
    if (!data) return false;
    return (
      draft.priority !== data.project.priority ||
      draft.deadline !== data.project.deadline ||
      draft.declared_start !== data.project.declared_start ||
      draft.declared_end !== data.project.declared_end
    );
  }, [draft, data]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-6 text-k-text-secondary">
        <Spinner />
        <span>Loading project…</span>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load project"
        message={error.message}
        retry={refetch}
      />
    );
  }

  if (!data) return null;

  const { project, phases, counts } = data;

  const handleSave = () => {
    update.mutate(
      { id: projectId, input: draft },
      {
        onSuccess: () => {
          toast.success('Project saved');
          refetch();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const [tab, setTab] = useState<'overview' | 'feasibility'>('overview');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-k-text">{project.name}</h2>
        <Link
          to="/projects"
          className="text-sm font-medium text-k-text-secondary hover:text-k-text"
        >
          Close
        </Link>
      </div>

      <div className="border-b border-k-border">
        <nav className="-mb-px flex gap-6">
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>
            Overview
          </TabButton>
          <TabButton active={tab === 'feasibility'} onClick={() => setTab('feasibility')}>
            Feasibility
          </TabButton>
        </nav>
      </div>

      {tab === 'overview' ? (
        <>
          <Card>
            <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Code</dt>
                <dd className="mt-1 text-sm font-semibold text-k-text">{project.code}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Status</dt>
                <dd className="mt-1">
                  <Badge tone={projectStatusTone(project.status)}>
                    {project.status.replace('_', ' ')}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Plane ID</dt>
                <dd className="mt-1 text-sm text-k-text-secondary">{project.plane_id ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Updated</dt>
                <dd className="mt-1 text-sm text-k-text-secondary">
                  {new Date(project.updated_at).toLocaleString()}
                </dd>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 border-t border-k-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="priority" className="mb-1 block text-xs font-medium text-k-text-secondary">
                  Priority (1–5)
                </label>
                <Input
                  id="priority"
                  type="number"
                  min={1}
                  max={5}
                  value={draft.priority ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      priority: e.target.value === '' ? null : Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div>
                <label htmlFor="deadline" className="mb-1 block text-xs font-medium text-k-text-secondary">
                  Deadline
                </label>
                <Input
                  id="deadline"
                  type="date"
                  value={draft.deadline ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, deadline: e.target.value || null }))
                  }
                />
              </div>
              <div>
                <label htmlFor="declared-start" className="mb-1 block text-xs font-medium text-k-text-secondary">
                  Declared start
                </label>
                <Input
                  id="declared-start"
                  type="date"
                  value={draft.declared_start ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, declared_start: e.target.value || null }))
                  }
                />
              </div>
              <div>
                <label htmlFor="declared-end" className="mb-1 block text-xs font-medium text-k-text-secondary">
                  Declared end
                </label>
                <Input
                  id="declared-end"
                  type="date"
                  value={draft.declared_end ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, declared_end: e.target.value || null }))
                  }
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Button onClick={handleSave} disabled={!changed || update.isPending}>
                {update.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
                Save
              </Button>
              {update.isError && <span className="text-sm text-k-danger-text">{update.error.message}</span>}
              {update.isSuccess && <span className="text-sm text-k-success-text">Saved</span>}
            </div>
          </Card>

          {phases.length > 0 && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-k-text">Phases</h3>
              <Table>
                <THead>
                  <tr>
                    <TH>Sequence</TH>
                    <TH>Name</TH>
                    <TH>Status</TH>
                    <TH>Start</TH>
                    <TH>End</TH>
                    <TH>Effort (h)</TH>
                  </tr>
                </THead>
                <tbody>
                  {phases.map((phase) => (
                    <TR key={phase.id}>
                      <TD>{phase.sequence}</TD>
                      <TD className="font-medium text-k-text">{phase.name}</TD>
                      <TD>
                        <Badge tone={phaseStatusTone(phase.status)}>
                          {phase.status.replace('_', ' ')}
                        </Badge>
                      </TD>
                      <TD>{formatDate(phase.declared_start)}</TD>
                      <TD>{formatDate(phase.declared_end)}</TD>
                      <TD>{phase.effort_hours}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}

          {Object.keys(counts).length > 0 && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-k-text">Counts</h3>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {Object.entries(counts).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">
                      {key.replace(/_/g, ' ')}
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-k-text">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
        </>
      ) : (
        <FeasibilitySection project={project} />
      )}
    </div>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 px-1 py-2.5 text-sm font-medium transition-colors ${
        active
          ? 'border-k-text text-k-text'
          : 'border-transparent text-k-text-secondary hover:text-k-text'
      }`}
    >
      {children}
    </button>
  );
}

function FeasibilitySection({ project }: { project: Project }) {
  const { projectId } = useParams({ from: '/projects/$projectId' });
  const {
    data,
    isLoading: feasibilityLoading,
    error: feasibilityError,
    refetch,
  } = useFeasibility(projectId);
  const generate = useGenerateAlternatives(projectId);
  const [alternatives, setAlternatives] = useState<Alternative[] | null>(null);

  const feasibility = data?.feasibility;

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-k-text">Feasibility</h3>
          {feasibility && (
            <Badge tone={feasibilityBadgeTone(feasibility.verdict)}>
              {feasibilityLabel(feasibility.verdict)}
            </Badge>
          )}
        </div>

        {feasibilityLoading ? (
          <div className="flex items-center gap-2 py-4 text-k-text-secondary">
            <Spinner />
            <span>Loading feasibility…</span>
          </div>
        ) : feasibilityError ? (
          <ErrorState title="Failed to load feasibility" message={feasibilityError.message} retry={refetch} />
        ) : !feasibility ? (
          <EmptyState title="No feasibility data" message="Run a snapshot rebuild to compute feasibility." />
        ) : (
          <div className="space-y-6">
            <TimelineStrip
              declaredStart={project.declared_start}
              declaredEnd={project.declared_end}
              deadline={project.deadline}
              computedFinish={feasibility.computed_finish}
            />

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Computed start</dt>
                <dd className="mt-1 text-sm font-semibold text-k-text">{formatDate(feasibility.computed_start)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Computed finish</dt>
                <dd className="mt-1 text-sm font-semibold text-k-text">{formatDate(feasibility.computed_finish)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Slack days</dt>
                <dd className="mt-1 text-sm font-semibold text-k-text">{feasibility.slack_days}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Buffer days</dt>
                <dd className="mt-1 text-sm font-semibold text-k-text">{feasibility.buffer_days}</dd>
              </div>
            </div>

            {feasibility.drivers.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-k-text">Drivers</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm text-k-text-secondary">
                  {feasibility.drivers.map((driver, i) => (
                    <li key={i}>{driver}</li>
                  ))}
                </ul>
              </div>
            )}

            {Object.keys(feasibility.per_phase_load).length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-k-text">Per-phase load</h4>
                <Table>
                  <THead>
                    <tr>
                      <TH>Phase</TH>
                      <TH>Load (h/wk)</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {Object.entries(feasibility.per_phase_load).map(([phase, load]) => (
                      <TR key={phase}>
                        <TD className="font-medium text-k-text">{phase}</TD>
                        <TD>{Number(load.toFixed(1))}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-k-text">Alternatives</h3>
          <Button
            onClick={() =>
              generate.mutate(undefined, {
                onSuccess: (res) => {
                  toast.success('Alternatives generated');
                  setAlternatives(res.alternatives);
                },
                onError: (err) => toast.error(err.message),
              })
            }
            disabled={generate.isPending}
          >
            {generate.isPending ? (
              <>
                <Spinner className="mr-2 h-4 w-4" /> Generating…
              </>
            ) : (
              'Generate alternatives'
            )}
          </Button>
        </div>

        {generate.error && (
          <div className="mb-4 rounded-md border border-k-danger-border bg-k-danger-bg p-3">
            <p className="text-sm text-k-danger-text">{generate.error.message}</p>
          </div>
        )}

        <p className="mb-4 text-sm text-k-text-secondary">
          Applying an alternative is a human decision — use the Scenarios page.
        </p>

        {alternatives === null ? (
          <EmptyState title="No alternatives generated" message="Click the button to compute candidate plans." />
        ) : alternatives.length === 0 ? (
          <EmptyState title="No alternatives" message="The current plan has no suggested alternatives." />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {alternatives.map((alt) => (
              <div key={alt.id} className="rounded-lg border border-k-border bg-k-surface p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="font-semibold text-k-text">{strategyLabel(alt.strategy)}</h4>
                  <Badge tone="neutral">{alt.id}</Badge>
                </div>
                <p className="mb-3 text-sm text-k-text-secondary">{alt.description}</p>

                {alt.tradeoffs.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {alt.tradeoffs.map((tradeoff, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-md bg-k-elevated px-2 py-1 text-xs text-k-text-secondary ring-1 ring-inset ring-k-border"
                      >
                        {tradeoff}
                      </span>
                    ))}
                  </div>
                )}

                {alt.ops.length > 0 && (
                  <div>
                    <h5 className="mb-1 text-xs font-semibold uppercase tracking-wider text-k-text-tertiary">Changes</h5>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-k-text-secondary">
                      {alt.ops.map((op, i) => (
                        <li key={i}>{opHumanLine(op)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function TimelineStrip({
  declaredStart,
  declaredEnd,
  deadline,
  computedFinish,
}: {
  declaredStart: string | null;
  declaredEnd: string | null;
  deadline: string | null;
  computedFinish: string;
}) {
  const markers = [
    { label: 'Declared start', date: declaredStart, color: 'bg-k-text-muted' },
    { label: 'Declared end', date: declaredEnd, color: 'bg-k-text-tertiary' },
    { label: 'Computed finish', date: computedFinish, color: 'bg-blue-500' },
    { label: 'Deadline', date: deadline, color: 'bg-k-heat-critical' },
  ].filter((m): m is { label: string; date: string; color: string } => !!m.date);

  const dates = markers.map((m) => new Date(m.date).getTime());
  const min = dates.length ? Math.min(...dates) : 0;
  const max = dates.length ? Math.max(...dates) : 0;
  const span = max - min || 1;

  if (markers.length === 0) {
    return <p className="text-sm text-k-text-muted">No timeline dates available.</p>;
  }

  return (
    <div className="relative h-20 w-full">
      <div className="absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2 bg-k-border-strong" />
      {markers.map((m, i) => {
        const pos = ((new Date(m.date).getTime() - min) / span) * 100;
        return (
          <div
            key={i}
            className="absolute top-0 -translate-x-1/2"
            style={{ left: `${pos}%` }}
          >
            <div className={`mx-auto h-3 w-3 rounded-full ${m.color}`} />
            <div className="mt-1 text-center text-xs text-k-text-secondary whitespace-nowrap">{m.label}</div>
            <div className="text-center text-[10px] text-k-text-muted">{m.date}</div>
          </div>
        );
      })}
    </div>
  );
}

export const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects',
  component: ProjectsPage,
});

const projectDetailRoute = createRoute({
  getParentRoute: () => projectsRoute,
  path: '/$projectId',
  component: ProjectDetail,
});

projectsRoute.addChildren([projectDetailRoute]);

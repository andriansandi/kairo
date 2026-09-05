import { useEffect, useMemo, useState } from 'react';
import { createRoute, Link, Outlet, useParams } from '@tanstack/react-router';
import type { Project, ProjectPhase, ProjectStatus } from '@kairo/types';
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
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[16rem] flex-1">
            <label htmlFor="project-search" className="mb-1 block text-xs font-medium text-slate-600">
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
            <label htmlFor="project-status" className="mb-1 block text-xs font-medium text-slate-600">
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
        <div className="flex items-center gap-3 py-8 text-slate-500">
          <Spinner />
          <span>Loading projects…</span>
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No projects" message="Try changing filters or run a Plane sync." />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Name</TH>
                <TH>Status</TH>
                <TH>Priority</TH>
                <TH>Deadline</TH>
                <TH>JRs</TH>
              </TR>
            </THead>
            <tbody className="divide-y divide-slate-200">
              {data.items.map((p) => (
                <TR key={p.id} className={projectId === p.id ? 'bg-slate-100' : undefined}>
                  <TD>
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: p.id }}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {p.code}
                    </Link>
                  </TD>
                  <TD>{p.name}</TD>
                  <TD>
                    <Badge tone={projectStatusTone(p.status)}>{p.status.replace('_', ' ')}</Badge>
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
      <div className="flex items-center gap-3 py-6 text-slate-500">
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
          refetch();
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">{project.name}</h2>
        <Link
          to="/projects"
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Close
        </Link>
      </div>

      <Card>
        <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Code</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{project.code}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</dt>
            <dd className="mt-1">
              <Badge tone={projectStatusTone(project.status)}>
                {project.status.replace('_', ' ')}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Plane ID</dt>
            <dd className="mt-1 text-sm text-slate-700">{project.plane_id ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Updated</dt>
            <dd className="mt-1 text-sm text-slate-700">
              {new Date(project.updated_at).toLocaleString()}
            </dd>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="priority" className="mb-1 block text-xs font-medium text-slate-600">
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
            <label htmlFor="deadline" className="mb-1 block text-xs font-medium text-slate-600">
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
            <label htmlFor="declared-start" className="mb-1 block text-xs font-medium text-slate-600">
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
            <label htmlFor="declared-end" className="mb-1 block text-xs font-medium text-slate-600">
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
          {update.isError && (
            <span className="text-sm text-red-700">{update.error.message}</span>
          )}
          {update.isSuccess && <span className="text-sm text-emerald-700">Saved</span>}
        </div>
      </Card>

      {phases.length > 0 && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Phases</h3>
          <Table>
            <THead>
              <TR>
                <TH>Sequence</TH>
                <TH>Name</TH>
                <TH>Status</TH>
                <TH>Start</TH>
                <TH>End</TH>
                <TH>Effort (h)</TH>
              </TR>
            </THead>
            <tbody className="divide-y divide-slate-200">
              {phases.map((phase) => (
                <TR key={phase.id}>
                  <TD>{phase.sequence}</TD>
                  <TD>{phase.name}</TD>
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
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Counts</h3>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Object.entries(counts).map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {key.replace(/_/g, ' ')}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-slate-900">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
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

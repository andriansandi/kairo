import { useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import type { WorkItemStatus } from '@kairo/types';
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
import { useProjects } from '../api/projects';
import { useWorkItem, useWorkItems, type WorkItemFilters } from '../api/work-items';

const statusOptions: WorkItemStatus[] = ['backlog', 'todo', 'in_progress', 'done', 'cancelled'];
const limit = 25;

function workItemStatusTone(status: WorkItemStatus) {
  switch (status) {
    case 'done':
      return 'success';
    case 'in_progress':
      return 'warning';
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

function formatDate(value: string | null) {
  return value ?? '—';
}

function WorkItemsPage() {
  const [filters, setFilters] = useState<WorkItemFilters>({ limit, cursor: undefined });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useWorkItems(filters);
  const { data: projectsData } = useProjects({ limit: 100 });

  return (
    <div>
      <PageHeader
        title="Work / JRs"
        subtitle="Plane-synced work items (job requests)"
      />

      <Card className="mb-6">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[16rem] flex-1">
            <label htmlFor="work-search" className="mb-1 block text-xs font-medium text-slate-600">
              Search
            </label>
            <Input
              id="work-search"
              placeholder="Title"
              value={filters.q ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, q: e.target.value || undefined, cursor: undefined }))
              }
            />
          </div>
          <div className="w-48">
            <label htmlFor="work-status" className="mb-1 block text-xs font-medium text-slate-600">
              Status
            </label>
            <Select
              id="work-status"
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
          <div className="w-56">
            <label htmlFor="work-project" className="mb-1 block text-xs font-medium text-slate-600">
              Project
            </label>
            <Select
              id="work-project"
              value={filters.project_id ?? ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  project_id: e.target.value || undefined,
                  cursor: undefined,
                }))
              }
            >
              <option value="">All projects</option>
              {projectsData?.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {error ? (
        <ErrorState title="Failed to load work items" message={error.message} retry={refetch} />
      ) : isLoading ? (
        <div className="flex items-center gap-3 py-8 text-slate-500">
          <Spinner />
          <span>Loading work items…</span>
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No work items" message="Try changing filters or run a Plane sync." />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Title</TH>
                <TH>Project</TH>
                <TH>Status</TH>
                <TH>Priority</TH>
                <TH>Due date</TH>
                <TH>Estimate (h)</TH>
                <TH>Assignees</TH>
              </TR>
            </THead>
            <tbody className="divide-y divide-slate-200">
              {data.items.map((item) => (
                <TR
                  key={item.id}
                  className={selectedId === item.id ? 'bg-slate-100' : undefined}
                  onClick={() => setSelectedId(item.id)}
                >
                  <TD className="max-w-xs truncate font-medium text-slate-900">{item.title}</TD>
                  <TD>{item.project_name}</TD>
                  <TD>
                    <Badge tone={workItemStatusTone(item.status)}>
                      {item.status.replace('_', ' ')}
                    </Badge>
                  </TD>
                  <TD>{item.priority ?? '—'}</TD>
                  <TD>{formatDate(item.due_date)}</TD>
                  <TD>{item.estimate_normalized_hours ?? item.estimate_raw ?? '—'}</TD>
                  <TD>{item.assignee_ids.length}</TD>
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

      <WorkItemDetail id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function WorkItemDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading, error, refetch } = useWorkItem(id);

  if (!id) return null;

  return (
    <Card className="mt-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">JR detail</h3>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-3 py-4 text-slate-500">
          <Spinner />
          <span>Loading…</span>
        </div>
      ) : error ? (
        <ErrorState title="Failed to load work item" message={error.message} retry={refetch} />
      ) : data ? (
        <div className="space-y-6">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Title</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">{data.title}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</dt>
              <dd className="mt-1">
                <Badge tone={workItemStatusTone(data.status)}>
                  {data.status.replace('_', ' ')}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Priority</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">{data.priority ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Plane ID</dt>
              <dd className="mt-1 text-sm text-slate-700">{data.plane_id}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Start date</dt>
              <dd className="mt-1 text-sm text-slate-700">{formatDate(data.start_date)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Due date</dt>
              <dd className="mt-1 text-sm text-slate-700">{formatDate(data.due_date)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Estimate</dt>
              <dd className="mt-1 text-sm text-slate-700">
                {data.estimate_normalized_hours !== null
                  ? `${data.estimate_normalized_hours} h`
                  : data.estimate_raw ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Cycle</dt>
              <dd className="mt-1 text-sm text-slate-700">{data.cycle ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Assignees</dt>
              <dd className="mt-1 text-sm text-slate-700">{data.assignee_ids.length}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Labels</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {data.labels.length > 0 ? (
                  data.labels.map((label) => (
                    <Badge key={label} tone="neutral">
                      {label}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-slate-700">—</span>
                )}
              </dd>
            </div>
          </dl>

          <div className="border-t border-slate-200 pt-4">
            <EmptyState
              title="Skill requirements"
              message="Phase 3 — skill requirements will be extracted and matched here."
            />
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export const workItemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/work',
  component: WorkItemsPage,
});

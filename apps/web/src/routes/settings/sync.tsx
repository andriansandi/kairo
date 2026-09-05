import { useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import type { SyncRun, SyncRunStatus } from '@kairo/types';
import { settingsRoute } from './layout';
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
} from '../../components/ui';
import {
  useMappingQueue,
  usePeople,
  useResolveMapping,
  useRunSync,
  useSyncRuns,
  type PlaneMember,
  type SyncType,
} from '../../api/plane';

function syncStatusTone(status: SyncRunStatus) {
  switch (status) {
    case 'success':
      return 'success';
    case 'running':
      return 'warning';
    case 'partial':
      return 'warning';
    case 'failed':
      return 'danger';
    default:
      return 'neutral';
  }
}

function formatDateTime(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function statsSummary(stats: Record<string, unknown>) {
  const projects = Number(stats.projects ?? stats.project_count ?? 0);
  const issues = Number(stats.issues ?? stats.work_items ?? stats.issue_count ?? 0);
  const unmatched = Number(stats.unmatched ?? stats.unmatched_count ?? 0);
  if (!projects && !issues && !unmatched) return null;
  const parts: string[] = [];
  if (projects || stats.projects !== undefined) parts.push(`${projects} projects`);
  if (issues || stats.issues !== undefined) parts.push(`${issues} issues`);
  if (unmatched || stats.unmatched !== undefined) parts.push(`${unmatched} unmatched`);
  return parts.join(' · ');
}

function SyncNowCard() {
  const [type, setType] = useState<SyncType>('incremental');
  const run = useRunSync();

  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-slate-900">Sync now</h3>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <label htmlFor="sync-type" className="mb-1 block text-xs font-medium text-slate-600">
            Sync type
          </label>
          <Select id="sync-type" value={type} onChange={(e) => setType(e.target.value as SyncType)}>
            <option value="incremental">Incremental</option>
            <option value="full">Full</option>
          </Select>
        </div>
        <Button onClick={() => run.mutate({ type })} disabled={run.isPending}>
          {run.isPending && <Spinner className="mr-2 h-4 w-4" />}
          Run sync
        </Button>
      </div>

      {run.isError && (
        <p className="mt-3 text-sm text-red-700">{run.error.message}</p>
      )}

      {run.isSuccess && run.data.sync_run && (
        <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">Sync complete</p>
          <p className="text-sm text-emerald-800">
            {statsSummary(run.data.sync_run.stats as Record<string, unknown>) ?? 'Completed'}
          </p>
          {run.data.sync_run.status === 'partial' && (
            <p className="mt-1 text-xs text-emerald-700">Completed with errors — see history below.</p>
          )}
        </div>
      )}
    </Card>
  );
}

function SyncHistory() {
  const { data, isLoading, error, refetch } = useSyncRuns();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-6 text-slate-500">
        <Spinner />
        <span>Loading sync history…</span>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState title="Failed to load sync history" message={error.message} retry={refetch} />
    );
  }

  if (!data || data.length === 0) {
    return <EmptyState title="No sync runs" message="Run a sync to populate this list." />;
  }

  type UnknownError = { message?: string; code?: string; detail?: string } | string;

  return (
    <Table>
      <THead>
        <TR>
          <TH>Type</TH>
          <TH>Status</TH>
          <TH>Started</TH>
          <TH>Finished</TH>
          <TH>Summary</TH>
          <TH>Errors</TH>
        </TR>
      </THead>
      <tbody className="divide-y divide-slate-200">
        {data.map((run: SyncRun) => {
          const isOpen = expanded.has(run.id);
          const summary = statsSummary(run.stats as Record<string, unknown>);
          const errors = (run.errors ?? []) as UnknownError[];
          return (
            <TR key={run.id}>
              <TD className="capitalize">{run.type}</TD>
              <TD>
                <Badge tone={syncStatusTone(run.status)}>{run.status}</Badge>
              </TD>
              <TD>{formatDateTime(run.started_at)}</TD>
              <TD>{formatDateTime(run.finished_at)}</TD>
              <TD>{summary ?? '—'}</TD>
              <TD>
                {errors.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => toggle(run.id)}
                    className="text-sm font-medium text-slate-700 hover:text-slate-900"
                  >
                    {errors.length} error{errors.length === 1 ? '' : 's'} {isOpen ? '▲' : '▼'}
                  </button>
                ) : (
                  <span className="text-sm text-slate-500">—</span>
                )}
                {isOpen && errors.length > 0 && (
                  <ul className="mt-2 space-y-1 rounded border border-slate-200 bg-slate-50 p-2">
                    {errors.map((err, idx) => (
                      <li key={idx} className="text-xs text-red-800">
                        {typeof err === 'string'
                          ? err
                          : err.message ?? JSON.stringify(err)}
                      </li>
                    ))}
                  </ul>
                )}
              </TD>
            </TR>
          );
        })}
      </tbody>
    </Table>
  );
}

function MappingQueue() {
  const { data, isLoading, error, refetch } = useMappingQueue();
  const resolve = useResolveMapping();
  const [search, setSearch] = useState('');
  const { data: peopleData, error: peopleError } = usePeople(search);

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-6 text-slate-500">
        <Spinner />
        <span>Loading mapping queue…</span>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState title="Failed to load mapping queue" message={error.message} retry={refetch} />
    );
  }

  if (!data || data.length === 0) {
    return <EmptyState title="No unmatched members" message="All Plane members are mapped." />;
  }

  return (
    <div className="space-y-3">
      {data.map((member: PlaneMember) => (
        <MappingQueueRow
          key={member.id}
          member={member}
          people={peopleData?.items ?? []}
          peopleError={peopleError}
          onResolve={(action) => resolve.mutate({ memberId: member.id, action })}
          isResolving={resolve.isPending}
        />
      ))}
    </div>
  );
}

function MappingQueueRow({
  member,
  people,
  peopleError,
  onResolve,
  isResolving,
}: {
  member: PlaneMember;
  people: { id: string; name: string; email: string }[];
  peopleError: Error | null;
  onResolve: (action: { action: 'link'; person_id: string } | { action: 'create' }) => void;
  isResolving: boolean;
}) {
  const [personId, setPersonId] = useState('');
  const [query, setQuery] = useState(member.name);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded border border-slate-200 bg-white p-3">
      <div className="min-w-[12rem] flex-1">
        <p className="text-sm font-medium text-slate-900">{member.name}</p>
        <p className="text-xs text-slate-500">{member.email}</p>
      </div>
      <div className="w-56">
        <label htmlFor={`person-search-${member.id}`} className="mb-1 block text-xs font-medium text-slate-600">
          Find person
        </label>
        <Input
          id={`person-search-${member.id}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or email"
        />
      </div>
      <div className="w-64">
        <label htmlFor={`person-select-${member.id}`} className="mb-1 block text-xs font-medium text-slate-600">
          Select person
        </label>
        <Select
          id={`person-select-${member.id}`}
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
        >
          <option value="">{peopleError ? 'People unavailable' : 'Choose…'}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.email})
            </option>
          ))}
        </Select>
      </div>
      <Button
        variant="secondary"
        onClick={() => onResolve({ action: 'link', person_id: personId })}
        disabled={!personId || isResolving}
      >
        Link
      </Button>
      <Button
        variant="secondary"
        onClick={() => onResolve({ action: 'create' })}
        disabled={isResolving}
      >
        Create person
      </Button>
    </div>
  );
}

function SyncSettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Plane sync" subtitle="Sync status, history, and member mapping" />
      <SyncNowCard />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Sync history
        </h2>
        <SyncHistory />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Unmatched Plane members
        </h2>
        <MappingQueue />
      </section>
    </div>
  );
}

export const settingsSyncRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/sync',
  component: SyncSettingsPage,
});

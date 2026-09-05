import { useEffect, useMemo, useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import type { JrSkillRequirement, ProficiencyLevel, SkillWeight, WorkItemStatus } from '@kairo/types';
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
import { useSkills } from '../api/skills';
import { useMatches, type MatchResultEntry } from '../api/matches';
import {
  useUpdateSkillRequirements,
  useWorkItem,
  useWorkItems,
  type SkillRequirementInput,
  type WorkItemFilters,
} from '../api/work-items';

const statusOptions: WorkItemStatus[] = ['backlog', 'todo', 'in_progress', 'done', 'cancelled'];
const limit = 25;

const levelOptions: { value: ProficiencyLevel; label: string }[] = [
  { value: 1, label: 'Novice' },
  { value: 2, label: 'Intermediate' },
  { value: 3, label: 'Advanced' },
  { value: 4, label: 'Expert' },
];

const weightOptions: { value: SkillWeight; label: string }[] = [
  { value: 'must', label: 'Must have' },
  { value: 'nice', label: 'Nice to have' },
];

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
      <PageHeader title="Work / JRs" subtitle="Plane-synced work items (job requests)" />

      <Card className="mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="min-w-[16rem] flex-1">
            <label htmlFor="work-search" className="mb-1 block text-xs font-medium text-k-text-secondary">
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
            <label htmlFor="work-status" className="mb-1 block text-xs font-medium text-k-text-secondary">
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
            <label htmlFor="work-project" className="mb-1 block text-xs font-medium text-k-text-secondary">
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
        <div className="flex items-center gap-3 py-8 text-k-text-secondary">
          <Spinner />
          <span>Loading work items…</span>
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No work items" message="Try changing filters or run a Plane sync." />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>Title</TH>
                <TH>Project</TH>
                <TH>Status</TH>
                <TH>Priority</TH>
                <TH>Due date</TH>
                <TH>Estimate (h)</TH>
                <TH>Assignees</TH>
              </tr>
            </THead>
            <tbody>
              {data.items.map((item) => (
                <TR
                  key={item.id}
                  className={selectedId === item.id ? 'bg-k-elevated' : undefined}
                  onClick={() => setSelectedId(item.id)}
                >
                  <TD className="max-w-xs truncate font-medium text-k-text">{item.title}</TD>
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
        <h3 className="text-base font-semibold text-k-text">JR detail</h3>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-3 py-4 text-k-text-secondary">
          <Spinner />
          <span>Loading…</span>
        </div>
      ) : error ? (
        <ErrorState title="Failed to load work item" message={error.message} retry={refetch} />
      ) : data ? (
        <div className="space-y-6">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Title</dt>
              <dd className="mt-1 text-sm font-semibold text-k-text">{data.title}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Status</dt>
              <dd className="mt-1">
                <Badge tone={workItemStatusTone(data.status)}>
                  {data.status.replace('_', ' ')}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Priority</dt>
              <dd className="mt-1 text-sm font-semibold text-k-text">{data.priority ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Plane ID</dt>
              <dd className="mt-1 text-sm text-k-text-secondary">{data.plane_id}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Start date</dt>
              <dd className="mt-1 text-sm text-k-text-secondary">{formatDate(data.start_date)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Due date</dt>
              <dd className="mt-1 text-sm text-k-text-secondary">{formatDate(data.due_date)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Estimate</dt>
              <dd className="mt-1 text-sm text-k-text-secondary">
                {data.estimate_normalized_hours !== null
                  ? `${data.estimate_normalized_hours} h`
                  : data.estimate_raw ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Cycle</dt>
              <dd className="mt-1 text-sm text-k-text-secondary">{data.cycle ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Assignees</dt>
              <dd className="mt-1 text-sm text-k-text-secondary">{data.assignee_ids.length}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Labels</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {data.labels.length > 0 ? (
                  data.labels.map((label) => (
                    <Badge key={label} tone="neutral">
                      {label}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-k-text-secondary">—</span>
                )}
              </dd>
            </div>
          </dl>

          <div className="border-t border-k-border pt-4">
            <SkillRequirementsCard workItemId={id} />
          </div>

          <div className="border-t border-k-border pt-4">
            <MatchesCard workItemId={id} />
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function levelBadgeTone(level: number): 'neutral' | 'success' | 'warning' | 'danger' {
  if (level >= 4) return 'success';
  if (level >= 3) return 'warning';
  return 'neutral';
}

function SkillRequirementsCard({ workItemId }: { workItemId: string }) {
  const { data, isLoading, error, refetch } = useMatches(workItemId);
  const { data: skills } = useSkills('');
  const update = useUpdateSkillRequirements(workItemId);
  const [draft, setDraft] = useState<SkillRequirementInput[]>([]);

  useEffect(() => {
    if (data) {
      setDraft(
        data.requirements.map((r) => ({
          skill_id: r.skill_id,
          min_level: r.min_level,
          weight: r.weight,
        })),
      );
    }
  }, [data?.requirements]);

  const dirty = useMemo(() => {
    if (!data) return false;
    if (draft.length !== data.requirements.length) return true;
    return draft.some((d, i) => {
      const r = data.requirements[i];
      return d.skill_id !== r.skill_id || d.min_level !== r.min_level || d.weight !== r.weight;
    });
  }, [draft, data]);

  const canSave = dirty && draft.every((r) => r.skill_id) && !update.isPending;

  const addRow = () =>
    setDraft((prev) => [...prev, { skill_id: skills?.[0]?.id ?? '', min_level: 1, weight: 'must' }]);

  const removeRow = (index: number) => setDraft((prev) => prev.filter((_, i) => i !== index));

  const updateRow = (index: number, patch: Partial<SkillRequirementInput>) => {
    setDraft((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const save = () => update.mutate(draft);

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-4 text-k-text-secondary">
        <Spinner />
        <span>Loading skill requirements…</span>
      </div>
    );
  }
  if (error) {
    return <ErrorState title="Failed to load skill requirements" message={error.message} retry={refetch} />;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-k-text">Skill requirements</h3>

      {draft.length === 0 ? (
        <EmptyState title="No requirements" message="Add the skills this JR needs so KAIRO can match people." />
      ) : (
        <div className="space-y-2">
          {draft.map((req, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <div className="min-w-[12rem] flex-1">
                <label className="mb-1 block text-xs font-medium text-k-text-secondary">Skill</label>
                <Select
                  value={req.skill_id}
                  onChange={(e) => updateRow(index, { skill_id: e.target.value })}
                >
                  <option value="" disabled>
                    Select skill
                  </option>
                  {skills?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-40">
                <label className="mb-1 block text-xs font-medium text-k-text-secondary">Level</label>
                <Select
                  value={String(req.min_level)}
                  onChange={(e) =>
                    updateRow(index, { min_level: Number(e.target.value) as ProficiencyLevel })
                  }
                >
                  {levelOptions.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.value} — {l.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-40">
                <label className="mb-1 block text-xs font-medium text-k-text-secondary">Weight</label>
                <Select
                  value={req.weight}
                  onChange={(e) => updateRow(index, { weight: e.target.value as SkillWeight })}
                >
                  {weightOptions.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                type="button"
                variant="danger"
                className="px-2 py-2 text-xs"
                onClick={() => removeRow(index)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={addRow}>
          Add requirement
        </Button>
        <Button type="button" disabled={!canSave} onClick={save}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function MatchesCard({ workItemId }: { workItemId: string }) {
  const { data, isLoading, error, refetch } = useMatches(workItemId);
  const { data: skills } = useSkills('');
  const [showFiltered, setShowFiltered] = useState(false);

  const skillName = (skillId: string) => skills?.find((s) => s.id === skillId)?.name ?? skillId;

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-4 text-k-text-secondary">
        <Spinner />
        <span>Loading matches…</span>
      </div>
    );
  }
  if (error) {
    return <ErrorState title="Failed to load matches" message={error.message} retry={refetch} />;
  }
  if (!data) return null;

  if (data.requirements.length === 0) {
    return (
      <EmptyState title="Best matches" message="Add skill requirements to compute matches." />
    );
  }

  const unfiltered = data.results.filter((r) => !r.filtered);
  const filtered = data.results.filter((r) => r.filtered);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-k-text">Best matches</h3>

      {unfiltered.length === 0 ? (
        <p className="text-sm text-k-warning-text">
          No candidate clears the hard gates — nearest misses are shown below.
        </p>
      ) : null}

      {unfiltered.length > 0 && (
        <Table>
          <THead>
            <tr>
              <TH>Person</TH>
              <TH>Score</TH>
              <TH>Breakdown</TH>
              <TH>Free hours</TH>
              <TH>Gaps</TH>
            </tr>
          </THead>
          <tbody>
            {unfiltered.map((match) => (
              <MatchRow key={match.person_id} match={match} skillName={skillName} />
            ))}
          </tbody>
        </Table>
      )}

      {filtered.length > 0 && (
        <div className="rounded-lg border border-k-border bg-k-surface p-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowFiltered((s) => !s)}
          >
            {showFiltered ? 'Hide' : 'Show'} filtered out ({filtered.length} candidate
            {filtered.length === 1 ? '' : 's'})
          </Button>
          {showFiltered && (
            <div className="mt-3 divide-y divide-k-border">
              {filtered.map((match) => (
                <div key={match.person_id} className="py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-k-text">{match.person_name}</p>
                      <p className="text-xs text-k-text-muted">
                        Score {match.score} · free {match.free_hours_in_window}h
                      </p>
                    </div>
                    <Badge tone="warning">{match.filter_reason ?? 'Filtered'}</Badge>
                  </div>
                  {match.gaps.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {match.gaps.map((g, i) => (
                        <Badge key={i} tone="warning">
                          {skillName(g.skill_id)}: needs {g.required_level}, has{' '}
                          {g.actual_level ?? '—'}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MatchRow({
  match,
  skillName,
}: {
  match: MatchResultEntry;
  skillName: (id: string) => string;
}) {
  return (
    <TR>
      <TD className="font-medium text-k-text">{match.person_name}</TD>
      <TD className="text-base font-bold text-k-text">{match.score}</TD>
      <TD className="min-w-[16rem]">
        <div className="flex flex-wrap gap-3">
          <ScoreBar label="Skill" value={match.components.skill} color="bg-blue-500" />
          <ScoreBar label="Avail" value={match.components.availability} color="bg-k-heat-low" />
          <ScoreBar label="Ctx" value={match.components.context} color="bg-k-heat-med" />
          <ScoreBar label="Role" value={match.components.role} color="bg-purple-500" />
        </div>
      </TD>
      <TD>{match.free_hours_in_window}</TD>
      <TD>
        {match.gaps.length === 0 ? (
          <span className="text-sm text-k-text-muted">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {match.gaps.map((g, i) => (
              <Badge key={i} tone="warning">
                {skillName(g.skill_id)}: needs {g.required_level}, has {g.actual_level ?? '—'}
              </Badge>
            ))}
          </div>
        )}
      </TD>
    </TR>
  );
}

function ScoreBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const width = Math.min(100, Math.max(0, value));
  return (
    <div className="w-20">
      <div className="flex justify-between text-[10px] font-medium uppercase tracking-wider text-k-text-tertiary">
        <span>{label}</span>
        <span>{Math.round(value)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded bg-k-border">
        <div className={`h-1.5 rounded ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export const workItemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/work',
  component: WorkItemsPage,
});

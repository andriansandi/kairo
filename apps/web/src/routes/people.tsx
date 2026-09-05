import { createRoute, Link, Outlet, useNavigate, useParams } from '@tanstack/react-router';
import { rootRoute } from './layout';
import { useEffect, useMemo, useState } from 'react';
import {
  PageHeader,
  Card,
  Button,
  Input,
  Select,
  Badge,
  Spinner,
  ErrorState,
  EmptyState,
  Table,
  THead,
  TH,
  TR,
  TD,
} from '../components/ui';
import type { Person, PersonSkill, Allocation, PtoEntry, ProficiencyLevel } from '@kairo/types';
import type { PersonDetail as PersonDetailData } from '../api/people';
import {
  usePeople,
  usePerson,
  useCreatePerson,
  useUpdatePerson,
  useUpdatePersonSkills,
  useAddPto,
  useRemovePto,
  useDeletePerson,
  type CreatePersonBody,
  type PersonSkillInput,
} from '../api/people';
import { useRoles } from '../api/roles';
import { useSkills } from '../api/skills';
import { useProjects, useCreateAllocation, useDeleteAllocation } from '../api/allocations';
import {
  usePersonCapacity,
  personDetailRange,
  weekColumns,
  shortWeekLabel,
  formatWeekRange,
  heatClass,
  type CapacityWeekEntry,
} from '../api/capacity';

const LIMIT = 50;

type Filters = {
  q: string;
  active: '' | 'true' | 'false';
  cursor: string | null;
};

export const peopleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/people',
  component: People,
});

const personDetailRoute = createRoute({
  getParentRoute: () => peopleRoute,
  path: '$personId',
  component: PersonDetail,
});

peopleRoute.addChildren([personDetailRoute]);

function activeFromFilter(value: '' | 'true' | 'false'): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function People() {
  const [filters, setFilters] = useState<Filters>({ q: '', active: 'true', cursor: null });
  const { data, isLoading, error, refetch } = usePeople({
    limit: LIMIT,
    cursor: filters.cursor,
    q: filters.q || undefined,
    active: activeFromFilter(filters.active),
  });

  const applyFilters = () => setFilters((f) => ({ ...f, cursor: null }));

  return (
    <div>
      <PageHeader title="People" subtitle="Manage team members, skills, and availability" />

      <section className="mb-6 flex flex-wrap items-end gap-3">
        <Input
          placeholder="Search by name or email"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
          className="w-64"
        />
        <Select
          value={filters.active}
          onChange={(e) =>
            setFilters((f) => ({ ...f, active: e.target.value as Filters['active'], cursor: null }))
          }
          className="w-40"
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
          <option value="">All</option>
        </Select>
        <Button variant="secondary" onClick={applyFilters}>
          Filter
        </Button>
      </section>

      {error ? (
        <ErrorState title="Failed to load people" message={error.message} retry={refetch} />
      ) : (
        <>
          <Card className="mb-6 p-0 overflow-hidden">
            <Table>
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Role</TH>
                  <TH>Seniority</TH>
                  <TH>Teams</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </tr>
              </THead>
              <tbody>
                {isLoading ? (
                  <TR>
                    <TD colSpan={7}>
                      <div className="flex items-center gap-2 py-4">
                        <Spinner />
                        <span className="text-k-text-secondary">Loading people...</span>
                      </div>
                    </TD>
                  </TR>
                ) : !data || data.items.length === 0 ? (
                  <TR>
                    <TD colSpan={7}>
                      <EmptyState title="No people found" message="Try adjusting filters or add a person." />
                    </TD>
                  </TR>
                ) : (
                  data.items.map((person) => (
                    <TR key={person.id}>
                      <TD>
                        <Link
                          to="/people/$personId"
                          params={{ personId: person.id }}
                          className="font-medium text-k-text hover:underline"
                        >
                          {person.name}
                        </Link>
                      </TD>
                      <TD>{person.email}</TD>
                      <TD>{person.role_name}</TD>
                      <TD>{person.seniority}</TD>
                      <TD>{person.team_ids.length}</TD>
                      <TD>
                        <Badge tone={person.active ? 'success' : 'neutral'}>
                          {person.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TD>
                      <TD className="text-right">
                        <DeletePersonButton person={person} />
                      </TD>
                    </TR>
                  ))
                )}
              </tbody>
            </Table>
          </Card>

          {data && data.nextCursor && (
            <div className="mb-8 flex items-center justify-between">
              <span className="text-sm text-k-text-secondary">
                Showing {data.items.length} result{data.items.length === 1 ? '' : 's'}
              </span>
              <Button
                variant="secondary"
                onClick={() => setFilters((f) => ({ ...f, cursor: data.nextCursor }))}
              >
                Next page
              </Button>
            </div>
          )}
        </>
      )}

      <AddPersonForm />

      <div className="mt-8">
        <Outlet />
      </div>
    </div>
  );
}

const initialPerson: CreatePersonBody = {
  name: '',
  email: '',
  role_id: '',
  seniority: 1,
  hours_per_day: 8,
  overhead_pct: 0.2,
  active: true,
};

function AddPersonForm() {
  const [form, setForm] = useState<CreatePersonBody>(initialPerson);
  const { data: roles } = useRoles();
  const create = useCreatePerson();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(form, {
      onSuccess: () => setForm(initialPerson),
    });
  };

  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-k-text">Add person</h2>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-k-text-secondary">Name</label>
          <Input
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-k-text-secondary">Email</label>
          <Input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-k-text-secondary">Role</label>
          <Select
            required
            value={form.role_id}
            onChange={(e) => setForm((f) => ({ ...f, role_id: e.target.value }))}
          >
            <option value="">Select role</option>
            {roles?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-k-text-secondary">Seniority</label>
          <Select
            value={String(form.seniority)}
            onChange={(e) => setForm((f) => ({ ...f, seniority: Number(e.target.value) as 1 | 2 | 3 | 4 }))}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-k-text-secondary">Hours / day</label>
          <Input
            type="number"
            min={1}
            max={24}
            value={form.hours_per_day}
            onChange={(e) => setForm((f) => ({ ...f, hours_per_day: Number(e.target.value) }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-k-text-secondary">Overhead %</label>
          <Input
            type="number"
            min={0}
            max={100}
            value={Math.round((form.overhead_pct ?? 0.2) * 100)}
            onChange={(e) => setForm((f) => ({ ...f, overhead_pct: Number(e.target.value) / 100 }))}
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Saving...' : 'Add person'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function DeletePersonButton({
  person,
  onDeleted,
  size = 'small',
}: {
  person: { id: string; name: string };
  onDeleted?: () => void;
  size?: 'small' | 'default';
}) {
  const remove = useDeletePerson();

  const handleClick = () => {
    if (
      window.confirm(
        `Delete ${person.name}? This permanently removes their skills, allocations, and PTO entries.`,
      )
    ) {
      remove.mutate(person.id, { onSuccess: onDeleted });
    }
  };

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        variant="danger"
        onClick={handleClick}
        disabled={remove.isPending}
        className={size === 'small' ? 'px-2 py-1 text-xs' : ''}
      >
        {remove.isPending ? 'Deleting...' : 'Delete'}
      </Button>
      {remove.error && <span className="max-w-[12rem] text-xs text-k-danger-text">{remove.error.message}</span>}
    </div>
  );
}

function PersonDetail() {
  const params = useParams({ strict: false });
  const personId = params.personId ?? null;
  const { data, isLoading, error, refetch } = usePerson(personId);

  if (!personId) return null;

  if (isLoading) {
    return (
      <Card>
        <div className="flex items-center gap-2 py-4">
          <Spinner />
          <span className="text-k-text-secondary">Loading person...</span>
        </div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <ErrorState
        title="Failed to load person"
        message={error?.message ?? 'Unknown error'}
        retry={refetch}
      />
    );
  }

  return (
    <div className="space-y-6">
      <ProfileCard person={data.person} teams={data.teams} />
      <SkillsCard personId={data.person.id} skills={data.skills} />
      <PtoCard personId={data.person.id} pto={data.pto} />
      <AllocationsCard personId={data.person.id} allocations={data.allocations} />
      <UtilizationCard personId={data.person.id} />
    </div>
  );
}

function ProfileCard({ person, teams }: { person: Person; teams: PersonDetailData['teams'] }) {
  const navigate = useNavigate();
  const { data: roles } = useRoles();
  const update = useUpdatePerson();
  const [form, setForm] = useState<Partial<CreatePersonBody>>({});

  useEffect(() => {
    setForm({
      name: person.name,
      email: person.email,
      role_id: person.role_id,
      seniority: person.seniority,
      hours_per_day: person.hours_per_day,
      overhead_pct: person.overhead_pct,
      active: person.active,
    });
  }, [person]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate({ personId: person.id, body: form });
  };

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-k-text">Profile</h2>
        <div className="flex items-center gap-2">
          <Badge tone={person.active ? 'success' : 'neutral'}>
            {person.active ? 'Active' : 'Inactive'}
          </Badge>
          <DeletePersonButton person={person} size="default" onDeleted={() => navigate({ to: '/people' })} />
        </div>
      </div>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-k-text-secondary">Name</label>
          <Input value={form.name ?? ''} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-k-text-secondary">Email</label>
          <Input value={form.email ?? ''} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-k-text-secondary">Role</label>
          <Select value={form.role_id ?? ''} onChange={(e) => setForm((f) => ({ ...f, role_id: e.target.value }))}>
            <option value="">Select role</option>
            {roles?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-k-text-secondary">Seniority</label>
          <Select
            value={String(form.seniority ?? 1)}
            onChange={(e) => setForm((f) => ({ ...f, seniority: Number(e.target.value) as 1 | 2 | 3 | 4 }))}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-k-text-secondary">Hours / day</label>
          <Input
            type="number"
            value={form.hours_per_day ?? 8}
            onChange={(e) => setForm((f) => ({ ...f, hours_per_day: Number(e.target.value) }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-k-text-secondary">Overhead %</label>
          <Input
            type="number"
            value={Math.round((form.overhead_pct ?? 0.2) * 100)}
            onChange={(e) => setForm((f) => ({ ...f, overhead_pct: Number(e.target.value) / 100 }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-k-text-secondary">Status</label>
          <Select value={form.active ? 'true' : 'false'} onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === 'true' }))}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? 'Saving...' : 'Save profile'}
          </Button>
          {teams.length > 0 && <span className="text-sm text-k-text-secondary">Teams: {teams.map((t) => t.name).join(', ')}</span>}
        </div>
      </form>
    </Card>
  );
}

function SkillsCard({ personId, skills }: { personId: string; skills: PersonSkill[] }) {
  const { data: allSkills } = useSkills('');
  const update = useUpdatePersonSkills();

  const skillNames = useMemo(() => {
    const map = new Map(allSkills?.map((s) => [s.id, s.name]) ?? []);
    return map;
  }, [allSkills]);

  const [rows, setRows] = useState<PersonSkillInput[]>([]);

  useEffect(() => {
    setRows(
      skills.map((s) => ({
        skill_id: s.skill_id,
        level: s.level,
        source: s.source,
      })),
    );
  }, [skills]);

  const availableSkills = useMemo(
    () => allSkills?.filter((s) => !rows.some((r) => r.skill_id === s.id)) ?? [],
    [allSkills, rows],
  );

  const addRow = () => {
    if (!availableSkills.length) return;
    setRows((r) => [
      ...r,
      { skill_id: availableSkills[0].id, level: 1, source: 'manual' },
    ]);
  };

  const removeRow = (index: number) => {
    setRows((r) => r.filter((_, i) => i !== index));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate({ personId, skills: rows });
  };

  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-k-text">Skills</h2>
      {rows.length === 0 ? (
        <EmptyState title="No skills yet" message="Add skills to build the skills matrix." />
      ) : (
        <div className="mb-4 space-y-2">
          {rows.map((row, idx) => (
            <div key={`${row.skill_id}-${idx}`} className="flex items-center gap-3">
              <Select
                value={row.skill_id}
                onChange={(e) => setRows((r) => r.map((x, i) => (i === idx ? { ...x, skill_id: e.target.value } : x)))}
              >
                {allSkills?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Select
                value={String(row.level)}
                onChange={(e) => setRows((r) => r.map((x, i) => (i === idx ? { ...x, level: Number(e.target.value) as ProficiencyLevel } : x)))}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
              <span className="text-sm text-k-text-secondary">{skillNames.get(row.skill_id) ?? row.skill_id}</span>
              <Button variant="secondary" onClick={() => removeRow(idx)}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={addRow} disabled={availableSkills.length === 0}>
          Add skill
        </Button>
        <Button onClick={submit} disabled={update.isPending}>
          {update.isPending ? 'Saving...' : 'Save skills'}
        </Button>
      </div>
    </Card>
  );
}

function PtoCard({ personId, pto }: { personId: string; pto: PtoEntry[] }) {
  const add = useAddPto();
  const remove = useRemovePto();
  const [form, setForm] = useState({ start_date: '', end_date: '', type: 'pto' as PtoEntry['type'] });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    add.mutate({ personId, body: form }, { onSuccess: () => setForm({ start_date: '', end_date: '', type: 'pto' }) });
  };

  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-k-text">Time off</h2>
      {pto.length === 0 ? (
        <EmptyState title="No PTO entries" message="Add time off blocks here." />
      ) : (
        <ul className="mb-4 divide-y divide-k-border">
          {pto.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between py-2">
              <span className="text-sm text-k-text-secondary">
                {entry.dates.join(', ')} · <Badge tone="neutral">{entry.type}</Badge>
              </span>
              <Button variant="danger" onClick={() => remove.mutate({ personId, ptoId: entry.id })}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-5 items-end">
        <div>
          <label className="mb-1 block text-xs font-medium text-k-text-secondary">Start date</label>
          <Input type="date" required value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-k-text-secondary">End date</label>
          <Input type="date" required value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-k-text-secondary">Type</label>
          <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as PtoEntry['type'] }))}>
            <option value="pto">PTO</option>
            <option value="holiday">Holiday</option>
            <option value="sick">Sick</option>
            <option value="other">Other</option>
          </Select>
        </div>
        <div className="sm:col-span-2 flex gap-2">
          <Button type="submit" disabled={add.isPending}>
            Add PTO
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AllocationsCard({ personId, allocations }: { personId: string; allocations: Allocation[] }) {
  const { data: projects, isLoading: projectsLoading, error: projectsError } = useProjects();
  const create = useCreateAllocation();
  const remove = useDeleteAllocation();

  const [form, setForm] = useState({
    project_id: '',
    fte: 0.5,
    start_date: '',
    end_date: '',
    status: 'planned' as Allocation['status'],
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { ...form, person_id: personId },
      { onSuccess: () => setForm({ project_id: '', fte: 0.5, start_date: '', end_date: '', status: 'planned' }) },
    );
  };

  const projectNames = useMemo(() => {
    const map = new Map(projects?.items.map((p) => [p.id, `${p.code} — ${p.name}`]) ?? []);
    return map;
  }, [projects]);

  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-k-text">Allocations</h2>
      {allocations.length === 0 ? (
        <EmptyState title="No allocations" message="Allocate this person to a project." />
      ) : (
        <div className="mb-4 overflow-hidden rounded-lg border border-k-border">
          <Table>
            <THead>
              <tr>
                <TH>Project</TH>
                <TH>FTE</TH>
                <TH>Start</TH>
                <TH>End</TH>
                <TH>Status</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {allocations.map((a) => (
                <TR key={a.id}>
                  <TD className="font-medium text-k-text">{projectNames.get(a.project_id) ?? a.project_id}</TD>
                  <TD>{a.fte}</TD>
                  <TD>{a.start_date}</TD>
                  <TD>{a.end_date}</TD>
                  <TD>
                    <Badge
                      tone={
                        a.status === 'committed'
                          ? 'success'
                          : a.status === 'planned'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {a.status}
                    </Badge>
                  </TD>
                  <TD>
                    <Button variant="danger" onClick={() => remove.mutate({ allocationId: a.id, personId })}>
                      Remove
                    </Button>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {projectsError ? (
        <EmptyState title="Projects not available yet" message="The project list could not be loaded." />
      ) : (
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-6 items-end">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-k-text-secondary">Project</label>
            <Select
              required
              value={form.project_id}
              disabled={projectsLoading || !projects}
              onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
            >
              <option value="">Select project</option>
              {projects?.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-k-text-secondary">FTE</label>
            <Input
              type="number"
              min={0}
              max={2}
              step={0.1}
              required
              value={form.fte}
              onChange={(e) => setForm((f) => ({ ...f, fte: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-k-text-secondary">Start</label>
            <Input type="date" required value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-k-text-secondary">End</label>
            <Input type="date" required value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-k-text-secondary">Status</label>
            <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Allocation['status'] }))}>
              <option value="committed">Committed</option>
              <option value="planned">Planned</option>
              <option value="proposed">Proposed</option>
            </Select>
          </div>
          <div>
            <Button type="submit" disabled={create.isPending}>
              Add allocation
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function UtilizationCard({ personId }: { personId: string }) {
  const { from, to } = personDetailRange();
  const { data, isLoading, error, refetch } = usePersonCapacity(personId, from, to);
  const weeks = weekColumns(from, to);

  const entries = useMemo(() => {
    const map = new Map<string, CapacityWeekEntry>();
    data?.entries.forEach((e) => map.set(e.week_key, e));
    return map;
  }, [data]);

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-k-text">Utilization</h2>
        <span className="text-xs text-k-text-muted">
          {from} → {to}
        </span>
      </div>

      {error ? (
        <ErrorState title="Failed to load utilization" message={error.message} retry={refetch} />
      ) : (
        <>
          <div className="mb-4 flex items-center gap-1 overflow-x-auto pb-2">
            {weeks.map((w) => {
              const e = entries.get(w);
              const flagged = e?.flags?.includes('no_available_capacity');
              const value = e ? e.utilization : 0;
              const display = e ? (flagged ? '∞' : `${Math.round(value)}%`) : '—';
              return (
                <div key={w} className="flex flex-col items-center gap-1">
                  <div
                    className={`flex h-10 w-12 items-center justify-center rounded-md text-xs font-medium ${
                      e ? heatClass(value, flagged) : 'bg-k-elevated text-k-text-muted'
                    }`}
                    title={e ? formatWeekRange(w) : `${w}: no data`}
                  >
                    {display}
                  </div>
                  <span className="text-[10px] text-k-text-muted">{shortWeekLabel(w)}</span>
                </div>
              );
            })}
          </div>

          {isLoading && (
            <div className="mb-4 flex items-center gap-2">
              <Spinner />
              <span className="text-sm text-k-text-secondary">Loading utilization...</span>
            </div>
          )}

          <div className="flex flex-wrap gap-3 text-xs text-k-text-secondary">
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded bg-k-success-bg ring-1 ring-inset ring-k-success-border" /> ≤85%
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded bg-k-warning-bg ring-1 ring-inset ring-k-warning-border" /> ≤100%
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded bg-k-risk-bg ring-1 ring-inset ring-k-risk-border" /> ≤125%
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded bg-k-danger-bg ring-1 ring-inset ring-k-danger-border" /> &gt;125%
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

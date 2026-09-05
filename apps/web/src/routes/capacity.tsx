import { useMemo, useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './layout';
import {
  PageHeader,
  Card,
  Button,
  Input,
  Select,
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
import { usePeople, type PersonWithRefs } from '../api/people';
import { useTeams } from '../api/teams';
import { useProjects } from '../api/projects';
import {
  useCapacity,
  type CapacityFilters,
  type CapacityPivot,
  type CapacityWeekEntry,
  type TeamWeekEntry,
  type ProjectWeekEntry,
  defaultCapacityRange,
  weekColumns,
  formatWeekRange,
  shortWeekLabel,
} from '../api/capacity';


export const capacityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/capacity',
  component: Capacity,
});

const PIVOT_LABELS: Record<CapacityPivot, string> = {
  people: 'People',
  teams: 'Teams',
  projects: 'Projects',
};

export default function Capacity() {
  const [pivot, setPivot] = useState<CapacityPivot>('people');
  const [{ from, to }, setRange] = useState(defaultCapacityRange);
  const [teamFilter, setTeamFilter] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  const filters: CapacityFilters = {
    from,
    to,
    team_id: pivot === 'people' ? teamFilter || undefined : undefined,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Capacity"
        subtitle="Weekly supply vs. demand by person, team, or project"
        actions={<CapacityLegend />}
      />

      <Card>
        <div className="flex flex-wrap items-end gap-5">
          <div className="flex gap-1 rounded-lg border border-k-border bg-k-elevated p-1">
            {(['people', 'teams', 'projects'] as const).map((p) => (
              <Button
                key={p}
                variant={pivot === p ? 'primary' : 'secondary'}
                onClick={() => {
                  setPivot(p);
                  setSelectedPersonId(null);
                }}
                className={pivot === p ? '' : 'border-transparent bg-transparent shadow-none hover:bg-k-surface'}
              >
                {PIVOT_LABELS[p]}
              </Button>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-k-text-secondary">From</label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-k-text-secondary">To</label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            />
          </div>

          {pivot === 'people' && <TeamFilter value={teamFilter} onChange={setTeamFilter} />}
        </div>
      </Card>

      {pivot === 'people' && (
        <PeopleCapacityGrid
          filters={filters}
          selectedPersonId={selectedPersonId}
          onSelectPerson={setSelectedPersonId}
        />
      )}
      {pivot === 'teams' && <TeamsCapacityGrid filters={filters} />}
      {pivot === 'projects' && <ProjectsCapacityGrid filters={filters} />}
    </div>
  );
}

function CapacityLegend() {
  return (
    <div className="hidden flex-wrap items-center gap-3 text-xs text-k-text-secondary xl:flex">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded bg-k-success-bg ring-1 ring-inset ring-k-success-border" /> ≤85%
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded bg-k-warning-bg ring-1 ring-inset ring-k-warning-border" /> ≤100%
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded bg-k-risk-bg ring-1 ring-inset ring-k-risk-border" /> ≤125%
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded bg-k-danger-bg ring-1 ring-inset ring-k-danger-border" /> &gt;125 / ∞
      </span>
    </div>
  );
}

function TeamFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: teams, isLoading } = useTeams();
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-k-text-secondary">Team</label>
      <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={isLoading}>
        <option value="">All teams</option>
        {teams?.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

type RowMap<T> = Map<
  string,
  {
    id: string;
    name: string;
    meta?: string;
    entries: Map<string, T>;
  }
>;

function heatClass(value: number, hasFlag?: boolean): string {
  if (hasFlag || !isFinite(value) || value > 125) return 'k-heat-critical';
  if (value <= 85) return 'k-heat-low';
  if (value <= 100) return 'k-heat-med';
  if (value <= 125) return 'k-heat-high';
  return 'k-heat-critical';
}

function NoFlag() {
  return <span className="text-k-text-muted">—</span>;
}

function SpinnerRow({ colSpan }: { colSpan: number }) {
  return (
    <TR>
      <TD colSpan={colSpan}>
        <div className="flex items-center gap-2 py-4">
          <Spinner />
          <span className="text-k-text-secondary">Loading capacity...</span>
        </div>
      </TD>
    </TR>
  );
}

function personMeta(person: PersonWithRefs | undefined, teams: { id: string; name: string }[]): string {
  if (!person) return '';
  const role = person.role_name;
  const teamNames = person.team_ids
    .map((id) => teams.find((t) => t.id === id)?.name)
    .filter(Boolean)
    .join(', ');
  if (role && teamNames) return `${role} · ${teamNames}`;
  return role || teamNames || '';
}

function PeopleCapacityGrid({
  filters,
  selectedPersonId,
  onSelectPerson,
}: {
  filters: CapacityFilters;
  selectedPersonId: string | null;
  onSelectPerson: (id: string | null) => void;
}) {
  const { data, isLoading, error, refetch } = useCapacity<CapacityWeekEntry>('people', filters);
  const { data: people } = usePeople({ limit: 1000 });
  const { data: teams } = useTeams();

  const peopleMap = useMemo(() => {
    const map = new Map(people?.items.map((p) => [p.id, p]) ?? []);
    return map;
  }, [people]);

  const columns = useMemo(() => weekColumns(filters.from, filters.to), [filters.from, filters.to]);

  const rows = useMemo(() => {
    const map: RowMap<CapacityWeekEntry> = new Map();
    if (!data) return map;
    for (const entry of data.entries) {
      let row = map.get(entry.person_id);
      if (!row) {
        const person = peopleMap.get(entry.person_id);
        row = {
          id: entry.person_id,
          name: person?.name ?? entry.person_id,
          meta: personMeta(person, teams ?? []),
          entries: new Map(),
        };
        map.set(entry.person_id, row);
      }
      row.entries.set(entry.week_key, entry);
    }
    return new Map([...map.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)));
  }, [data, peopleMap, teams]);

  if (error) return <ErrorState title="Failed to load capacity" message={error.message} retry={refetch} />;

  const selectedRow = selectedPersonId ? rows.get(selectedPersonId) : undefined;

  return (
    <>
      <Card className="p-0 overflow-hidden">
        <Table>
          <THead>
            <tr>
              <TH className="min-w-[14rem]">Person</TH>
              {columns.map((w) => (
                <TH key={w} className="w-16 text-center" title={formatWeekRange(w)}>
                  {shortWeekLabel(w)}
                </TH>
              ))}
            </tr>
          </THead>
          <tbody>
            {isLoading ? (
              <SpinnerRow colSpan={columns.length + 1} />
            ) : rows.size === 0 ? (
              <TR>
                <TD colSpan={columns.length + 1}>
                  <EmptyState title="No capacity data" message="Adjust the date range or filters." />
                </TD>
              </TR>
            ) : (
              Array.from(rows.values()).map((row) => (
                <TR
                  key={row.id}
                  className={selectedPersonId === row.id ? 'bg-k-elevated' : undefined}
                  onClick={() => onSelectPerson(selectedPersonId === row.id ? null : row.id)}
                >
                  <TD>
                    <div className="font-medium text-k-text">{row.name}</div>
                    {row.meta && <div className="text-xs text-k-text-muted">{row.meta}</div>}
                  </TD>
                  {columns.map((w) => {
                    const entry = row.entries.get(w);
                    if (!entry)
                      return (
                        <TD key={w} className="text-center">
                          <NoFlag />
                        </TD>
                      );
                    const flagged = entry.flags?.includes('no_available_capacity');
                    const display = flagged ? '∞' : `${Math.round(entry.utilization)}%`;
                    return (
                      <TD key={w} className={`text-center ${heatClass(entry.utilization, flagged)}`}>
                        <span title={`${formatWeekRange(w)}${flagged ? ' · no available capacity' : ''}`}>{display}</span>
                      </TD>
                    );
                  })}
                </TR>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      {selectedRow && (
        <MathPanel title={selectedRow.name} entries={selectedRow.entries} columns={columns} />
      )}
    </>
  );
}

function TeamsCapacityGrid({ filters }: { filters: CapacityFilters }) {
  const { data, isLoading, error, refetch } = useCapacity<TeamWeekEntry>('teams', filters);
  const { data: teams } = useTeams();

  const names = useMemo(() => {
    const map = new Map(teams?.map((t) => [t.id, t.name]) ?? []);
    return map;
  }, [teams]);

  const columns = useMemo(() => weekColumns(filters.from, filters.to), [filters.from, filters.to]);

  const rows = useMemo(() => {
    const map: RowMap<TeamWeekEntry> = new Map();
    if (!data) return map;
    for (const entry of data.entries) {
      let row = map.get(entry.team_id);
      if (!row) {
        const name = names.get(entry.team_id) ?? entry.team_id;
        row = { id: entry.team_id, name: `${name} (${entry.member_count})`, entries: new Map() };
        map.set(entry.team_id, row);
      }
      row.entries.set(entry.week_key, entry);
    }
    return new Map([...map.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)));
  }, [data, names]);

  if (error) return <ErrorState title="Failed to load capacity" message={error.message} retry={refetch} />;

  return (
    <Card className="p-0 overflow-hidden">
      <Table>
        <THead>
          <tr>
            <TH className="min-w-[14rem]">Team</TH>
            {columns.map((w) => (
              <TH key={w} className="w-16 text-center" title={formatWeekRange(w)}>
                {shortWeekLabel(w)}
              </TH>
            ))}
          </tr>
        </THead>
        <tbody>
          {isLoading ? (
            <SpinnerRow colSpan={columns.length + 1} />
          ) : rows.size === 0 ? (
            <TR>
              <TD colSpan={columns.length + 1}>
                <EmptyState title="No team capacity data" message="Adjust the date range or filters." />
              </TD>
            </TR>
          ) : (
            Array.from(rows.values()).map((row) => (
              <TR key={row.id}>
                <TD className="font-medium text-k-text">{row.name}</TD>
                {columns.map((w) => {
                  const entry = row.entries.get(w);
                  if (!entry)
                    return (
                      <TD key={w} className="text-center">
                        <NoFlag />
                      </TD>
                    );
                  const flagged = entry.flags?.includes('no_available_capacity');
                  const display = flagged ? '∞' : `${Math.round(entry.utilization)}%`;
                  return (
                    <TD key={w} className={`text-center ${heatClass(entry.utilization, flagged)}`}>
                      <span title={formatWeekRange(w)}>{display}</span>
                    </TD>
                  );
                })}
              </TR>
            ))
          )}
        </tbody>
      </Table>
    </Card>
  );
}

function ProjectsCapacityGrid({ filters }: { filters: CapacityFilters }) {
  const { data, isLoading, error, refetch } = useCapacity<ProjectWeekEntry>('projects', filters);
  const { data: projects } = useProjects({ limit: 1000 });

  const names = useMemo(() => {
    const map = new Map(projects?.items.map((p) => [p.id, `${p.code} — ${p.name}`]) ?? []);
    return map;
  }, [projects]);

  const columns = useMemo(() => weekColumns(filters.from, filters.to), [filters.from, filters.to]);

  const rows = useMemo(() => {
    const map: RowMap<ProjectWeekEntry> = new Map();
    if (!data) return map;
    for (const entry of data.entries) {
      let row = map.get(entry.project_id);
      if (!row) {
        row = { id: entry.project_id, name: names.get(entry.project_id) ?? entry.project_id, entries: new Map() };
        map.set(entry.project_id, row);
      }
      row.entries.set(entry.week_key, entry);
    }
    return new Map([...map.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)));
  }, [data, names]);

  if (error) return <ErrorState title="Failed to load capacity" message={error.message} retry={refetch} />;

  return (
    <Card className="p-0 overflow-hidden">
      <Table>
        <THead>
          <tr>
            <TH className="min-w-[14rem]">Project</TH>
            {columns.map((w) => (
              <TH key={w} className="w-20 text-center" title={formatWeekRange(w)}>
                {shortWeekLabel(w)}
              </TH>
            ))}
          </tr>
        </THead>
        <tbody>
          {isLoading ? (
            <SpinnerRow colSpan={columns.length + 1} />
          ) : rows.size === 0 ? (
            <TR>
              <TD colSpan={columns.length + 1}>
                <EmptyState title="No project demand data" message="Adjust the date range or filters." />
              </TD>
            </TR>
          ) : (
            Array.from(rows.values()).map((row) => (
              <TR key={row.id}>
                <TD className="font-medium text-k-text">{row.name}</TD>
                {columns.map((w) => {
                  const entry = row.entries.get(w);
                  if (!entry)
                    return (
                      <TD key={w} className="text-center">
                        <NoFlag />
                      </TD>
                    );
                  const load = projectLoad(entry);
                  return (
                    <TD key={w} className={`text-center ${load > 100 ? 'k-heat-critical' : load >= 85 ? 'k-heat-med' : 'k-heat-low'}`}>
                      <span title={formatWeekRange(w)}>
                        {Math.round(entry.planned_h)} ({entry.person_count})
                      </span>
                    </TD>
                  );
                })}
              </TR>
            ))
          )}
        </tbody>
      </Table>
    </Card>
  );
}

function projectLoad(entry: ProjectWeekEntry): number {
  if (entry.planned_h <= 0) return 0;
  if (entry.person_count <= 0) return 999;
  return (entry.planned_h / entry.person_count / 40) * 100;
}

function MathPanel({
  title,
  entries,
  columns,
}: {
  title: string;
  entries: Map<string, CapacityWeekEntry>;
  columns: string[];
}) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-k-text">The math — {title}</h2>
        <span className="text-xs text-k-text-muted">gross − PTO − overhead = available</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {columns.map((w) => {
          const e = entries.get(w);
          if (!e) {
            return (
              <div key={w} className="rounded-md border border-k-border bg-k-elevated/50 p-3">
                <p className="text-xs font-medium text-k-text-muted">{formatWeekRange(w)}</p>
                <p className="mt-1 text-sm text-k-text-muted">No data</p>
              </div>
            );
          }
          const flagged = e.flags?.includes('no_available_capacity');
          return (
            <div key={w} className="rounded-md border border-k-border bg-k-elevated/50 p-3">
              <p className="text-xs font-medium text-k-text-muted">{formatWeekRange(w)}</p>
              <p className="mt-2 text-sm text-k-text-secondary">
                {Math.round(e.gross_h)} − {Math.round(e.pto_h)} − {Math.round(e.overhead_h)} ={' '}
                <span className="font-semibold text-k-text">{Math.round(e.available_h)}h</span>
              </p>
              <p className="mt-1 text-sm text-k-text-secondary">
                Planned: <span className="font-semibold text-k-text">{Math.round(e.planned_h)}h</span>
              </p>
              <p className="mt-1 text-sm text-k-text-secondary">
                Utilization:{' '}
                <span className="font-semibold text-k-text">
                  {flagged ? '∞' : `${Math.round(e.utilization)}%`}
                </span>
              </p>
              {e.flags && e.flags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {e.flags.map((f) => (
                    <Badge key={f} tone="warning">
                      {f}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

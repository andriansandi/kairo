import { createRoute } from '@tanstack/react-router';
import { settingsRoute } from './layout';
import { useState } from 'react';
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
} from '../../components/ui';
import { useTeams, useCreateTeam, useAddTeamMember, useRemoveTeamMember, type CreateTeamBody, type TeamWithMembers } from '../../api/teams';
import { usePeople } from '../../api/people';
import type { TeamType } from '@kairo/types';

export const settingsTeamsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/teams',
  component: TeamsSettings,
});

const TEAM_TYPES: { value: TeamType; label: string }[] = [
  { value: 'builder', label: 'Builder' },
  { value: 'devops', label: 'DevOps' },
  { value: 'other', label: 'Other' },
];

function TeamsSettings() {
  return (
    <div>
      <PageHeader title="Teams" subtitle="Create teams and manage membership" />
      <TeamList />
      <CreateTeamForm />
    </div>
  );
}

function TeamList() {
  const { data: teams, isLoading, error, refetch } = useTeams();
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  if (error) {
    return <ErrorState title="Failed to load teams" message={error.message} retry={refetch} />;
  }

  return (
    <Card className="mb-6 p-0 overflow-hidden">
      <Table>
        <THead>
          <tr>
            <TH>Name</TH>
            <TH>Type</TH>
            <TH>Members</TH>
            <TH />
          </tr>
        </THead>
        <tbody className="divide-y divide-slate-200">
          {isLoading ? (
            <TR>
              <TD colSpan={4}>
                <div className="flex items-center gap-2 py-4">
                  <Spinner />
                  <span className="text-slate-500">Loading teams...</span>
                </div>
              </TD>
            </TR>
          ) : !teams || teams.length === 0 ? (
            <TR>
              <TD colSpan={4}>
                <EmptyState title="No teams yet" message="Create a team to get started." />
              </TD>
            </TR>
          ) : (
            teams.map((team) => (
              <TeamRow
                key={team.id}
                team={team}
                expanded={expandedTeamId === team.id}
                onToggle={() => setExpandedTeamId((id) => (id === team.id ? null : team.id))}
              />
            ))
          )}
        </tbody>
      </Table>
    </Card>
  );
}

function TeamRow({
  team,
  expanded,
  onToggle,
}: {
  team: TeamWithMembers;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TR>
        <TD className="font-medium text-slate-900">{team.name}</TD>
        <TD>
          <Badge
            tone={
              team.type === 'builder'
                ? 'success'
                : team.type === 'devops'
                  ? 'warning'
                  : 'neutral'
            }
          >
            {team.type}
          </Badge>
        </TD>
        <TD>{team.member_ids.length}</TD>
        <TD>
          <Button variant="secondary" onClick={onToggle}>
            {expanded ? 'Close' : 'Manage'}
          </Button>
        </TD>
      </TR>
      {expanded && (
        <TR>
          <TD colSpan={4} className="bg-slate-50 p-0">
            <TeamMemberManager teamId={team.id} memberIds={team.member_ids} />
          </TD>
        </TR>
      )}
    </>
  );
}

function TeamMemberManager({ teamId, memberIds }: { teamId: string; memberIds: string[] }) {
  const { data: people } = usePeople({ limit: 1000 });
  const add = useAddTeamMember();
  const remove = useRemoveTeamMember();
  const [selectedPersonId, setSelectedPersonId] = useState('');

  const personMap = new Map(people?.items.map((p) => [p.id, p.name]) ?? []);
  const nonMembers = people?.items.filter((p) => !memberIds.includes(p.id)) ?? [];

  const addMember = () => {
    if (!selectedPersonId) return;
    add.mutate({ teamId, personId: selectedPersonId }, { onSuccess: () => setSelectedPersonId('') });
  };

  return (
    <div className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Members</h3>
      {memberIds.length === 0 ? (
        <p className="mb-4 text-sm text-slate-500">No members yet.</p>
      ) : (
        <ul className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {memberIds.map((id) => (
            <li
              key={id}
              className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <span className="truncate" title={id}>
                {personMap.get(id) ?? id}
              </span>
              <button
                onClick={() => remove.mutate({ teamId, personId: id })}
                className="ml-2 text-xs font-medium text-red-600 hover:text-red-700"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Select
          value={selectedPersonId}
          onChange={(e) => setSelectedPersonId(e.target.value)}
          className="w-64"
        >
          <option value="">Select person</option>
          {nonMembers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Button onClick={addMember} disabled={!selectedPersonId || add.isPending}>
          {add.isPending ? 'Adding...' : 'Add member'}
        </Button>
      </div>
    </div>
  );
}

function CreateTeamForm() {
  const create = useCreateTeam();
  const [form, setForm] = useState<CreateTeamBody>({ name: '', type: 'builder' });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(form, { onSuccess: () => setForm({ name: '', type: 'builder' }) });
  };

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Create team</h2>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
          <Input
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
          <Select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as TeamType }))}
          >
            {TEAM_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Saving...' : 'Create team'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

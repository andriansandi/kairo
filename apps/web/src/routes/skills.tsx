import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './layout';
import { useState } from 'react';
import {
  PageHeader,
  Card,
  Button,
  Input,
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
import { useSkills, useCreateSkill, useUpdateSkill, type CreateSkillBody } from '../api/skills';
import { useCoverage, type SkillCoverage } from '../api/coverage';
import type { Skill } from '@kairo/types';

export const skillsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/skills',
  component: Skills,
});

function Skills() {
  const [q, setQ] = useState('');
  const { data, isLoading, error, refetch } = useSkills(q);

  return (
    <div>
      <PageHeader title="Skills" subtitle="Browse and manage the skills catalog" />

      <div className="mb-6 flex flex-wrap gap-3">
        <Input
          placeholder="Search skills"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-72"
        />
      </div>

      {error ? (
        <ErrorState title="Failed to load skills" message={error.message} retry={refetch} />
      ) : (
        <Card className="mb-6 p-0 overflow-hidden">
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Category</TH>
                <TH>Aliases</TH>
                <TH />
              </tr>
            </THead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <TR>
                  <TD colSpan={4}>
                    <div className="flex items-center gap-2 py-4">
                      <Spinner />
                      <span className="text-slate-500">Loading skills...</span>
                    </div>
                  </TD>
                </TR>
              ) : !data || data.length === 0 ? (
                <TR>
                  <TD colSpan={4}>
                    <EmptyState title="No skills found" message="Add the first skill or try another search." />
                  </TD>
                </TR>
              ) : (
                data.map((skill) => <SkillRow key={skill.id} skill={skill} />)
              )}
            </tbody>
          </Table>
        </Card>
      )}

      <AddSkillForm />
      <CoverageSection />
    </div>
  );
}

function SkillRow({ skill }: { skill: Skill }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<CreateSkillBody>({
    name: skill.name,
    category: skill.category,
    aliases: skill.aliases,
  });
  const update = useUpdateSkill();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      { skillId: skill.id, body: form },
      { onSuccess: () => setEditing(false) },
    );
  };

  if (editing) {
    return (
      <TR>
        <TD>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </TD>
        <TD>
          <Input
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          />
        </TD>
        <TD>
          <Input
            value={(form.aliases ?? []).join(', ')}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                aliases: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
              }))
            }
          />
        </TD>
        <TD>
          <div className="flex gap-2">
            <Button type="button" onClick={save} disabled={update.isPending}>
              {update.isPending ? 'Saving...' : 'Save'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </TD>
      </TR>
    );
  }

  return (
    <TR>
      <TD className="font-medium text-slate-900">{skill.name}</TD>
      <TD>{skill.category}</TD>
      <TD>
        {skill.aliases.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {skill.aliases.map((a) => (
              <Badge key={a} tone="neutral">
                {a}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </TD>
      <TD>
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </TD>
    </TR>
  );
}

function AddSkillForm() {
  const create = useCreateSkill();
  const [form, setForm] = useState<CreateSkillBody>({ name: '', category: '', aliases: [] });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(form, { onSuccess: () => setForm({ name: '', category: '', aliases: [] }) });
  };

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Add skill</h2>
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
          <label className="mb-1 block text-xs font-medium text-slate-600">Category</label>
          <Input
            required
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Aliases</label>
          <Input
            placeholder="comma, separated"
            value={(form.aliases ?? []).join(', ')}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                aliases: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
              }))
            }
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Saving...' : 'Add skill'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function CoverageSection() {
  const { data, isLoading, error, refetch } = useCoverage();

  return (
    <Card className="mt-6">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Coverage</h2>
      {error ? (
        <ErrorState title="Failed to load coverage" message={error.message} retry={refetch} />
      ) : isLoading ? (
        <div className="flex items-center gap-2 py-4 text-slate-500">
          <Spinner />
          <span>Loading coverage…</span>
        </div>
      ) : !data || data.coverage.length === 0 ? (
        <EmptyState title="No coverage data" message="Add people and skills to see coverage." />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>Skill</TH>
                <TH className="text-center">L1 Novice</TH>
                <TH className="text-center">L2 Intermediate</TH>
                <TH className="text-center">L3 Advanced</TH>
                <TH className="text-center">L4 Expert</TH>
                <TH className="text-center">Total people</TH>
                <TH className="text-right">Free hours</TH>
                <TH />
              </tr>
            </THead>
            <tbody className="divide-y divide-slate-200">
              {data.coverage.map((row) => (
                <CoverageRow key={row.skill_id} row={row} />
              ))}
            </tbody>
          </Table>
          <p className="mt-4 text-xs text-slate-500">
            SPOF = exactly one person at Advanced+ for this skill (see Conflicts for the full C8 risk).
          </p>
        </>
      )}
    </Card>
  );
}

function CoverageRow({ row }: { row: SkillCoverage }) {
  return (
    <TR>
      <TD className="font-medium text-slate-900">{row.skill_name}</TD>
      <TD className="text-center">{row.level_counts[0]}</TD>
      <TD className="text-center">{row.level_counts[1]}</TD>
      <TD className="text-center">{row.level_counts[2]}</TD>
      <TD className="text-center">{row.level_counts[3]}</TD>
      <TD className="text-center">{row.total_people}</TD>
      <TD className="text-right">{row.free_hours}</TD>
      <TD className="text-right">
        {row.spof && <Badge tone="danger">SPOF</Badge>}
      </TD>
    </TR>
  );
}

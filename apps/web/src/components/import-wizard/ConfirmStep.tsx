import { useEffect, useMemo, useState } from 'react';
import { Button, Card, ErrorState, Input, Select, Spinner, Badge } from '../ui';
import {
  useConfirmImport,
  useImport,
  usePeopleForImport,
  useProjectsForImport,
  type ConfirmImportBody,
  type ConfirmImportResult,
  type PersonMapping,
  type ProjectMapping,
} from '../../api/imports';
import type { Person, Project } from '@kairo/types';
import type { TimelineImportRow } from './parse';
import { SearchableSelect } from './SearchableSelect';

interface ConfirmStepProps {
  importId: string;
  rows: TimelineImportRow[];
  onClose: () => void;
}

function projectKey(row: TimelineImportRow): string {
  return `${row.project_code ?? ''}|||${row.project_name}`;
}

function projectFromKey(key: string): { code?: string; name: string } {
  const [code, name] = key.split('|||');
  return { code: code || undefined, name };
}

function personKey(row: TimelineImportRow): string {
  return `${row.person_email ?? ''}|||${row.person_name ?? ''}`;
}

function personFromKey(key: string): { email?: string; name?: string } {
  const [email, name] = key.split('|||');
  return { email: email || undefined, name: name || undefined };
}

function bestProject(name: string, projects: Project[]): Project | null {
  const lower = name.toLowerCase();
  const exact = projects.find((p) => p.name.toLowerCase() === lower);
  if (exact) return exact;
  return projects.find((p) => p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase())) ?? null;
}

function bestPerson(email: string | undefined, name: string | undefined, people: Person[]): Person | null {
  if (email) {
    const exact = people.find((p) => p.email.toLowerCase() === email.toLowerCase());
    if (exact) return exact;
  }
  if (!name) return null;
  const lower = name.toLowerCase();
  return people.find((p) => p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase())) ?? null;
}

export function ConfirmStep({ importId, rows, onClose }: ConfirmStepProps) {
  const importQuery = useImport(importId);
  const projectsQuery = useProjectsForImport('');
  const peopleQuery = usePeopleForImport('');
  const confirm = useConfirmImport();
  const [done, setDone] = useState<ConfirmImportResult | null>(null);
  const [projectMappings, setProjectMappings] = useState<ProjectMapping[]>([]);
  const [personMappings, setPersonMappings] = useState<PersonMapping[]>([]);
  const [projectQueries, setProjectQueries] = useState<Record<string, string>>({});
  const [personQueries, setPersonQueries] = useState<Record<string, string>>({});

  const distinctProjects = useMemo(() => {
    const map = new Map<string, { code?: string; name: string }>();
    for (const row of rows) {
      const key = projectKey(row);
      if (!map.has(key)) {
        map.set(key, projectFromKey(key));
      }
    }
    return Array.from(map.entries()).map(([key, value]) => ({ key, ...value }));
  }, [rows]);

  const distinctPeople = useMemo(() => {
    const map = new Map<string, { email?: string; name?: string }>();
    for (const row of rows) {
      const key = personKey(row);
      if (!map.has(key)) {
        map.set(key, personFromKey(key));
      }
    }
    return Array.from(map.entries()).map(([key, value]) => ({ key, ...value }));
  }, [rows]);

  useEffect(() => {
    if (projectsQuery.data && peopleQuery.data) {
      const projects = projectsQuery.data.items;
      const people = peopleQuery.data.items;

      setProjectMappings(
        distinctProjects.map((p) => {
          const match = bestProject(p.name, projects);
          if (match) {
            return { key: p.key, action: 'link', project_id: match.id };
          }
          return { key: p.key, action: 'create', code: p.code, name: p.name };
        }),
      );

      setPersonMappings(
        distinctPeople.map((p) => {
          if (!p.email && !p.name) {
            return { key: p.key, action: 'skip' };
          }
          const match = bestPerson(p.email, p.name, people);
          if (match) {
            return { key: p.key, action: 'link', person_id: match.id };
          }
          return { key: p.key, action: 'create', email: p.email, name: p.name };
        }),
      );
    }
  }, [distinctProjects, distinctPeople, projectsQuery.data, peopleQuery.data]);

  const updateProject = (key: string, patch: Partial<ProjectMapping>) => {
    setProjectMappings((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  };

  const updatePerson = (key: string, patch: Partial<PersonMapping>) => {
    setPersonMappings((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  };

  const canConfirm =
    projectMappings.length > 0 &&
    projectMappings.every((m) => {
      if (m.action === 'link') return !!m.project_id;
      if (m.action === 'create') return !!m.name;
      return false;
    }) &&
    personMappings.every((m) => {
      if (m.action === 'link') return !!m.person_id;
      if (m.action === 'create') return !!m.name;
      return m.action === 'skip';
    });

  const handleConfirm = () => {
    const body: ConfirmImportBody = {
      project_mappings: projectMappings,
      person_mappings: personMappings,
    };
    confirm.mutate(
      { id: importId, body },
      {
        onSuccess: (data) => setDone(data),
      },
    );
  };

  const isLoading = projectsQuery.isLoading || peopleQuery.isLoading || importQuery.isLoading;

  const projectOptions =
    projectsQuery.data?.items.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` })) ?? [];
  const peopleOptions = peopleQuery.data?.items.map((p) => ({ value: p.id, label: `${p.name} <${p.email}>` })) ?? [];

  if (done) {
    return (
      <Card>
        <div className="rounded border border-emerald-200 bg-emerald-50 p-6 text-center">
          <h2 className="text-lg font-semibold text-emerald-900">Import confirmed</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded bg-white p-3">
              <div className="text-2xl font-bold text-slate-900">{done.projects_linked}</div>
              <div className="text-xs text-slate-600">Projects linked</div>
            </div>
            <div className="rounded bg-white p-3">
              <div className="text-2xl font-bold text-slate-900">{done.projects_created}</div>
              <div className="text-xs text-slate-600">Projects created</div>
            </div>
            <div className="rounded bg-white p-3">
              <div className="text-2xl font-bold text-slate-900">{done.phases_created}</div>
              <div className="text-xs text-slate-600">Phases created</div>
            </div>
            <div className="rounded bg-white p-3">
              <div className="text-2xl font-bold text-slate-900">{done.allocations_created}</div>
              <div className="text-xs text-slate-600">Allocations created</div>
            </div>
            <div className="rounded bg-white p-3">
              <div className="text-2xl font-bold text-slate-900">{done.rows_skipped}</div>
              <div className="text-xs text-slate-600">Rows skipped</div>
            </div>
          </div>
          <Button className="mt-6" onClick={onClose}>
            Back to imports
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold text-slate-900">5. Confirm mappings</h2>
      <p className="mb-4 text-sm text-slate-600">
        Match projects and people from the file to existing KAIRO records, or create new ones.
      </p>

      {importQuery.error && <ErrorState message={importQuery.error.message} />}
      {confirm.error && (
        <div className="mb-4">
          <ErrorState title="Confirm failed" message={confirm.error.message} />
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Spinner />
          Loading draft and reference data...
        </div>
      ) : (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              Projects <Badge tone="neutral">{distinctProjects.length}</Badge>
            </h3>
            <div className="space-y-3">
              {distinctProjects.map((p) => {
                const mapping = projectMappings.find((m) => m.key === p.key);
                if (!mapping) return null;
                return (
                  <div key={p.key} className="rounded border border-slate-200 p-3">
                    <div className="mb-2 text-sm font-medium text-slate-800">
                      {p.code ? `${p.code} — ` : ''}
                      {p.name}
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Select
                        value={mapping.action}
                        onChange={(e) =>
                          updateProject(p.key, {
                            action: e.target.value as 'link' | 'create',
                          })
                        }
                      >
                        <option value="link">Link existing project</option>
                        <option value="create">Create new project</option>
                      </Select>
                      {mapping.action === 'link' && (
                        <SearchableSelect
                          options={projectOptions}
                          value={mapping.project_id ?? ''}
                          onChange={(value) => updateProject(p.key, { project_id: value })}
                          query={projectQueries[p.key] ?? ''}
                          onQueryChange={(q) => setProjectQueries((prev) => ({ ...prev, [p.key]: q }))}
                          placeholder="Search projects"
                        />
                      )}
                      {mapping.action === 'create' && (
                        <div className="flex gap-2">
                          <Input
                            value={mapping.code ?? p.code ?? ''}
                            onChange={(e) => updateProject(p.key, { code: e.target.value })}
                            placeholder="Code"
                            className="w-1/3"
                          />
                          <Input
                            value={mapping.name ?? p.name}
                            onChange={(e) => updateProject(p.key, { name: e.target.value })}
                            placeholder="Name"
                            className="flex-1"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              People <Badge tone="neutral">{distinctPeople.length}</Badge>
            </h3>
            <div className="space-y-3">
              {distinctPeople.map((p) => {
                const mapping = personMappings.find((m) => m.key === p.key);
                if (!mapping) return null;
                return (
                  <div key={p.key} className="rounded border border-slate-200 p-3">
                    <div className="mb-2 text-sm font-medium text-slate-800">
                      {p.name || '(unnamed)'}
                      {p.email ? ` <${p.email}>` : ''}
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Select
                        value={mapping.action}
                        onChange={(e) =>
                          updatePerson(p.key, {
                            action: e.target.value as 'link' | 'create' | 'skip',
                          })
                        }
                      >
                        <option value="link">Link existing person</option>
                        <option value="create">Create new person</option>
                        <option value="skip">Skip</option>
                      </Select>
                      {mapping.action === 'link' && (
                        <SearchableSelect
                          options={peopleOptions}
                          value={mapping.person_id ?? ''}
                          onChange={(value) => updatePerson(p.key, { person_id: value })}
                          query={personQueries[p.key] ?? ''}
                          onQueryChange={(q) => setPersonQueries((prev) => ({ ...prev, [p.key]: q }))}
                          placeholder="Search people"
                        />
                      )}
                      {mapping.action === 'create' && (
                        <div className="flex gap-2">
                          <Input
                            value={mapping.name ?? p.name ?? ''}
                            onChange={(e) => updatePerson(p.key, { name: e.target.value })}
                            placeholder="Name"
                            className="flex-1"
                          />
                          <Input
                            value={mapping.email ?? p.email ?? ''}
                            onChange={(e) => updatePerson(p.key, { email: e.target.value })}
                            placeholder="Email"
                            className="flex-1"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {!canConfirm && (
            <p className="text-sm text-amber-700">
              Complete all required selections before confirming.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={confirm.isPending}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={!canConfirm || confirm.isPending}>
              {confirm.isPending ? 'Confirming...' : 'Confirm import'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

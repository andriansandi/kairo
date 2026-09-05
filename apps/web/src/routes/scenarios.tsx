import { useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import type { Person, Project, Skill, WorkItem } from '@kairo/types';
import { rootRoute } from './layout';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
  Table,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui';
import {
  useDeleteScenario,
  useRecomputeScenario,
  useScenario,
  useScenarios,
} from '../api/scenarios';
import { useProjects } from '../api/projects';
import { usePeople } from '../api/people';
import { useSkills } from '../api/skills';
import { useWorkItems } from '../api/work-items';
import { DiffView, ScenarioBuilder } from '../components/scenario-builder';
import { formatOp } from '../components/scenario-builder/utils';

function statusTone(
  status: string,
): 'neutral' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'saved':
      return 'success';
    case 'shared':
      return 'warning';
    case 'archived':
      return 'neutral';
    default:
      return 'neutral';
  }
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function ScenariosPage() {
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const scenarios = useScenarios();
  const projects = useProjects({ limit: 1000 });
  const people = usePeople({ limit: 1000 });
  const skills = useSkills();
  const workItems = useWorkItems({ limit: 1000 });

  return (
    <div>
      <PageHeader
        title="Scenarios"
        subtitle="What-if simulations against the current snapshot"
        actions={
          <Button onClick={() => setShowBuilder((s) => !s)}>
            {showBuilder ? 'Close builder' : 'New scenario'}
          </Button>
        }
      />

      <p className="mb-6 text-sm text-slate-600">
        Scenarios never touch live data — applying changes is a human decision.
      </p>

      {showBuilder &&
        projects.data &&
        people.data &&
        skills.data &&
        workItems.data && (
          <div className="mb-8">
            <ScenarioBuilder
              projects={projects.data.items}
              people={people.data.items}
              skills={skills.data}
              workItems={workItems.data.items}
              onCancel={() => setShowBuilder(false)}
              onCreated={(id) => {
                setShowBuilder(false);
                setSelectedId(id);
              }}
            />
          </div>
        )}

      <Card>
        <ScenariosList
          scenarios={scenarios}
          projects={projects.data?.items ?? []}
          people={people.data?.items ?? []}
          skills={skills.data ?? []}
          workItems={workItems.data?.items ?? []}
          loading={
            scenarios.isLoading || projects.isLoading || people.isLoading || skills.isLoading
          }
          error={scenarios.error ?? projects.error ?? people.error ?? skills.error}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </Card>

      {selectedId && (
        <div className="mt-8">
          <ScenarioDetail
            id={selectedId}
            projects={projects.data?.items ?? []}
            people={people.data?.items ?? []}
            skills={skills.data ?? []}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}
    </div>
  );
}

interface ScenariosListProps {
  scenarios: ReturnType<typeof useScenarios>;
  projects: Project[];
  people: Person[];
  skills: Skill[];
  workItems: WorkItem[];
  loading: boolean;
  error: Error | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function ScenariosList({
  scenarios,
  projects,
  people,
  skills,
  workItems,
  loading,
  error,
  selectedId,
  onSelect,
}: ScenariosListProps) {
  const recompute = useRecomputeScenario();
  const remove = useDeleteScenario();

  if (error) {
    return <ErrorState title="Failed to load scenarios" message={error.message} retry={() => scenarios.refetch()} />;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-8 text-slate-500">
        <Spinner />
        <span>Loading scenarios…</span>
      </div>
    );
  }

  const items = scenarios.data?.items ?? [];

  if (items.length === 0) {
    return (
      <EmptyState
        title="No scenarios yet"
        message="Create a what-if scenario to compare against the current snapshot."
      />
    );
  }

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Delete scenario "${name}"?`)) {
      remove.mutate(id, {
        onSuccess: () => {
          if (selectedId === id) onSelect(null);
        },
      });
    }
  };

  return (
    <Table>
      <THead>
        <TR>
          <TH>Name</TH>
          <TH>Base snapshot</TH>
          <TH>Ops</TH>
          <TH>Status</TH>
          <TH>Created</TH>
          <TH>Actions</TH>
        </TR>
      </THead>
      <tbody className="divide-y divide-slate-200">
        {items.map((s) => (
          <TR key={s.id}>
            <TD>
              <button
                onClick={() => onSelect(selectedId === s.id ? null : s.id)}
                className="font-medium text-slate-900 hover:underline"
              >
                {s.name}
              </button>
            </TD>
            <TD className="font-mono text-xs">{s.base_snapshot_id}</TD>
            <TD>{s.ops.length}</TD>
            <TD>
              <Badge tone={statusTone(s.status)}>{s.status}</Badge>
            </TD>
            <TD>{formatTimestamp(s.created_at)}</TD>
            <TD>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  className="text-xs"
                  onClick={() => recompute.mutate(s.id)}
                  disabled={recompute.isPending}
                >
                  {recompute.isPending ? <Spinner className="h-3 w-3" /> : 'Recompute'}
                </Button>
                <Button
                  variant="danger"
                  className="text-xs"
                  onClick={() => handleDelete(s.id, s.name)}
                  disabled={remove.isPending}
                >
                  Delete
                </Button>
              </div>
            </TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}

interface ScenarioDetailProps {
  id: string;
  projects: Project[];
  people: Person[];
  skills: Skill[];
  onClose: () => void;
}

function ScenarioDetail({ id, projects, people, skills, onClose }: ScenarioDetailProps) {
  const { data, isLoading, error, refetch } = useScenario(id);

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          {data?.scenario.name ?? 'Scenario'}
        </h2>
        <button onClick={onClose} className="text-sm font-medium text-slate-600 hover:text-slate-900">
          Close
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-3 py-6 text-slate-500">
          <Spinner />
          <span>Loading scenario…</span>
        </div>
      )}

      {error && <ErrorState title="Failed to load scenario" message={error.message} retry={refetch} />}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</dt>
              <dd className="mt-1">
                <Badge tone={statusTone(data.scenario.status)}>{data.scenario.status}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Base snapshot</dt>
              <dd className="mt-1 text-sm text-slate-700">{data.scenario.base_snapshot_id}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Operations</dt>
              <dd className="mt-1 text-sm text-slate-700">{data.scenario.ops.length}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Created</dt>
              <dd className="mt-1 text-sm text-slate-700">{formatTimestamp(data.scenario.created_at)}</dd>
            </div>
          </div>

          {data.scenario.ops.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Operations</h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
                {data.scenario.ops.map((op, i) => (
                  <li key={i}>{formatOp(op, { projects, people, skills, workItems: [] })}</li>
                ))}
              </ol>
            </div>
          )}

          {data.diff ? (
            <DiffView diff={data.diff} projects={projects} people={people} />
          ) : (
            <EmptyState title="No diff" message="Recompute this scenario to generate the impact report." />
          )}
        </div>
      )}
    </Card>
  );
}

export const scenariosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/scenarios',
  component: ScenariosPage,
});

import { useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import { toast } from 'sonner';
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
import { ConfirmDialog } from '@/components/shadcn/confirm-dialog';
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

function statusTone(status: string): 'neutral' | 'success' | 'warning' | 'danger' {
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
    <div className="space-y-6">
      <PageHeader
        title="Scenarios"
        subtitle="What-if simulations against the current snapshot"
        actions={
          <Button onClick={() => setShowBuilder((s) => !s)}>
            {showBuilder ? 'Close builder' : 'New scenario'}
          </Button>
        }
      />

      <p className="text-sm text-k-text-secondary">
        Scenarios never touch live data — applying changes is a human decision.
      </p>

      {showBuilder &&
        projects.data &&
        people.data &&
        skills.data &&
        workItems.data && (
          <div>
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

      <Card className="p-0 overflow-hidden">
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
        <div>
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

  if (error) {
    return <ErrorState title="Failed to load scenarios" message={error.message} retry={() => scenarios.refetch()} />;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-8 text-k-text-secondary">
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

  return (
    <Table>
      <THead>
        <tr>
          <TH>Name</TH>
          <TH>Base snapshot</TH>
          <TH>Ops</TH>
          <TH>Status</TH>
          <TH>Created</TH>
          <TH>Actions</TH>
        </tr>
      </THead>
      <tbody>
        {items.map((s) => (
          <TR key={s.id} className={selectedId === s.id ? 'bg-k-elevated' : undefined}>
            <TD>
              <button
                onClick={() => onSelect(selectedId === s.id ? null : s.id)}
                className="font-medium text-k-text hover:underline"
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
                  className="px-2 py-1 text-xs"
                  onClick={() =>
                    recompute.mutate(s.id, {
                      onSuccess: () => toast.success('Scenario recomputed'),
                      onError: (err) => toast.error(err.message),
                    })
                  }
                  disabled={recompute.isPending}
                >
                  {recompute.isPending ? <Spinner className="h-3 w-3" /> : 'Recompute'}
                </Button>
                <DeleteScenarioButton
                  scenario={s}
                  onDeleted={() => {
                    if (selectedId === s.id) onSelect(null);
                  }}
                />
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
        <h2 className="text-base font-semibold text-k-text">
          {data?.scenario.name ?? 'Scenario'}
        </h2>
        <button onClick={onClose} className="text-sm font-medium text-k-text-secondary hover:text-k-text">
          Close
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-3 py-6 text-k-text-secondary">
          <Spinner />
          <span>Loading scenario…</span>
        </div>
      )}

      {error && <ErrorState title="Failed to load scenario" message={error.message} retry={refetch} />}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Status</dt>
              <dd className="mt-1">
                <Badge tone={statusTone(data.scenario.status)}>{data.scenario.status}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Base snapshot</dt>
              <dd className="mt-1 text-sm text-k-text-secondary font-mono">{data.scenario.base_snapshot_id}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Operations</dt>
              <dd className="mt-1 text-sm font-semibold text-k-text">{data.scenario.ops.length}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Created</dt>
              <dd className="mt-1 text-sm text-k-text-secondary">{formatTimestamp(data.scenario.created_at)}</dd>
            </div>
          </div>

          {data.scenario.ops.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-k-text-tertiary">Operations</h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-k-text-secondary">
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

function DeleteScenarioButton({
  scenario,
  onDeleted,
}: {
  scenario: { id: string; name: string };
  onDeleted?: () => void;
}) {
  const remove = useDeleteScenario();
  const [open, setOpen] = useState(false);

  const handleConfirm = () => {
    remove.mutate(scenario.id, {
      onSuccess: () => {
        toast.success(`Scenario "${scenario.name}" deleted`);
        setOpen(false);
        onDeleted?.();
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <>
      <Button
        variant="danger"
        className="px-2 py-1 text-xs"
        onClick={() => setOpen(true)}
        disabled={remove.isPending}
      >
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete scenario "${scenario.name}"?`}
        description="This permanently removes the scenario and its diff history."
        confirmLabel="Delete"
        destructive
        isLoading={remove.isPending}
        onConfirm={handleConfirm}
      />
    </>
  );
}

export const scenariosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/scenarios',
  component: ScenariosPage,
});

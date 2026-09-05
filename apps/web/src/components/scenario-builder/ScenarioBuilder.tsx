import { useState } from 'react';
import type { Person, Project, Skill, WorkItem } from '@kairo/types';
import { Badge, Button, Card, ErrorState, Input, Spinner } from '../ui';
import { useCreateScenario, type ScenarioDiffResult } from '../../api/scenarios';
import { DiffView } from './DiffView';
import { OpEditor } from './OpEditor';
import {
  daysFromNow,
  formatOp,
  makeEmptyOp,
  OP_LABELS,
  type OpType,
  type ScenarioOp,
} from './utils';

interface ScenarioBuilderProps {
  projects: Project[];
  people: Person[];
  skills: Skill[];
  workItems: WorkItem[];
  initialDiff?: ScenarioDiffResult | null;
  onCancel: () => void;
  onCreated?: (id: string) => void;
}

const OP_ORDER: OpType[] = [
  'move_project',
  'set_deadline',
  'add_allocation',
  'remove_allocation',
  'change_allocation_fte',
  'defer_work_items',
  'add_person_skill',
];

export function ScenarioBuilder({
  projects,
  people,
  skills,
  workItems,
  initialDiff,
  onCancel,
  onCreated,
}: ScenarioBuilderProps) {
  const [name, setName] = useState('');
  const [ops, setOps] = useState<ScenarioOp[]>([]);
  const [presetProjectId, setPresetProjectId] = useState('');
  const create = useCreateScenario();

  const addOp = (op: ScenarioOp) => {
    setOps((prev) => [...prev, op]);
  };

  const updateOpAt = (index: number, op: ScenarioOp) => {
    setOps((prev) => prev.map((o, i) => (i === index ? op : o)));
  };

  const removeOpAt = (index: number) => {
    setOps((prev) => prev.filter((_, i) => i !== index));
  };

  const addPresetMove = (weeks: number) => {
    if (!presetProjectId) return;
    addOp({ op: 'move_project', project_id: presetProjectId, weeks });
  };

  const canCreate = name.trim().length > 0 && ops.length > 0;

  const handleCreate = () => {
    if (!canCreate) return;
    create.mutate(
      { name: name.trim(), ops },
      {
        onSuccess: (data) => {
          setName('');
          setOps([]);
          onCreated?.(data.scenario.id);
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">New scenario</h2>

        <div className="mb-6">
          <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
          <Input
            value={name}
            placeholder="e.g. Apollo +1 week"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="mb-6 rounded bg-slate-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Quick presets</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[14rem] flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">Project</label>
              <select
                value={presetProjectId}
                onChange={(e) => setPresetProjectId(e.target.value)}
                className="block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
              >
                <option value="">Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="secondary"
              disabled={!presetProjectId}
              onClick={() => addPresetMove(1)}
            >
              +1 week
            </Button>
            <Button
              variant="secondary"
              disabled={!presetProjectId}
              onClick={() => addPresetMove(-1)}
            >
              −1 week
            </Button>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Operations</h3>
          <div className="flex flex-wrap gap-2">
            {OP_ORDER.map((type) => (
              <Button
                key={type}
                variant="secondary"
                className="text-xs"
                onClick={() => addOp(makeEmptyOp(type))}
              >
                + {OP_LABELS[type]}
              </Button>
            ))}
          </div>
        </div>

        {ops.length === 0 ? (
          <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Add at least one operation.
          </p>
        ) : (
          <ul className="space-y-4">
            {ops.map((op, index) => (
              <li key={index}>
                <OpEditor
                  op={op}
                  projects={projects}
                  people={people}
                  skills={skills}
                  onChange={(o) => updateOpAt(index, o)}
                  onRemove={() => removeOpAt(index)}
                />
              </li>
            ))}
          </ul>
        )}

        {ops.length > 0 && (
          <div className="mt-6 rounded bg-slate-50 p-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Operation summary
            </h4>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
              {ops.map((op, i) => (
                <li key={i}>{formatOp(op, { projects, people, skills, workItems })}</li>
              ))}
            </ol>
          </div>
        )}

        {create.isError && (
          <ErrorState title="Failed to create scenario" message={create.error.message} />
        )}

        <div className="mt-6 flex items-center gap-3">
          <Button onClick={handleCreate} disabled={!canCreate || create.isPending}>
            {create.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
            Create scenario
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <p className="text-sm text-slate-500">{ops.length} op{ops.length === 1 ? '' : 's'}</p>
        </div>
      </Card>

      {initialDiff && <DiffView diff={initialDiff} projects={projects} people={people} />}
    </div>
  );
}

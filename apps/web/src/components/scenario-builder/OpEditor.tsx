import type { Person, Project, Skill } from '@kairo/types';
import { Button, Input, Select, Textarea } from '../ui';
import {
  formatOp,
  makeEmptyOp,
  OP_LABELS,
  parseWorkItemIds,
  stringifyWorkItemIds,
  type OpType,
  type ScenarioOp,
} from './utils';

interface OpEditorProps {
  op: ScenarioOp;
  projects: Project[];
  people: Person[];
  skills: Skill[];
  onChange: (op: ScenarioOp) => void;
  onRemove: () => void;
}

const OP_TYPES: OpType[] = [
  'move_project',
  'set_deadline',
  'add_allocation',
  'remove_allocation',
  'change_allocation_fte',
  'defer_work_items',
  'add_person_skill',
];

export function OpEditor({
  op,
  projects,
  people,
  skills,
  onChange,
  onRemove,
}: OpEditorProps) {
  const handleTypeChange = (value: OpType) => {
    onChange(makeEmptyOp(value));
  };

  const renderFields = () => {
    switch (op.op) {
      case 'move_project':
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Project</label>
              <Select
                value={op.project_id}
                onChange={(e) => onChange({ ...op, project_id: e.target.value })}
              >
                <option value="">Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Weeks</label>
              <Input
                type="number"
                value={op.weeks}
                onChange={(e) =>
                  onChange({ ...op, weeks: Number(e.target.value) })
                }
              />
            </div>
          </div>
        );
      case 'set_deadline':
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Project</label>
              <Select
                value={op.project_id}
                onChange={(e) => onChange({ ...op, project_id: e.target.value })}
              >
                <option value="">Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Deadline</label>
              <Input
                type="date"
                value={op.date}
                onChange={(e) => onChange({ ...op, date: e.target.value })}
              />
            </div>
          </div>
        );
      case 'add_allocation':
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">Person</label>
              <Select
                value={op.person_id}
                onChange={(e) => onChange({ ...op, person_id: e.target.value })}
              >
                <option value="">Select person…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">Project</label>
              <Select
                value={op.project_id}
                onChange={(e) => onChange({ ...op, project_id: e.target.value })}
              >
                <option value="">Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Phase ID (optional)</label>
              <Input
                value={op.phase_id ?? ''}
                placeholder="phase_id"
                onChange={(e) =>
                  onChange({ ...op, phase_id: e.target.value || undefined })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">FTE</label>
              <Input
                type="number"
                step={0.1}
                min={0}
                max={2}
                value={op.fte}
                onChange={(e) =>
                  onChange({ ...op, fte: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Start date</label>
              <Input
                type="date"
                value={op.start_date}
                onChange={(e) =>
                  onChange({ ...op, start_date: e.target.value })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">End date</label>
              <Input
                type="date"
                value={op.end_date}
                onChange={(e) =>
                  onChange({ ...op, end_date: e.target.value })
                }
              />
            </div>
          </div>
        );
      case 'remove_allocation':
        return (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Allocation ID <span className="text-slate-400">(advanced)</span>
            </label>
            <Input
              value={op.allocation_id}
              placeholder="allocation id"
              onChange={(e) =>
                onChange({ ...op, allocation_id: e.target.value })
              }
            />
          </div>
        );
      case 'change_allocation_fte':
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Allocation ID <span className="text-slate-400">(advanced)</span>
              </label>
              <Input
                value={op.allocation_id}
                placeholder="allocation id"
                onChange={(e) =>
                  onChange({ ...op, allocation_id: e.target.value })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">FTE</label>
              <Input
                type="number"
                step={0.1}
                min={0}
                max={2}
                value={op.fte}
                onChange={(e) => onChange({ ...op, fte: Number(e.target.value) })}
              />
            </div>
          </div>
        );
      case 'defer_work_items':
        return (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Work item IDs <span className="text-slate-400">(one per line or comma-separated)</span>
            </label>
            <Textarea
              value={stringifyWorkItemIds(op.work_item_ids)}
              rows={3}
              onChange={(e) =>
                onChange({ ...op, work_item_ids: parseWorkItemIds(e.target.value) })
              }
            />
          </div>
        );
      case 'add_person_skill':
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Person</label>
              <Select
                value={op.person_id}
                onChange={(e) => onChange({ ...op, person_id: e.target.value })}
              >
                <option value="">Select person…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Skill</label>
              <Select
                value={op.skill_id}
                onChange={(e) => onChange({ ...op, skill_id: e.target.value })}
              >
                <option value="">Select skill…</option>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Level</label>
              <Select
                value={op.level}
                onChange={(e) =>
                  onChange({ ...op, level: Number(e.target.value) as 1 | 2 | 3 | 4 })
                }
              >
                <option value={1}>1 Novice</option>
                <option value={2}>2 Intermediate</option>
                <option value={3}>3 Advanced</option>
                <option value={4}>4 Expert</option>
              </Select>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const preview = formatOp(op, {
    projects,
    people,
    skills,
    workItems: [],
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <Select
          value={op.op}
          onChange={(e) => handleTypeChange(e.target.value as OpType)}
          className="w-48"
        >
          {OP_TYPES.map((type) => (
            <option key={type} value={type}>
              {OP_LABELS[type]}
            </option>
          ))}
        </Select>
        <Button variant="danger" onClick={onRemove} className="ml-auto">
          Remove
        </Button>
      </div>

      <div className="space-y-3">{renderFields()}</div>

      <p className="mt-3 text-sm text-slate-600">
        <span className="font-medium text-slate-900">Preview:</span> {preview}
      </p>
    </div>
  );
}

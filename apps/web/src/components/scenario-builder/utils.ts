import type {
  AddAllocationOp,
  AddPersonSkillOp,
  ChangeAllocationFteOp,
  DeferWorkItemsOp,
  MoveProjectOp,
  Person,
  Project,
  RemoveAllocationOp,
  ScenarioOp,
  SetDeadlineOp,
  Skill,
  WorkItem,
} from '@kairo/types';

export type OpType = ScenarioOp['op'];

export const OP_LABELS: Record<OpType, string> = {
  move_project: 'Move project',
  set_deadline: 'Set deadline',
  add_allocation: 'Add allocation',
  remove_allocation: 'Remove allocation',
  change_allocation_fte: 'Change allocation FTE',
  defer_work_items: 'Defer work items',
  add_person_skill: 'Add person skill',
};

export function makeEmptyOp(op: OpType): ScenarioOp {
  switch (op) {
    case 'move_project':
      return { op: 'move_project', project_id: '', weeks: 0 };
    case 'set_deadline':
      return { op: 'set_deadline', project_id: '', date: formatDate(new Date()) };
    case 'add_allocation':
      return {
        op: 'add_allocation',
        person_id: '',
        project_id: '',
        fte: 0.5,
        start_date: formatDate(new Date()),
        end_date: formatDate(new Date()),
      };
    case 'remove_allocation':
      return { op: 'remove_allocation', allocation_id: '' };
    case 'change_allocation_fte':
      return { op: 'change_allocation_fte', allocation_id: '', fte: 0.5 };
    case 'defer_work_items':
      return { op: 'defer_work_items', work_item_ids: [] };
    case 'add_person_skill':
      return { op: 'add_person_skill', person_id: '', skill_id: '', level: 1 };
    default:
      throw new Error(`unknown op: ${op}`);
  }
}

export function formatDate(d: Date): string {
  const year = String(d.getFullYear()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

export function formatOp(
  op: ScenarioOp,
  context: {
    projects: Project[];
    people: Person[];
    skills: Skill[];
    workItems: WorkItem[];
  },
): string {
  const projectName = (id: string) =>
    context.projects.find((p) => p.id === id)?.name ?? id;
  const personName = (id: string) =>
    context.people.find((p) => p.id === id)?.name ?? id;
  const skillName = (id: string) =>
    context.skills.find((s) => s.id === id)?.name ?? id;

  switch (op.op) {
    case 'move_project':
      return `Move ${projectName(op.project_id)} by ${op.weeks >= 0 ? '+' : ''}${op.weeks} week${op.weeks === 1 || op.weeks === -1 ? '' : 's'}`;
    case 'set_deadline':
      return `Set deadline for ${projectName(op.project_id)} to ${op.date}`;
    case 'add_allocation':
      return `Add ${personName(op.person_id)} to ${projectName(op.project_id)} ${op.phase_id ? `(phase ${op.phase_id}) ` : ''}at ${op.fte} FTE from ${op.start_date} to ${op.end_date}`;
    case 'remove_allocation':
      return `Remove allocation ${op.allocation_id}`;
    case 'change_allocation_fte':
      return `Change allocation ${op.allocation_id} FTE to ${op.fte}`;
    case 'defer_work_items': {
      const count = op.work_item_ids.length;
      return `Defer ${count} work item${count === 1 ? '' : 's'}`;
    }
    case 'add_person_skill':
      return `Add skill ${skillName(op.skill_id)} level ${op.level} to ${personName(op.person_id)}`;
    default:
      return 'Unknown op';
  }
}

export function updateOp(op: ScenarioOp, patch: Partial<ScenarioOp>): ScenarioOp {
  return { ...op, ...patch } as ScenarioOp;
}

export function parseWorkItemIds(value: string): string[] {
  return value
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function stringifyWorkItemIds(ids: string[]): string {
  return ids.join('\n');
}

export { type ScenarioOp };
export type {
  MoveProjectOp,
  SetDeadlineOp,
  AddAllocationOp,
  RemoveAllocationOp,
  ChangeAllocationFteOp,
  DeferWorkItemsOp,
  AddPersonSkillOp,
};

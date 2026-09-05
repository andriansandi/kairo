import { createRoute } from '@tanstack/react-router';
import { toast } from 'sonner';
import { rootRoute } from './layout';
import { useEffect, useMemo, useState } from 'react';
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
import { ConfirmDialog } from '@/components/shadcn/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/shadcn/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/shadcn/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/shadcn/tooltip';
import { MoreHorizontal } from 'lucide-react';
import {
  useSkills,
  useCreateSkill,
  useUpdateSkill,
  useDeleteSkill,
  type CreateSkillBody,
} from '../api/skills';
import { useCoverage, type SkillCoverage } from '../api/coverage';
import type { Skill } from '@kairo/types';

const LEVELS = ['L1 Novice', 'L2 Intermediate', 'L3 Advanced', 'L4 Expert'];
const LEVEL_COLORS = ['bg-sky-200', 'bg-sky-400', 'bg-sky-600', 'bg-sky-800'];

export const skillsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/skills',
  component: Skills,
});

function Skills() {
  const [q, setQ] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);

  const { data: skills, isLoading, error, refetch } = useSkills(q);
  const { data: coverageData, isLoading: coverageLoading } = useCoverage();

  const coverageById = useMemo(
    () => new Map(coverageData?.coverage.map((c) => [c.skill_id, c] as const) ?? []),
    [coverageData],
  );

  const maxTotalPeople = useMemo(
    () => coverageData?.coverage.reduce((max, c) => Math.max(max, c.total_people), 0) ?? 0,
    [coverageData],
  );

  const openCreate = () => {
    setEditingSkill(null);
    setDialogOpen(true);
  };

  const openEdit = (skill: Skill) => {
    setEditingSkill(skill);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingSkill(null);
  };

  return (
    <div>
      <PageHeader title="Skills" subtitle="Browse and manage the skills catalog" />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Input
          placeholder="Search skills"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-72"
        />
        <Button onClick={openCreate}>Add skill</Button>
      </div>

      {error ? (
        <ErrorState title="Failed to load skills" message={error.message} retry={refetch} />
      ) : (
        <Card className="mb-6 overflow-hidden p-0">
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH className="w-40">Category</TH>
                <TH>Aliases</TH>
                <TH className="w-44">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">Coverage</span>
                    </TooltipTrigger>
                    <TooltipContent>L1 Novice through L4 Expert counts</TooltipContent>
                  </Tooltip>
                </TH>
                <TH className="w-24 text-center">People</TH>
                <TH className="w-24 text-right">Free h</TH>
                <TH className="w-20 text-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">SPOF</span>
                    </TooltipTrigger>
                    <TooltipContent>Exactly one person at L3+ for this skill</TooltipContent>
                  </Tooltip>
                </TH>
                <TH className="w-32" />
              </tr>
            </THead>
            <tbody>
              {isLoading ? (
                <TR>
                  <TD colSpan={8}>
                    <div className="flex items-center gap-2 py-4">
                      <Spinner />
                      <span className="text-k-text-secondary">Loading skills...</span>
                    </div>
                  </TD>
                </TR>
              ) : !skills || skills.length === 0 ? (
                <TR>
                  <TD colSpan={8}>
                    <EmptyState
                      title="No skills found"
                      message="Add the first skill or try another search."
                    />
                  </TD>
                </TR>
              ) : (
                skills.map((skill) => (
                  <SkillRow
                    key={skill.id}
                    skill={skill}
                    coverage={coverageById.get(skill.id)}
                    coverageLoading={coverageLoading}
                    maxTotalPeople={maxTotalPeople}
                    onEdit={() => openEdit(skill)}
                  />
                ))
              )}
            </tbody>
          </Table>

          <div className="border-t border-k-border px-5 py-3">
            <p className="text-xs text-k-text-muted">
              SPOF = exactly one person at Advanced or Expert level for this skill.
            </p>
          </div>
        </Card>
      )}

      <SkillFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        skill={editingSkill}
      />
    </div>
  );
}

function SkillRow({
  skill,
  coverage,
  coverageLoading,
  maxTotalPeople,
  onEdit,
}: {
  skill: Skill;
  coverage?: SkillCoverage;
  coverageLoading: boolean;
  maxTotalPeople: number;
  onEdit: () => void;
}) {
  return (
    <TR>
      <TD className="font-medium text-k-text">{skill.name}</TD>
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
          <span className="text-k-text-muted">—</span>
        )}
      </TD>
      <TD>
        {coverageLoading ? (
          <div className="flex items-center gap-2 text-k-text-muted">
            <Spinner className="h-3.5 w-3.5" />
            <span className="text-xs">Loading coverage…</span>
          </div>
        ) : (
          <CoverageBar coverage={coverage} maxTotalPeople={maxTotalPeople} />
        )}
      </TD>
      <TD className="text-center">{coverage?.total_people ?? 0}</TD>
      <TD className="text-right">{coverage?.free_hours ?? '—'}</TD>
      <TD className="text-center">
        {coverage?.spof ? <Badge tone="danger">SPOF</Badge> : null}
      </TD>
      <TD>
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onEdit}>
            Edit
          </Button>
          <SkillRowActions skill={skill} />
        </div>
      </TD>
    </TR>
  );
}

function CoverageBar({
  coverage,
  maxTotalPeople,
}: {
  coverage?: SkillCoverage;
  maxTotalPeople: number;
}) {
  const counts = coverage?.level_counts ?? [0, 0, 0, 0];
  const total = counts.reduce((a, b) => a + b, 0);

  const widths = counts.map((count) => {
    if (count === 0 || maxTotalPeople === 0 || total === 0) return 0;
    const pct = (count / maxTotalPeople) * 100;
    return Math.max(pct, 4);
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex h-2 w-32 overflow-hidden rounded-sm border border-k-border bg-k-surface">
          {widths.map((width, i) => (
            <div
              key={i}
              className={`h-full border-r border-k-surface last:border-r-0 ${LEVEL_COLORS[i]}`}
              style={{ width: `${width}%` }}
            />
          ))}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-0.5 text-xs">
          {counts.map((c, i) => (
            <div key={i} className="flex justify-between gap-4">
              <span>{LEVELS[i]}</span>
              <span className="font-medium tabular-nums">{c}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between gap-4 border-t border-k-border pt-1">
            <span>Total people</span>
            <span className="font-medium tabular-nums">{total}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Free hours</span>
            <span className="font-medium tabular-nums">{coverage?.free_hours ?? 0}</span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function SkillRowActions({ skill }: { skill: Skill }) {
  const remove = useDeleteSkill();
  const [open, setOpen] = useState(false);

  const handleConfirm = () => {
    remove.mutate(skill.id, {
      onSuccess: () => {
        toast.success(`${skill.name} deleted`);
        setOpen(false);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" className="px-1.5 py-1" aria-label="Skill actions">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" asChild>
            <span className="cursor-default" onClick={() => setOpen(true)}>
              Delete
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${skill.name}?`}
        description="This permanently removes the skill. Any linked person skills or skill requirements will also be removed."
        confirmLabel="Delete"
        destructive
        isLoading={remove.isPending}
        onConfirm={handleConfirm}
      />
    </>
  );
}

function SkillFormDialog({
  open,
  onOpenChange,
  skill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill: Skill | null;
}) {
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CreateSkillBody>({
    name: '',
    category: '',
    aliases: [],
  });

  useEffect(() => {
    if (skill) {
      setForm({
        name: skill.name,
        category: skill.category,
        aliases: skill.aliases,
      });
    } else {
      setForm({ name: '', category: '', aliases: [] });
    }
    setError(null);
  }, [skill, open]);

  const isPending = create.isPending || update.isPending;
  const isEdit = skill !== null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (isEdit) {
      update.mutate(
        { skillId: skill.id, body: form },
        {
          onSuccess: () => {
            toast.success('Skill updated');
            onOpenChange(false);
          },
          onError: (err) => setError(err.message),
        },
      );
    } else {
      create.mutate(form, {
        onSuccess: () => {
          toast.success('Skill added');
          onOpenChange(false);
        },
        onError: (err) => setError(err.message),
      });
    }
  };

  const handleClose = (nextOpen: boolean) => {
    if (!isPending) onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit skill' : 'Add skill'}</DialogTitle>
            <DialogDescription>
              {isEdit ? 'Update the skill details.' : 'Create a new skill for the catalog.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div>
              <label
                htmlFor="skill-name"
                className="mb-1 block text-xs font-medium text-k-text-secondary"
              >
                Name
              </label>
              <Input
                id="skill-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                autoFocus
              />
            </div>
            <div>
              <label
                htmlFor="skill-category"
                className="mb-1 block text-xs font-medium text-k-text-secondary"
              >
                Category
              </label>
              <Input
                id="skill-category"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                required
              />
            </div>
            <div>
              <label
                htmlFor="skill-aliases"
                className="mb-1 block text-xs font-medium text-k-text-secondary"
              >
                Aliases
              </label>
              <Input
                id="skill-aliases"
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
            {error && (
              <p className="rounded-md border border-k-danger-border bg-k-danger-bg px-3 py-2 text-sm text-k-danger-text">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner className="mr-2" />}
              {isEdit ? 'Save changes' : 'Add skill'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

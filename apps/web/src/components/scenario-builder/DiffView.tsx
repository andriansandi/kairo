import type { Person, Project } from '@kairo/types';
import { Badge, Card, EmptyState, Table, TD, TH, THead, TR } from '../ui';
import type { ScenarioDiffResult } from '../../api/scenarios';

interface DiffViewProps {
  diff: ScenarioDiffResult;
  projects: Project[];
  people: Person[];
}

function verdictTone(
  verdict: string,
): 'neutral' | 'success' | 'warning' | 'risk' | 'danger' {
  switch (verdict) {
    case 'healthy':
      return 'success';
    case 'warning':
      return 'warning';
    case 'at_risk':
      return 'risk';
    case 'critical':
      return 'danger';
    case 'missing':
    default:
      return 'neutral';
  }
}

function heatTone(utilization: number): 'success' | 'warning' | 'danger' {
  if (utilization > 1) return 'danger';
  if (utilization >= 0.85) return 'warning';
  return 'success';
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function entityName(id: string, projects: Project[], people: Person[]): string {
  const project = projects.find((p) => p.id === id);
  if (project) return project.name;
  const person = people.find((p) => p.id === id);
  if (person) return person.name;
  return id;
}

export function DiffView({ diff, projects, people }: DiffViewProps) {
  const {
    summary,
    capacity_deltas: capacityDeltas,
    conflict_changes: conflictChanges,
    feasibility_deltas: feasibilityDeltas,
  } = diff;

  const hasAnyImpact =
    capacityDeltas.length > 0 ||
    conflictChanges.added.length > 0 ||
    conflictChanges.removed.length > 0 ||
    feasibilityDeltas.length > 0;

  if (!hasAnyImpact) {
    return (
      <EmptyState
        title="No impact detected"
        message="Identical results — this scenario does not change any computed outcomes."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Badge tone="neutral">
          Utilization changed: {summary.utilization_changed_person_weeks} person-weeks
        </Badge>
        <Badge tone="danger">Conflicts added: {summary.conflicts_added}</Badge>
        <Badge tone="success">Conflicts removed: {summary.conflicts_removed}</Badge>
        <Badge tone="warning">
          Feasibility changed: {summary.feasibility_changed_projects} projects
        </Badge>
      </div>

      {capacityDeltas.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <h3 className="px-5 py-3 text-sm font-semibold text-k-text">Capacity changes</h3>
          <Table>
            <THead>
              <tr>
                <TH>Person</TH>
                <TH>Week</TH>
                <TH>Base utilization</TH>
                <TH>Scenario utilization</TH>
                <TH>Delta</TH>
              </tr>
            </THead>
            <tbody>
              {capacityDeltas.map((row, i) => (
                <TR key={`${row.person_id}-${row.week_key}-${i}`}>
                  <TD className="font-medium text-k-text">{entityName(row.person_id, projects, people)}</TD>
                  <TD>{row.week_key}</TD>
                  <TD>
                    <Badge tone={heatTone(row.base_utilization)}>
                      {formatPercent(row.base_utilization)}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge tone={heatTone(row.scenario_utilization)}>
                      {formatPercent(row.scenario_utilization)}
                    </Badge>
                  </TD>
                  <TD className={row.delta > 0 ? 'text-k-danger-text' : 'text-k-success-text'}>
                    {row.delta > 0 ? '+' : ''}
                    {formatPercent(row.delta)}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {(conflictChanges.added.length > 0 || conflictChanges.removed.length > 0) && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-k-text">Conflict changes</h3>

          {conflictChanges.added.length > 0 && (
            <div className="mb-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-k-text-tertiary">
                Conflicts added
              </h4>
              <ul className="space-y-2">
                {conflictChanges.added.map((c, i) => (
                  <li
                    key={`added-${c.rule}-${i}`}
                    className="flex items-center gap-3 rounded-md border border-k-danger-border bg-k-danger-bg px-3 py-2 text-sm"
                  >
                    <Badge tone="danger">{c.rule}</Badge>
                    <span className="text-k-text-secondary">
                      {entityName(c.project_id ?? c.person_id ?? c.team_id ?? '', projects, people)}
                    </span>
                    <span className="text-k-text-muted">
                      {c.window_start} – {c.window_end}
                    </span>
                    <span className="ml-auto text-xs text-k-text-muted">{c.severity}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {conflictChanges.removed.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-k-text-tertiary">
                Conflicts removed
              </h4>
              <ul className="space-y-2">
                {conflictChanges.removed.map((c, i) => (
                  <li
                    key={`removed-${c.rule}-${i}`}
                    className="flex items-center gap-3 rounded-md border border-k-success-border bg-k-success-bg px-3 py-2 text-sm"
                  >
                    <Badge tone="success">{c.rule}</Badge>
                    <span className="text-k-text-secondary">
                      {entityName(c.project_id ?? c.person_id ?? c.team_id ?? '', projects, people)}
                    </span>
                    <span className="text-k-text-muted">
                      {c.window_start} – {c.window_end}
                    </span>
                    <span className="ml-auto text-xs text-k-text-muted">{c.severity}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {feasibilityDeltas.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <h3 className="px-5 py-3 text-sm font-semibold text-k-text">Feasibility changes</h3>
          <Table>
            <THead>
              <tr>
                <TH>Project</TH>
                <TH>Verdict before</TH>
                <TH>Verdict after</TH>
                <TH>Finish before</TH>
                <TH>Finish after</TH>
              </tr>
            </THead>
            <tbody>
              {feasibilityDeltas.map((row) => (
                <TR key={row.project_id}>
                  <TD className="font-medium text-k-text">{entityName(row.project_id, projects, people)}</TD>
                  <TD>
                    <Badge tone={verdictTone(row.base.verdict)}>{row.base.verdict}</Badge>
                  </TD>
                  <TD>
                    <Badge tone={verdictTone(row.scenario.verdict)}>
                      {row.scenario.verdict}
                    </Badge>
                  </TD>
                  <TD>{row.base.computed_finish || '—'}</TD>
                  <TD>{row.scenario.computed_finish || '—'}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

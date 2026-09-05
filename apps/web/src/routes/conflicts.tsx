import { useEffect, useMemo, useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './layout';
import {
  PageHeader,
  Card,
  Button,
  Spinner,
  ErrorState,
  EmptyState,
  Badge,
  Table,
  THead,
  TH,
  TR,
  TD,
} from '../components/ui';
import {
  useConflicts,
  useConflict,
  useAcknowledgeConflict,
  useExplainConflict,
  type ConflictView,
  type ConflictSeverity,
  type ConflictRule,
  type ExplainResponse,
} from '../api/conflicts';

export const conflictsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/conflicts',
  component: Conflicts,
});

const RULES: { value: ConflictRule; label: string }[] = [
  { value: 'C1', label: 'C1 Over-allocation' },
  { value: 'C2', label: 'C2 Team over-demand' },
  { value: 'C3', label: 'C3 DevOps contention' },
  { value: 'C4', label: 'C4 Deadline breach' },
  { value: 'C5', label: 'C5 Project overlap' },
  { value: 'C6', label: 'C6 Dependency violation' },
  { value: 'C7', label: 'C7 Skill bottleneck' },
  { value: 'C8', label: 'C8 Single point of failure' },
  { value: 'C9', label: 'C9 Buffer erosion' },
  { value: 'C10', label: 'C10 Unstaffed phase' },
];

const SEVERITIES: { value: ConflictSeverity; label: string; tone: 'danger' | 'risk' | 'warning' }[] = [
  { value: 'critical', label: 'Critical', tone: 'danger' },
  { value: 'at_risk', label: 'At Risk', tone: 'risk' },
  { value: 'warning', label: 'Warning', tone: 'warning' },
];

const GROUP_ORDER: ConflictSeverity[] = ['critical', 'at_risk', 'warning'];

export default function Conflicts() {
  const [rule, setRule] = useState<ConflictRule | ''>('');
  const [severity, setSeverity] = useState<ConflictSeverity | ''>('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setCursor(null);
  }, [rule, severity]);

  const filters = useMemo(
    () => ({
      rule: rule || undefined,
      severity: severity || undefined,
      limit: 50,
      cursor,
    }),
    [rule, severity, cursor],
  );

  const { data, isLoading, error, refetch } = useConflicts(filters);

  const counts = useMemo(() => {
    const base = { critical: 0, at_risk: 0, warning: 0 };
    data?.items.forEach((c) => {
      if (c.severity in base) base[c.severity]++;
    });
    return base;
  }, [data]);

  const filtered = useMemo(() => {
    return data?.items.filter((c) => {
      if (rule && c.rule !== rule) return false;
      if (severity && c.severity !== severity) return false;
      return true;
    });
  }, [data, rule, severity]);

  const grouped = useMemo(() => {
    const map = new Map<ConflictSeverity, ConflictView[]>();
    for (const s of GROUP_ORDER) map.set(s, []);
    filtered?.forEach((c) => map.get(c.severity)?.push(c));
    return map;
  }, [filtered]);

  if (error) return <ErrorState title="Failed to load conflicts" message={error.message} retry={refetch} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conflicts"
        subtitle="Detected capacity and timeline risks"
        actions={
          <div className="flex items-center gap-2">
            {SEVERITIES.map((s) => (
              <Badge key={s.value} tone={s.tone}>
                {s.label}: {counts[s.value]}
              </Badge>
            ))}
          </div>
        }
      />

      <Card>
        <div className="mb-5">
          <label className="mb-1.5 block text-xs font-medium text-k-text-secondary">Rule</label>
          <div className="flex flex-wrap gap-1.5">
            <FilterButton active={rule === ''} onClick={() => setRule('')}>
              All
            </FilterButton>
            {RULES.map((r) => (
              <FilterButton key={r.value} active={rule === r.value} onClick={() => setRule(r.value)}>
                {r.label}
              </FilterButton>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-k-text-secondary">Severity</label>
          <div className="flex flex-wrap gap-1.5">
            <FilterButton active={severity === ''} onClick={() => setSeverity('')}>
              All
            </FilterButton>
            {SEVERITIES.map((s) => (
              <FilterButton key={s.value} active={severity === s.value} onClick={() => setSeverity(s.value)}>
                {s.label}
              </FilterButton>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center gap-2 p-6">
            <Spinner />
            <span className="text-k-text-secondary">Loading conflicts...</span>
          </div>
        ) : !filtered || filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No conflicts" message="Adjust filters or rebuild the snapshot to refresh." />
          </div>
        ) : (
          GROUP_ORDER.map((s) => {
            const items = grouped.get(s) ?? [];
            if (items.length === 0) return null;
            return (
              <div key={s} className={severityGroupBorder(s)}>
                <div className={`flex items-center gap-2 border-b border-k-border px-4 py-2 text-xs font-semibold uppercase tracking-wider ${severityGroupHeaderText(s)}`}>
                  <span className={`h-2 w-2 rounded-full ${severityDot(s)}`} />
                  {severityLabel(s)} ({items.length})
                </div>
                <Table>
                  <THead>
                    <tr>
                      <TH className="w-0" />
                      <TH>Rule</TH>
                      <TH>Entity</TH>
                      <TH>Window</TH>
                      <TH>Severity</TH>
                      <TH className="w-full">Explanation</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {items.map((c) => (
                      <TR
                        key={c.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
                      >
                        <TD className={`w-0 border-l-4 ${severityStripe(c.severity)}`} />
                        <TD>
                          <Badge tone="neutral">{c.rule}</Badge>
                        </TD>
                        <TD className="font-medium text-k-text">{entityName(c)}</TD>
                        <TD className="whitespace-nowrap">{c.window_start} → {c.window_end}</TD>
                        <TD>
                          <Badge tone={severityBadgeTone(c.severity)}>{severityLabel(c.severity)}</Badge>
                        </TD>
                        <TD>
                          <p className="max-w-xl truncate text-k-text-secondary">{c.explanation}</p>
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </div>
            );
          })
        )}
      </Card>

      {data?.nextCursor && (
        <div className="flex items-center justify-end">
          <Button variant="secondary" onClick={() => setCursor(data.nextCursor)}>
            Next page
          </Button>
        </div>
      )}

      {selectedId && <ConflictDetail id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={active ? 'primary' : 'secondary'}
      onClick={onClick}
      className={active ? 'px-3 py-1.5 text-xs' : 'px-3 py-1.5 text-xs border-transparent bg-k-elevated hover:bg-k-border'}
    >
      {children}
    </Button>
  );
}

function ConflictDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading, error, refetch } = useConflict(id);
  const acknowledge = useAcknowledgeConflict();
  const explain = useExplainConflict();
  const [explanation, setExplanation] = useState<ExplainResponse['analysis'] | null>(null);

  if (isLoading) {
    return (
      <Card>
        <div className="flex items-center gap-2 py-4">
          <Spinner />
          <span className="text-k-text-secondary">Loading conflict detail...</span>
        </div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <ErrorState
        title="Failed to load conflict detail"
        message={error?.message ?? 'Unknown error'}
        retry={refetch}
      />
    );
  }

  return (
    <Card className={`border-l-4 ${severityStripe(data.severity)}`}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{data.rule}</Badge>
            <Badge tone={severityBadgeTone(data.severity)}>{severityLabel(data.severity)}</Badge>
            <Badge tone={data.status === 'open' ? 'warning' : 'neutral'}>{data.status}</Badge>
          </div>
          <h2 className="text-lg font-semibold text-k-text">{entityName(data)}</h2>
          <p className="text-sm text-k-text-muted">
            {data.window_start} → {data.window_end}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              explain.mutate(data!.id, {
                onSuccess: (res) => setExplanation(res.analysis),
              });
            }}
            disabled={explain.isPending}
          >
            {explain.isPending ? (
              <>
                <Spinner className="mr-2 h-4 w-4" /> Explaining…
              </>
            ) : (
              'Explain'
            )}
          </Button>
          {data.status === 'open' && (
            <Button
              onClick={() => acknowledge.mutate(data.id)}
              disabled={acknowledge.isPending}
            >
              {acknowledge.isPending ? 'Acknowledging...' : 'Acknowledge'}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <div className="mb-5 border-t border-k-border pt-4">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-k-text-tertiary">Explanation</h3>
        <p className="text-sm leading-relaxed text-k-text-secondary">{data.explanation}</p>
      </div>

      {explain.error && (
        <div className="mb-5 rounded-md border border-k-danger-border bg-k-danger-bg p-3">
          <p className="text-sm text-k-danger-text">{explain.error.message}</p>
        </div>
      )}

      {explanation && (
        <div className="mb-5 rounded-md border border-k-border bg-k-elevated/50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-k-text">KAIRO analysis</h3>
            <Badge tone={explanation.output.mode === 'deterministic' ? 'success' : 'neutral'}>
              {explanation.output.mode === 'deterministic' ? 'verified data' : 'AI'}
            </Badge>
          </div>
          <p className="text-sm leading-relaxed text-k-text-secondary">{explanation.output.summary}</p>
          {explanation.output.details && explanation.output.details.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-k-text-secondary">
              {explanation.output.details.map((detail, i) => (
                <li key={i}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {Object.keys(data.metrics).length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-k-text-tertiary">Metrics</h3>
          <Table>
            <THead>
              <tr>
                <TH>Metric</TH>
                <TH>Value</TH>
              </tr>
            </THead>
            <tbody>
              {Object.entries(data.metrics).map(([key, value]) => (
                <TR key={key}>
                  <TD className="font-medium text-k-text">{key}</TD>
                  <TD>{typeof value === 'number' ? Number(value.toFixed(2)) : value}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function entityName(c: ConflictView): string {
  return (
    c.person_name ??
    c.team_name ??
    c.project_name ??
    c.phase_name ??
    c.person_id ??
    c.team_id ??
    c.project_id ??
    c.phase_id ??
    'Unknown'
  );
}

function severityBadgeTone(severity: ConflictSeverity): 'warning' | 'danger' | 'risk' {
  if (severity === 'warning') return 'warning';
  if (severity === 'at_risk') return 'risk';
  return 'danger';
}

function severityLabel(severity: ConflictSeverity): string {
  return severity === 'at_risk' ? 'At Risk' : severity.charAt(0).toUpperCase() + severity.slice(1);
}

function severityGroupBorder(severity: ConflictSeverity): string {
  switch (severity) {
    case 'critical':
      return 'border-b border-k-border last:border-b-0';
    default:
      return 'border-b border-k-border last:border-b-0';
  }
}

function severityGroupHeaderText(severity: ConflictSeverity): string {
  switch (severity) {
    case 'critical':
      return 'text-k-danger-text bg-k-danger-bg/40';
    case 'at_risk':
      return 'text-k-risk-text bg-k-risk-bg/40';
    case 'warning':
      return 'text-k-warning-text bg-k-warning-bg/40';
    default:
      return 'text-k-text-tertiary bg-k-elevated';
  }
}

function severityDot(severity: ConflictSeverity): string {
  switch (severity) {
    case 'critical':
      return 'bg-k-heat-critical';
    case 'at_risk':
      return 'bg-k-heat-high';
    case 'warning':
      return 'bg-k-heat-med';
    default:
      return 'bg-k-text-muted';
  }
}

function severityStripe(severity: ConflictSeverity): string {
  switch (severity) {
    case 'critical':
      return 'border-k-heat-critical';
    case 'at_risk':
      return 'border-k-heat-high';
    case 'warning':
      return 'border-k-heat-med';
    default:
      return 'border-k-border';
  }
}

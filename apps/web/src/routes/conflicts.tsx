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

const SEVERITIES: { value: ConflictSeverity; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'at_risk', label: 'At Risk' },
  { value: 'warning', label: 'Warning' },
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
    <div>
      <PageHeader title="Conflicts" subtitle="Detected capacity and timeline risks" />

      <section className="mb-4 flex flex-wrap gap-2">
        {SEVERITIES.map((s) => (
          <Badge key={s.value} tone={severityBadgeTone(s.value)}>
            {s.label}: {counts[s.value]}
          </Badge>
        ))}
      </section>

      <Card className="mb-6">
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-slate-600">Rule</label>
          <div className="flex flex-wrap gap-2">
            <Button variant={rule === '' ? 'primary' : 'secondary'} onClick={() => setRule('')}>
              All
            </Button>
            {RULES.map((r) => (
              <Button
                key={r.value}
                variant={rule === r.value ? 'primary' : 'secondary'}
                onClick={() => setRule(r.value)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Severity</label>
          <div className="flex flex-wrap gap-2">
            <Button variant={severity === '' ? 'primary' : 'secondary'} onClick={() => setSeverity('')}>
              All
            </Button>
            {SEVERITIES.map((s) => (
              <Button
                key={s.value}
                variant={severity === s.value ? 'primary' : 'secondary'}
                onClick={() => setSeverity(s.value)}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="mb-6 overflow-hidden p-0">
        {isLoading ? (
          <div className="flex items-center gap-2 p-6">
            <Spinner />
            <span className="text-slate-500">Loading conflicts...</span>
          </div>
        ) : !filtered || filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No conflicts" message="Adjust filters or rebuild the snapshot to refresh." />
          </div>
        ) : (
          <>
            {GROUP_ORDER.map((s) => {
              const items = grouped.get(s) ?? [];
              if (items.length === 0) return null;
              return (
                <div key={s}>
                  <div className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {severityLabel(s)} ({items.length})
                  </div>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Rule</TH>
                        <TH>Entity</TH>
                        <TH>Window</TH>
                        <TH>Severity</TH>
                        <TH className="w-full">Explanation</TH>
                      </tr>
                    </THead>
                    <tbody className="divide-y divide-slate-200">
                      {items.map((c) => (
                        <TR
                          key={c.id}
                          className="cursor-pointer"
                          onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
                        >
                          <TD>
                            <Badge tone="neutral">{c.rule}</Badge>
                          </TD>
                          <TD>{entityName(c)}</TD>
                          <TD className="whitespace-nowrap">{c.window_start} → {c.window_end}</TD>
                          <TD>
                            <Badge tone={severityBadgeTone(c.severity)}>{severityLabel(c.severity)}</Badge>
                          </TD>
                          <TD>
                            <p className="max-w-xl truncate text-slate-700">{c.explanation}</p>
                          </TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                </div>
              );
            })}
          </>
        )}
      </Card>

      {data?.nextCursor && (
        <div className="mb-8 flex items-center justify-end">
          <Button variant="secondary" onClick={() => setCursor(data.nextCursor)}>
            Next page
          </Button>
        </div>
      )}

      {selectedId && <ConflictDetail id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
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
          <span className="text-slate-500">Loading conflict detail...</span>
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
    <Card>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Badge tone="neutral">{data.rule}</Badge>
            <Badge tone={severityBadgeTone(data.severity)}>{severityLabel(data.severity)}</Badge>
            <Badge tone={data.status === 'open' ? 'warning' : 'neutral'}>{data.status}</Badge>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">{entityName(data)}</h2>
          <p className="text-sm text-slate-500">
            {data.window_start} → {data.window_end}
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      <div className="mb-6">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Explanation</h3>
        <p className="text-sm leading-relaxed text-slate-700">{data.explanation}</p>
      </div>

      {explain.error && (
        <div className="mb-6 rounded border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{explain.error.message}</p>
        </div>
      )}

      {explanation && (
        <div className="mb-6 rounded border border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">KAIRO analysis</h3>
            <Badge tone={explanation.output.mode === 'deterministic' ? 'success' : 'neutral'}>
              {explanation.output.mode === 'deterministic' ? 'verified data' : 'AI'}
            </Badge>
          </div>
          <p className="text-sm leading-relaxed text-slate-700">{explanation.output.summary}</p>
          {explanation.output.details && explanation.output.details.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {explanation.output.details.map((detail, i) => (
                <li key={i}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {Object.keys(data.metrics).length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Metrics</h3>
          <Table>
            <THead>
              <tr>
                <TH>Metric</TH>
                <TH>Value</TH>
              </tr>
            </THead>
            <tbody className="divide-y divide-slate-200">
              {Object.entries(data.metrics).map(([key, value]) => (
                <TR key={key}>
                  <TD className="font-medium">{key}</TD>
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

function severityBadgeTone(severity: ConflictSeverity): 'warning' | 'danger' {
  return severity === 'warning' ? 'warning' : 'danger';
}

function severityLabel(severity: ConflictSeverity): string {
  return severity === 'at_risk' ? 'At Risk' : severity.charAt(0).toUpperCase() + severity.slice(1);
}

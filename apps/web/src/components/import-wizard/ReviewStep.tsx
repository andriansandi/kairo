import { Button, Card, Badge, Table, THead, TH, TR, TD } from '../ui';
import type { RowValidationResult, RowValidationError, RowValidationWarning, TimelineImportRow } from './parse';
import { FIELD_LABELS } from './parse';

interface ReviewStepProps {
  previewRows: TimelineImportRow[];
  buildResult: RowValidationResult;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

function rowsWithIssues(errors: RowValidationError[], warnings: RowValidationWarning[]) {
  const byRow = new Map<number, { errors: RowValidationError[]; warnings: RowValidationWarning[] }>();
  for (const e of errors) {
    const entry = byRow.get(e.row) ?? { errors: [], warnings: [] };
    entry.errors.push(e);
    byRow.set(e.row, entry);
  }
  for (const w of warnings) {
    const entry = byRow.get(w.row) ?? { errors: [], warnings: [] };
    entry.warnings.push(w);
    byRow.set(w.row, entry);
  }
  return byRow;
}

export function ReviewStep({ previewRows, buildResult, onBack, onSubmit, isSubmitting }: ReviewStepProps) {
  const { rows: validRows, errors, warnings } = buildResult;
  const byRow = rowsWithIssues(errors, warnings);
  const hasErrors = errors.length > 0;

  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold text-slate-900">3. Review rows</h2>
          <p className="mb-4 text-sm text-slate-600">
        Valid rows: <strong>{validRows.length}</strong> · Preview rows: <strong>{previewRows.length}</strong> · Errors:{' '}
        <strong>{errors.length}</strong> · Warnings: <strong>{warnings.length}</strong>
      </p>

      {hasErrors && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Some rows have errors and will be skipped. Fix the file and re-upload, or continue to submit the valid rows.
        </div>
      )}

      <div className="max-h-96 overflow-auto">
        <Table>
          <THead>
            <tr>
              <TH>Row</TH>
              <TH>{FIELD_LABELS.project_name}</TH>
              <TH>{FIELD_LABELS.phase_name}</TH>
              <TH>{FIELD_LABELS.start_date}</TH>
              <TH>{FIELD_LABELS.end_date}</TH>
              <TH>{FIELD_LABELS.fte}</TH>
              <TH>{FIELD_LABELS.person_email}</TH>
              <TH>Issues</TH>
            </tr>
          </THead>
          <tbody className="divide-y divide-slate-200">
            {previewRows.map((row, idx) => {
              const issues = byRow.get(idx + 1);
              const errCount = issues?.errors.length ?? 0;
              const warnCount = issues?.warnings.length ?? 0;
              return (
                <TR key={idx} className={errCount > 0 ? 'bg-red-50' : warnCount > 0 ? 'bg-amber-50' : undefined}>
                  <TD>{idx + 1}</TD>
                  <TD>{row.project_name}</TD>
                  <TD>{row.phase_name}</TD>
                  <TD>{row.start_date}</TD>
                  <TD>{row.end_date}</TD>
                  <TD>{row.fte ?? '—'}</TD>
                  <TD>{row.person_email ?? '—'}</TD>
                  <TD>
                    <span className="flex flex-wrap gap-1">
                      {errCount > 0 && <Badge tone="danger">{errCount} error{errCount > 1 ? 's' : ''}</Badge>}
                      {warnCount > 0 && (
                        <Badge tone="warning">
                          {warnCount} warning{warnCount > 1 ? 's' : ''}
                        </Badge>
                      )}
                      {errCount === 0 && warnCount === 0 && '—'}
                    </span>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </div>

      {hasErrors && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 p-3">
          <h3 className="text-sm font-semibold text-red-900">Errors</h3>
          <ul className="mt-1 list-inside list-disc text-sm text-red-700">
            {errors.map((e, i) => (
              <li key={i}>
                Row {e.row}
                {e.field ? ` · ${FIELD_LABELS[e.field as keyof typeof FIELD_LABELS] ?? e.field}` : ''}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onBack} disabled={isSubmitting}>
          Fix file
        </Button>
        <Button onClick={onSubmit} disabled={isSubmitting}>
          {isSubmitting ? 'Submitting...' : 'Submit import'}
        </Button>
      </div>
    </Card>
  );
}

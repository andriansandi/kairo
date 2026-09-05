import { Button, Card, ErrorState, Spinner } from '../ui';
import type { ImportSubmissionResult } from '../../api/imports';

interface SubmitStepProps {
  result: ImportSubmissionResult | null;
  error: Error | null;
  isPending: boolean;
  onBack: () => void;
  onContinue: () => void;
}

export function SubmitStep({ result, error, isPending, onBack, onContinue }: SubmitStepProps) {
  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-k-text">4. Server validation</h2>

      {isPending && (
        <div className="flex items-center gap-2 text-sm text-k-text-secondary">
          <Spinner />
          Uploading and validating...
        </div>
      )}

      {error && <ErrorState title="Import failed" message={error.message} />}

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(result.counts).map(([key, value]) => (
              <div key={key} className="rounded-md border border-k-border bg-k-elevated/50 p-3">
                <div className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">{key}</div>
                <div className="text-lg font-semibold text-k-text">{value ?? 0}</div>
              </div>
            ))}
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-md border border-k-danger-border bg-k-danger-bg p-3">
              <h3 className="text-sm font-semibold text-k-danger-text">Server errors</h3>
              <ul className="mt-1 list-inside list-disc text-sm text-k-danger-text/90">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    Row {e.row}
                    {e.field ? ` · ${e.field}` : ''}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="rounded-md border border-k-warning-border bg-k-warning-bg p-3">
              <h3 className="text-sm font-semibold text-k-warning-text">Server warnings</h3>
              <ul className="mt-1 list-inside list-disc text-sm text-k-warning-text/90">
                {result.warnings.map((w, i) => (
                  <li key={i}>
                    Row {w.row}: {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.errors.length === 0 && (
            <div className="rounded-md border border-k-success-border bg-k-success-bg p-3 text-sm text-k-success-text">
              Validation passed. Continue to map projects and people.
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onBack} disabled={isPending}>
              Back
            </Button>
            <Button onClick={onContinue} disabled={!result || result.errors.length > 0}>
              Confirm mappings
            </Button>
          </div>
        </div>
      )}

      {!result && !isPending && !error && (
        <p className="text-sm text-k-text-muted">Submit to see server-side validation results.</p>
      )}
    </Card>
  );
}

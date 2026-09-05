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
      <h2 className="mb-4 text-lg font-semibold text-slate-900">4. Server validation</h2>

      {isPending && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Spinner />
          Uploading and validating...
        </div>
      )}

      {error && <ErrorState title="Import failed" message={error.message} />}

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(result.counts).map(([key, value]) => (
              <div key={key} className="rounded border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{key}</div>
                <div className="text-lg font-semibold text-slate-900">{value ?? 0}</div>
              </div>
            ))}
          </div>

          {result.errors.length > 0 && (
            <div className="rounded border border-red-200 bg-red-50 p-3">
              <h3 className="text-sm font-semibold text-red-900">Server errors</h3>
              <ul className="mt-1 list-inside list-disc text-sm text-red-700">
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
            <div className="rounded border border-amber-200 bg-amber-50 p-3">
              <h3 className="text-sm font-semibold text-amber-900">Server warnings</h3>
              <ul className="mt-1 list-inside list-disc text-sm text-amber-800">
                {result.warnings.map((w, i) => (
                  <li key={i}>
                    Row {w.row}: {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.errors.length === 0 && (
            <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
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
        <p className="text-sm text-slate-500">Submit to see server-side validation results.</p>
      )}
    </Card>
  );
}

import { useEffect } from 'react';
import { Button, Card, Select } from '../ui';
import type { CanonicalField } from './parse';
import { CANONICAL_FIELDS, FIELD_LABELS, REQUIRED_FIELDS, guessMapping } from './parse';

interface MappingStepProps {
  headers: unknown[];
  mapping: Record<CanonicalField, string | undefined>;
  onMappingChange: (mapping: Record<CanonicalField, string | undefined>) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function MappingStep({ headers, mapping, onMappingChange, onContinue, onBack }: MappingStepProps) {
  useEffect(() => {
    if (headers.length > 0 && !Object.values(mapping).some(Boolean)) {
      onMappingChange(guessMapping(headers));
    }
  }, [headers, mapping, onMappingChange]);

  const columnOptions = headers
    .map((h, i) => ({ label: h === null || h === undefined ? `(column ${i + 1})` : String(h), value: String(h) }))
    .filter((h) => h.label.trim() !== '');

  const isComplete = REQUIRED_FIELDS.every((field) => !!mapping[field]);

  const updateField = (field: CanonicalField, header: string) => {
    onMappingChange({ ...mapping, [field]: header || undefined });
  };

  return (
    <Card>
      <h2 className="mb-1 text-base font-semibold text-k-text">2. Map columns</h2>
      <p className="mb-4 text-sm text-k-text-secondary">
        Match each KAIRO field to a column in your sheet. Required fields must be mapped before you can continue.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {CANONICAL_FIELDS.map((field) => {
          const required = REQUIRED_FIELDS.includes(field);
          return (
            <div key={field}>
              <label className="mb-1 block text-sm font-medium text-k-text-secondary">
                {FIELD_LABELS[field]}
                {required && <span className="ml-1 text-k-danger-text">*</span>}
              </label>
              <Select value={mapping[field] ?? ''} onChange={(e) => updateField(field, e.target.value)}>
                <option value="">— unmapped —</option>
                {columnOptions.map((col) => (
                  <option key={`${field}-${col.value}-${col.label}`} value={col.value}>
                    {col.label}
                  </option>
                ))}
              </Select>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onContinue} disabled={!isComplete}>
          Review rows
        </Button>
      </div>
    </Card>
  );
}

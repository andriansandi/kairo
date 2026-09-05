import { useMemo } from 'react';
import { Input, Select } from '../ui';

export interface SearchableOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  query,
  onQueryChange,
  placeholder = 'Search...',
  emptyLabel = 'No matches',
  disabled,
}: SearchableSelectProps) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div className="space-y-1">
      <Input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">{filtered.length === 0 ? emptyLabel : '— select —'}</option>
        {filtered.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

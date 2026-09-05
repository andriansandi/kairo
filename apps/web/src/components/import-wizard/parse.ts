import {
  CANONICAL_FIELDS,
  FIELD_LABELS,
  parseFteCell,
  validateRows,
  type TimelineImportRow,
  type ValidateRowsResult,
  type RowError,
  type RowWarning,
} from '@kairo/xls-import';

export {
  CANONICAL_FIELDS,
  FIELD_LABELS,
  parseFteCell,
  validateRows,
  type TimelineImportRow,
  type ValidateRowsResult,
  type RowError,
  type RowWarning,
};

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];
export type RowValidationResult = ValidateRowsResult;
export type RowValidationError = RowError;
export type RowValidationWarning = RowWarning;

export const REQUIRED_FIELDS: CanonicalField[] = ['project_name', 'phase_name', 'start_date', 'end_date'];

const HEADER_SYNONYMS: Record<CanonicalField, string[]> = {
  project_code: ['project code', 'code', 'project_code'],
  project_name: ['project name', 'project_name', 'project'],
  phase_name: ['phase name', 'phase_name', 'phase', 'workstream'],
  phase_sequence: ['phase sequence', 'sequence', 'order', '#'],
  start_date: ['start date', 'start_date', 'start', 'from', 'begin'],
  end_date: ['end date', 'end_date', 'end', 'due', 'finish', 'to'],
  effort_hours: ['effort hours', 'effort_hours', 'effort', 'hours', 'work hours'],
  person_email: ['person email', 'person_email', 'email', 'e-mail'],
  person_name: ['person name', 'person_name', 'person', 'team member', 'resource'],
  fte: ['fte', 'allocation', 'percent', 'load'],
  milestone: ['milestone', 'flag', 'checkpoint'],
  notes: ['notes', 'comment', 'description', 'remarks', 'note'],
};

function normalizeHeader(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim().toLowerCase();
}

export function guessMapping(headers: unknown[]): Record<CanonicalField, string | undefined> {
  const normalized = headers.map(normalizeHeader);
  const mapping = Object.fromEntries(CANONICAL_FIELDS.map((f) => [f, undefined])) as Record<
    CanonicalField,
    string | undefined
  >;

  for (const field of CANONICAL_FIELDS) {
    const candidates = [field.replace(/_/g, ' '), field, ...HEADER_SYNONYMS[field]];
    for (let i = 0; i < normalized.length; i++) {
      const h = normalized[i];
      if (!h) continue;
      if (candidates.some((c) => h === c || h.includes(c))) {
        const original = headers[i];
        mapping[field] = typeof original === 'string' ? original : String(original);
        break;
      }
    }
  }
  return mapping;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toIsoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const yyyy = v.getFullYear();
    const mm = pad(v.getMonth() + 1);
    const dd = pad(v.getDate());
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    return null;
  }
  if (typeof v === 'number' && !Number.isNaN(v)) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
  }
  return null;
}

function toNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isNaN(n) ? undefined : n;
}

function toStringOrUndefined(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

export function buildCanonicalRow(
  rawRow: unknown[],
  headers: unknown[],
  mapping: Record<CanonicalField, string | undefined>,
): TimelineImportRow {
  const get = (field: CanonicalField): unknown => {
    const header = mapping[field];
    if (header === undefined) return undefined;
    const idx = headers.findIndex((h) => String(h).trim() === header.trim());
    return idx >= 0 ? rawRow[idx] : undefined;
  };

  const startDate = toIsoDate(get('start_date'));
  const endDate = toIsoDate(get('end_date'));

  const row: TimelineImportRow = {
    project_name: toStringOrUndefined(get('project_name')) ?? '',
    phase_name: toStringOrUndefined(get('phase_name')) ?? '',
    start_date: startDate ?? '',
    end_date: endDate ?? '',
  };

  const code = toStringOrUndefined(get('project_code'));
  if (code) row.project_code = code;

  const seq = toNumber(get('phase_sequence'));
  if (seq !== undefined) row.phase_sequence = seq;

  const effort = toNumber(get('effort_hours'));
  if (effort !== undefined) row.effort_hours = effort;

  const email = toStringOrUndefined(get('person_email'));
  if (email) row.person_email = email;

  const name = toStringOrUndefined(get('person_name'));
  if (name) row.person_name = name;

  const fte = parseFteCell(get('fte'));
  if (fte !== null) row.fte = fte;

  const milestone = toStringOrUndefined(get('milestone'));
  if (milestone) row.milestone = milestone;

  const notes = toStringOrUndefined(get('notes'));
  if (notes) row.notes = notes;

  return row;
}

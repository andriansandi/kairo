import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Button, Card, Input, Select, ErrorState, Spinner } from '../ui';

export interface UploadPayload {
  file: File;
  workbook: XLSX.WorkBook;
  sheetName: string;
  rows: unknown[][];
}

interface UploadStepProps {
  onFileLoaded: (payload: UploadPayload) => void;
  onCancel: () => void;
}

export function UploadStep({ onFileLoaded, onCancel }: UploadStepProps) {
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetName, setSheetName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setError('');
    setWorkbook(null);
    setSheetName('');
    if (!selected) return;

    setLoading(true);
    try {
      const data = await selected.arrayBuffer();
      const wb = XLSX.read(data, { cellDates: true });
      setWorkbook(wb);
      const first = wb.SheetNames[0] ?? '';
      setSheetName(first);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to read file');
    } finally {
      setLoading(false);
    }
  };

  const rowsForSheet = (wb: XLSX.WorkBook, name: string): unknown[][] => {
    const sheet = wb.Sheets[name];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  };

  const handleContinue = () => {
    if (!file || !workbook || !sheetName) return;
    const rows = rowsForSheet(workbook, sheetName);
    if (rows.length < 2) {
      setError('Sheet must contain a header row and at least one data row');
      return;
    }
    onFileLoaded({ file, workbook, sheetName, rows });
  };

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-slate-900">1. Upload spreadsheet</h2>

      {error && (
        <div className="mb-4">
          <ErrorState title="Upload failed" message={error} />
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">File</label>
          <Input
            type="file"
            accept=".xls,.xlsx,.csv"
            onChange={handleFileChange}
            disabled={loading}
          />
          <p className="mt-1 text-xs text-slate-500">Supported: .xls, .xlsx, .csv</p>
        </div>

        {workbook && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Sheet</label>
            <Select value={sheetName} onChange={(e) => setSheetName(e.target.value)}>
              {workbook.SheetNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Spinner />
            Reading file...
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleContinue} disabled={!file || !workbook || loading}>
            Continue
          </Button>
        </div>
      </div>
    </Card>
  );
}

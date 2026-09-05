import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import type { UploadPayload } from './UploadStep';
import { UploadStep } from './UploadStep';
import { MappingStep } from './MappingStep';
import { ReviewStep } from './ReviewStep';
import { SubmitStep } from './SubmitStep';
import { ConfirmStep } from './ConfirmStep';
import { buildCanonicalRow, guessMapping, validateRows, type CanonicalField, type RowValidationResult } from './parse';
import { useCreateImport, type ImportSubmissionResult } from '../../api/imports';

type WizardStep = 'upload' | 'mapping' | 'review' | 'submit' | 'confirm';

interface ImportWizardProps {
  onClose: () => void;
}

export function ImportWizard({ onClose }: ImportWizardProps) {
  const [step, setStep] = useState<WizardStep>('upload');

  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [rawRows, setRawRows] = useState<unknown[][]>([]);
  const [mapping, setMapping] = useState<Record<CanonicalField, string | undefined>>({
    project_code: undefined,
    project_name: undefined,
    phase_name: undefined,
    phase_sequence: undefined,
    start_date: undefined,
    end_date: undefined,
    effort_hours: undefined,
    person_email: undefined,
    person_name: undefined,
    fte: undefined,
    milestone: undefined,
    notes: undefined,
  });

  const [submitResult, setSubmitResult] = useState<ImportSubmissionResult | null>(null);
  const [importId, setImportId] = useState<string>('');

  const createImport = useCreateImport();

  const headers = rawRows[0] ?? [];
  const dataRows = rawRows.slice(1);

  const builtRows = useMemo(() => {
    if (dataRows.length === 0) return [];
    return dataRows.map((row) => buildCanonicalRow(row, headers, mapping));
  }, [dataRows, headers, mapping]);

  const buildResult: RowValidationResult | null = useMemo(() => {
    if (builtRows.length === 0) return null;
    return validateRows(builtRows);
  }, [builtRows]);

  const validRows = useMemo(() => {
    if (!buildResult) return [];
    const erroredRows = new Set(buildResult.errors.map((e) => e.row));
    return builtRows.filter((_, idx) => !erroredRows.has(idx + 1));
  }, [buildResult, builtRows]);

  const handleFileLoaded = (payload: UploadPayload) => {
    setFile(payload.file);
    setWorkbook(payload.workbook);
    setRawRows(payload.rows);
    setMapping(guessMapping(payload.rows[0] ?? []));
    setStep('mapping');
  };

  const handleSubmit = () => {
    if (!file || !buildResult) return;
    setStep('submit');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('rows', JSON.stringify(buildResult.rows));
    createImport.mutate(formData, {
      onSuccess: (data) => {
        setSubmitResult(data);
        setImportId(data.import.id);
      },
    });
  };

  switch (step) {
    case 'upload':
      return (
        <UploadStep
          onFileLoaded={handleFileLoaded}
          onCancel={onClose}
        />
      );
    case 'mapping':
      return (
        <MappingStep
          headers={headers}
          mapping={mapping}
          onMappingChange={setMapping}
          onContinue={() => setStep('review')}
          onBack={() => setStep('upload')}
        />
      );
    case 'review':
      if (!buildResult) return null;
      return (
        <ReviewStep
          previewRows={builtRows}
          buildResult={buildResult}
          onBack={() => setStep('mapping')}
          onSubmit={handleSubmit}
          isSubmitting={createImport.isPending}
        />
      );
    case 'submit':
      return (
        <SubmitStep
          result={submitResult}
          error={createImport.error}
          isPending={createImport.isPending}
          onBack={() => setStep('review')}
          onContinue={() => setStep('confirm')}
        />
      );
    case 'confirm':
      if (!importId) return null;
      return <ConfirmStep importId={importId} rows={validRows} onClose={onClose} />;
  }
}

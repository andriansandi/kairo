import { createRoute } from '@tanstack/react-router';
import { settingsRoute } from './layout';
import { PageHeader, Button, Card, Badge, Table, THead, TH, TR, TD, Spinner, ErrorState, EmptyState } from '../../components/ui';
import { useDeleteImport, useImports } from '../../api/imports';
import { ImportWizard } from '../../components/import-wizard/ImportWizard';
import { useState } from 'react';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

function ImportList() {
  const { data: imports, isLoading, error, refetch } = useImports();
  const deleteImport = useDeleteImport();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-slate-600">
        <Spinner />
        Loading imports...
      </div>
    );
  }

  if (error) {
    return <ErrorState title="Could not load imports" message={error.message} retry={refetch} />;
  }

  if (!imports || imports.length === 0) {
    return <EmptyState title="No imports yet" message="Upload a spreadsheet to import timeline data." />;
  }

  return (
    <Table>
      <THead>
        <tr>
          <TH>Created</TH>
          <TH>Status</TH>
          <TH>Counts</TH>
          <TH>Uploaded by</TH>
          <TH></TH>
        </tr>
      </THead>
      <tbody className="divide-y divide-slate-200">
        {imports.map((imp) => {
          const counts = typeof imp.row_report?.length === 'number' ? { rows: imp.row_report.length } : undefined;
          return (
            <TR key={imp.id}>
              <TD>{formatDate(imp.created_at)}</TD>
              <TD>
                {imp.status === 'confirmed' && <Badge tone="success">Confirmed</Badge>}
                {imp.status === 'draft' && <Badge tone="warning">Draft</Badge>}
                {imp.status === 'rejected' && <Badge tone="danger">Rejected</Badge>}
              </TD>
              <TD>
                {counts ? (
                  <span className="text-sm text-slate-700">{counts.rows} row{counts.rows === 1 ? '' : 's'}</span>
                ) : (
                  '—'
                )}
              </TD>
              <TD>{imp.uploaded_by}</TD>
              <TD>
                {imp.status === 'draft' && (
                  <Button
                    variant="danger"
                    className="py-1 px-2 text-xs"
                    onClick={() => deleteImport.mutate(imp.id)}
                    disabled={deleteImport.isPending}
                  >
                    Delete
                  </Button>
                )}
              </TD>
            </TR>
          );
        })}
      </tbody>
    </Table>
  );
}

function ImportsPage() {
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="Imports"
        subtitle="Upload XLS timelines and manage imported drafts."
        actions={
          !wizardOpen && (
            <Button onClick={() => setWizardOpen(true)}>New import</Button>
          )
        }
      />

      {wizardOpen ? (
        <ImportWizard onClose={() => setWizardOpen(false)} />
      ) : (
        <Card>
          <ImportList />
        </Card>
      )}
    </div>
  );
}

export const settingsImportsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/imports',
  component: ImportsPage,
});

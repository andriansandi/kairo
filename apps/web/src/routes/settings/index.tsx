import { createRoute } from '@tanstack/react-router';
import { settingsRoute } from './layout';
import { PageHeader, Card } from '../../components/ui';

export const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/',
  component: GeneralSettings,
});

function GeneralSettings() {
  return (
    <div>
      <PageHeader title="General" />
      <Card>
        <h2 className="text-lg font-semibold text-slate-900">Phase 1 note</h2>
        <p className="mt-2 text-sm text-slate-600">
          Org-wide defaults are configured here. Editing these values is planned for Phase 2; for now they are read-only.
        </p>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Working days</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">Monday – Friday</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Default overhead</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">20%</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}

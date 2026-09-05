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
        <h2 className="text-base font-semibold text-k-text">Phase 1 note</h2>
        <p className="mt-2 text-sm text-k-text-secondary">
          Org-wide defaults are configured here. Editing these values is planned for Phase 2; for now they are read-only.
        </p>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Working days</dt>
            <dd className="mt-1 text-sm font-semibold text-k-text">Monday – Friday</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-k-text-tertiary">Default overhead</dt>
            <dd className="mt-1 text-sm font-semibold text-k-text">20%</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}

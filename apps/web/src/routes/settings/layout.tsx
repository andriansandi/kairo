import { createRoute, Link, Outlet } from '@tanstack/react-router';
import { rootRoute } from '../layout';

const tabs = [
  { label: 'General', path: '/settings' },
  { label: 'Teams', path: '/settings/teams' },
  { label: 'Sync', path: '/settings/sync' },
  { label: 'Imports', path: '/settings/imports' },
];

function SettingsLayout() {
  return (
    <div>
      <PageHeader title="Settings" />
      <nav className="mb-6 border-b border-k-border">
        <ul className="flex gap-6">
          {tabs.map((t) => (
            <li key={t.path}>
              <Link
                to={t.path}
                activeOptions={{ exact: t.path === '/settings' }}
                className="inline-block border-b-2 border-transparent px-1 pb-3 text-sm font-medium text-k-text-secondary transition-colors hover:text-k-text"
                activeProps={{ className: 'border-k-text text-k-text' }}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}

function PageHeader({ title }: { title: string }) {
  return <h1 className="mb-6 text-2xl font-semibold tracking-tight text-k-text">{title}</h1>;
}

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsLayout,
});

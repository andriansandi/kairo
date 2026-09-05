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
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Settings</h1>
      <nav className="mb-6 border-b border-slate-200">
        <ul className="flex gap-6">
          {tabs.map((t) => (
            <li key={t.path}>
              <Link
                to={t.path}
                activeOptions={{ exact: t.path === '/settings' }}
                className="inline-block border-b-2 border-transparent px-1 pb-3 text-sm font-medium text-slate-600 hover:text-slate-900"
                activeProps={{ className: 'border-slate-900 text-slate-900' }}
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

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsLayout,
});

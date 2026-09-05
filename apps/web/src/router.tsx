import { createRootRoute, createRoute, createRouter, Link, Outlet } from '@tanstack/react-router';
import Dashboard from './routes/dashboard';
import Placeholder from './routes/placeholder';

type ModuleDef = {
  label: string;
  path: string;
  title: string;
};

const modules: ModuleDef[] = [
  { label: 'Dashboard', path: '/', title: 'Dashboard' },
  { label: 'Projects', path: '/projects', title: 'Projects' },
  { label: 'Work / JRs', path: '/work', title: 'Work / JRs' },
  { label: 'People', path: '/people', title: 'People' },
  { label: 'Skills', path: '/skills', title: 'Skills' },
  { label: 'Capacity', path: '/capacity', title: 'Capacity' },
  { label: 'Conflicts', path: '/conflicts', title: 'Conflicts' },
  { label: 'Scenarios', path: '/scenarios', title: 'Scenarios' },
  { label: 'AI Advisor', path: '/ai-advisor', title: 'AI Advisor' },
  { label: 'Settings', path: '/settings', title: 'Settings' },
];

const rootRoute = createRootRoute({
  component: Root,
});

function Root() {
  return (
    <div className="flex h-screen bg-gray-50 text-slate-900">
      <aside className="flex w-64 flex-col bg-slate-900 text-white">
        <div className="px-6 py-5">
          <span className="text-xl font-bold tracking-tight">KAIRO</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-4">
          <ul className="space-y-1">
            {modules.map((m) => (
              <li key={m.path}>
                <Link
                  to={m.path}
                  activeOptions={{ exact: m.path === '/' }}
                  className="block rounded px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
                  activeProps={{ className: 'bg-slate-800 text-white' }}
                >
                  {m.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Dashboard,
});

const placeholderRoutes = modules.slice(1).map((m) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: m.path.slice(1),
    component: () => <Placeholder title={m.title} />,
  })
);

const routeTree = rootRoute.addChildren([indexRoute, ...placeholderRoutes]);

export const router = createRouter({ routeTree });

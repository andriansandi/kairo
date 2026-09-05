import { createRootRoute, Link, Outlet } from '@tanstack/react-router';

type ModuleDef = {
  label: string;
  path: string;
};

const modules: ModuleDef[] = [
  { label: 'Dashboard', path: '/' },
  { label: 'Projects', path: '/projects' },
  { label: 'Work / JRs', path: '/work' },
  { label: 'People', path: '/people' },
  { label: 'Skills', path: '/skills' },
  { label: 'Capacity', path: '/capacity' },
  { label: 'Conflicts', path: '/conflicts' },
  { label: 'Scenarios', path: '/scenarios' },
  { label: 'AI Advisor', path: '/ai-advisor' },
  { label: 'Settings', path: '/settings' },
];

function RootLayout() {
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

export const rootRoute = createRootRoute({
  component: RootLayout,
});

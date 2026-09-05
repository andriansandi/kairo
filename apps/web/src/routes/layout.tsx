import {
  createRootRoute,
  Link,
  Outlet,
  redirect,
  useRouterState,
} from '@tanstack/react-router';
import { Toaster } from '@/components/shadcn/sonner';
import { TooltipProvider } from '@/components/shadcn/tooltip';
import { UserMenu } from '@/components/user-menu';
import { useMe } from '@/api/auth';

type ModuleDef = {
  label: string;
  path: string;
};

type GroupDef = {
  label: string;
  items: ModuleDef[];
};

const groups: GroupDef[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', path: '/' }],
  },
  {
    label: 'Plan',
    items: [
      { label: 'Projects', path: '/projects' },
      { label: 'Work / JRs', path: '/work' },
    ],
  },
  {
    label: 'Resources',
    items: [
      { label: 'People', path: '/people' },
      { label: 'Skills', path: '/skills' },
      { label: 'Capacity', path: '/capacity' },
    ],
  },
  {
    label: 'Risks',
    items: [
      { label: 'Conflicts', path: '/conflicts' },
      { label: 'Scenarios', path: '/scenarios' },
    ],
  },
  {
    label: 'Insights',
    items: [{ label: 'AI Advisor', path: '/ai-advisor' }],
  },
];

const settings: ModuleDef = { label: 'Settings', path: '/settings' };

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: user } = useMe();

  if (pathname === '/login') {
    return (
      <TooltipProvider>
        <div className="min-h-screen bg-k-base text-k-text">
          <Outlet />
        </div>
        <Toaster position="bottom-right" richColors closeButton />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-k-base text-k-text">
        <aside className="flex w-60 flex-col bg-k-sidebar text-k-sidebar-text">
          <div className="px-5 py-4">
            <div className="text-lg font-semibold tracking-tight text-white">KAIRO</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-k-sidebar-muted">
              Delivery & Resource Intelligence
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4">
            {groups.map((group) => (
              <div key={group.label}>
                <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-k-sidebar-muted/80">
                  {group.label}
                </div>
                <ul className="space-y-0.5">
                  {group.items.map((m) => (
                    <li key={m.path}>
                      <NavLink to={m.path} exact={m.path === '/'}>
                        {m.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="mt-auto pt-4">
              <ul className="space-y-0.5">
                <li>
                  <NavLink to={settings.path} exact={settings.path === '/'}>
                    {settings.label}
                  </NavLink>
                </li>
              </ul>
              {user ? <UserMenu user={user} /> : null}
            </div>
          </nav>
        </aside>
        <main className="flex-1 overflow-auto p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
          <Toaster position="bottom-right" richColors closeButton />
        </main>
      </div>
    </TooltipProvider>
  );
}

function NavLink({
  to,
  exact,
  children,
}: {
  to: string;
  exact: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      className="block rounded-md px-3 py-1.5 text-sm font-medium text-k-sidebar-muted transition-colors hover:bg-k-sidebar-hover hover:text-white"
      activeProps={{ className: 'bg-k-sidebar-active text-white' }}
    >
      {children}
    </Link>
  );
}

export const rootRoute = createRootRoute({
  beforeLoad: async ({ location }) => {
    if (location.pathname === '/login') return;
    const res = await fetch('/api/v1/auth/me');
    if (!res.ok) throw redirect({ to: '/login' });
  },
  component: RootLayout,
});

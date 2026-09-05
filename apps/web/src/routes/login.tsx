import { useState } from 'react';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { rootRoute } from './layout';
import { useLogin } from '../api/auth';
import { ApiError } from '../api/client';
import { Button, Card, Input, Spinner } from '../components/ui';

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const login = useLogin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    login.mutate(
      { username, password },
      {
        onSuccess: () => {
          navigate({ to: '/' });
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 401) {
            setError('Invalid username or password');
            return;
          }
          toast.error(err.message || 'Login failed');
        },
      },
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-k-base p-6 text-k-text">
      <Card className="w-full max-w-sm">
        <div className="mb-6">
          <div className="text-lg font-semibold tracking-tight text-k-text">KAIRO</div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-k-text-secondary">
            Delivery & Resource Intelligence
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="mb-1 block text-xs font-medium text-k-text-secondary"
            >
              Username
            </label>
            <Input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-xs font-medium text-k-text-secondary"
            >
              Password
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="rounded-md border border-k-danger-border bg-k-danger-bg px-3 py-2 text-sm text-k-danger-text">
              {error}
            </p>
          )}

          <Button type="submit" disabled={login.isPending} className="w-full">
            {login.isPending && <Spinner className="mr-2" />}
            Sign in
          </Button>
        </form>
      </Card>
    </div>
  );
}

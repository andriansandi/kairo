import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { AuthUser } from '@kairo/types';
import { apiFetch } from './client';

export type { AuthUser };

type LoginBody = { username: string; password: string };
type LoginResponse = { user: AuthUser };
type MeResponse = { user: AuthUser };
type PasswordBody = { currentPassword: string; newPassword: string };
type PasswordResponse = { user: AuthUser };

export function useMe() {
  return useQuery<MeResponse, Error, AuthUser>({
    queryKey: ['me'],
    queryFn: () => apiFetch<MeResponse>('/api/v1/auth/me'),
    select: (data) => data.user,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation<LoginResponse, Error, LoginBody>({
    mutationFn: (body) =>
      apiFetch<LoginResponse>('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation<{ ok: true }, Error>({
    mutationFn: () =>
      apiFetch<{ ok: true }>('/api/v1/auth/logout', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.clear();
      navigate({ to: '/login' });
    },
  });
}

export function useChangePassword() {
  return useMutation<PasswordResponse, Error, PasswordBody>({
    mutationFn: (body) =>
      apiFetch<PasswordResponse>('/api/v1/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
  });
}

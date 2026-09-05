export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(
    message: string,
    { status, code, details }: { status: number; code: string; details?: unknown },
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network request failed";
    throw new ApiError(message, { status: 0, code: "network_error" });
  }

  if (!res.ok) {
    let body: { error?: { code: string; message?: string; details?: unknown } } | undefined;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    if (
      res.status === 401 &&
      !path.startsWith('/api/v1/auth/login') &&
      typeof window !== 'undefined' &&
      window.location.pathname !== '/login'
    ) {
      window.location.assign('/login');
    }
    throw new ApiError(body?.error?.message ?? res.statusText, {
      status: res.status,
      code: body?.error?.code ?? "api_error",
      details: body?.error?.details,
    });
  }

  return res.json() as Promise<T>;
}

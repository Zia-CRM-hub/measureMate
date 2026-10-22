export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: { path: string; message: string }[]) {
    super(message);
  }
}

function csrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie.split('; ').find((c) => c.startsWith('mm_csrf='))?.split('=')[1];
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    const t = csrfToken();
    if (t) headers['x-csrf-token'] = t;
  }
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method, headers, credentials: 'include', body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? 'Something went wrong', e?.details);
  }
  return data as T;
}

export const post = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} });
export const patch = <T,>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });
export const del = <T,>(path: string) => api<T>(path, { method: 'DELETE' });

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.details?.length) return `${e.message}: ${e.details.map((d) => (d.path ? `${d.path} – ${d.message}` : d.message)).join('; ')}`;
    return e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}

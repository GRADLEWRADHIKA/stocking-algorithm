import { API_URL } from './config';
import { useAuth } from '@/stores/auth';
import type { TokenResponse } from '@shared/types/api';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let refreshing: Promise<boolean> | null = null;

/** Single-flight refresh: concurrent 401s share one token rotation. */
export async function refreshTokens(): Promise<boolean> {
  if (refreshing) return refreshing;
  const { refreshToken, setSession, clear } = useAuth.getState();
  if (!refreshToken) return false;
  refreshing = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) {
        clear();
        return false;
      }
      setSession((await res.json()) as TokenResponse);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

function messageFrom(body: unknown, fallback: string): { msg: string; code?: string } {
  if (body && typeof body === 'object' && 'detail' in body) {
    const d = (body as { detail: unknown; code?: string }).detail;
    if (typeof d === 'string') return { msg: d, code: (body as { code?: string }).code };
    if (Array.isArray(d)) {
      return {
        msg: d
          .map((e: { msg?: string; loc?: unknown[] }) => {
            const loc = (e.loc ?? []).slice(1).join('.');
            return loc ? `${loc}: ${e.msg}` : String(e.msg);
          })
          .join('; '),
      };
    }
  }
  return { msg: fallback };
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  auth?: boolean;
  raw?: boolean;
}

export async function api<T>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const { body, auth = true, raw, headers, ...rest } = opts;
  const token = useAuth.getState().accessToken;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      ...rest,
      headers: {
        ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers as Record<string, string> | undefined),
      },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, `Cannot reach the QuantDesk API at ${API_URL}. Is the backend running?`, 'NETWORK');
  }

  if (res.status === 401 && auth && !retried && useAuth.getState().refreshToken) {
    if (await refreshTokens()) return api<T>(path, opts, true);
  }
  if (!res.ok) {
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      /* non-JSON error body */
    }
    const { msg, code } = messageFrom(parsed, `${res.status} ${res.statusText}`);
    throw new ApiError(res.status, msg, code);
  }
  if (raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const get = <T>(path: string) => api<T>(path, { method: 'GET' });
export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body });
export const put = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body });
export const patch = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') s.set(k, String(v));
  });
  const out = s.toString();
  return out ? `?${out}` : '';
}

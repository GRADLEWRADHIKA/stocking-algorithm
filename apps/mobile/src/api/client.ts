import {config} from '../config';
import {clearTokens, loadTokens, saveTokens, type StoredTokens} from './tokenStorage';
import type {TokenResponse} from './types';

/** Error thrown for any non-2xx response or network failure. `status` 0 = network/timeout. */
export class ApiError extends Error {
  status: number;
  code?: string;
  /** Field/rule level messages (strategy validation etc. return `errors: string[]`). */
  errors?: string[];
  constructor(status: number, message: string, code?: string, errors?: string[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Attach the bearer token + attempt refresh on 401. Default true. */
  auth?: boolean;
  signal?: AbortSignal;
}

// ------------------------------------------------------------------ session state
let tokens: StoredTokens | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let authFailureHandler: (() => void) | null = null;
let tokenListener: ((res: TokenResponse) => void) | null = null;

/** Called when the session can no longer be recovered (refresh failed) — the auth store logs out. */
export function setAuthFailureHandler(fn: (() => void) | null) {
  authFailureHandler = fn;
}
/** Called whenever a TokenResponse is received through refresh (keeps the user object fresh). */
export function setTokenListener(fn: ((res: TokenResponse) => void) | null) {
  tokenListener = fn;
}

export function getAccessToken(): string | null {
  return tokens?.access ?? null;
}
export function getRefreshToken(): string | null {
  return tokens?.refresh ?? null;
}

export async function setSession(next: StoredTokens): Promise<void> {
  tokens = next;
  await saveTokens(next);
}

export async function clearSession(): Promise<void> {
  tokens = null;
  refreshInFlight = null;
  await clearTokens();
}

/** Loads tokens from the keychain into memory. Returns true when a session exists. */
export async function restoreSession(): Promise<boolean> {
  tokens = await loadTokens();
  return tokens !== null;
}

// ------------------------------------------------------------------ helpers
export function buildQuery(query?: Record<string, QueryValue>): string {
  if (!query) {
    return '';
  }
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') {
      continue;
    }
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  let code: string | undefined;
  let errors: string[] | undefined;
  try {
    const data = (await res.json()) as {detail?: unknown; code?: string; errors?: unknown};
    if (Array.isArray(data?.errors)) {
      errors = data.errors.map(e => String(e));
    }
    if (typeof data?.detail === 'string') {
      message = data.detail;
    } else if (Array.isArray(data?.detail)) {
      // FastAPI validation errors
      message = data.detail
        .map((d: {msg?: string; loc?: unknown[]}) => {
          const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : undefined;
          return field ? `${String(field)}: ${d.msg ?? 'invalid'}` : d.msg ?? 'invalid';
        })
        .join('\n');
    }
    code = data?.code;
  } catch {
    // non-JSON body
  }
  return new ApiError(res.status, message, code, errors);
}

async function doFetch(path: string, opts: RequestOptions, accessToken: string | null): Promise<Response> {
  const headers: Record<string, string> = {Accept: 'application/json'};
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener?.('abort', onOuterAbort);
  try {
    return await fetch(`${config.apiUrl}${path}${buildQuery(opts.query)}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError';
    throw new ApiError(
      0,
      aborted
        ? 'The QuantDesk server took too long to respond.'
        : `Cannot reach the QuantDesk server at ${config.apiBaseUrl}. Is the backend running?`,
      aborted ? 'TIMEOUT' : 'NETWORK',
    );
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener?.('abort', onOuterAbort);
  }
}

/**
 * Single-flight refresh: concurrent 401s share one POST /auth/refresh call.
 * The backend rotates refresh tokens, so the new pair replaces the old one.
 */
export function refreshTokens(): Promise<boolean> {
  if (refreshInFlight) {
    return refreshInFlight;
  }
  const refresh = tokens?.refresh;
  if (!refresh) {
    return Promise.resolve(false);
  }
  refreshInFlight = (async () => {
    try {
      const res = await doFetch('/auth/refresh', {method: 'POST', body: {refresh_token: refresh}}, null);
      if (!res.ok) {
        return false;
      }
      const data = (await res.json()) as TokenResponse;
      await setSession({access: data.access_token, refresh: data.refresh_token});
      tokenListener?.(data);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function handleAuthFailure() {
  await clearSession();
  authFailureHandler?.();
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const useAuth = opts.auth !== false;
  let res = await doFetch(path, opts, useAuth ? getAccessToken() : null);

  if (res.status === 401 && useAuth && tokens?.refresh) {
    const ok = await refreshTokens();
    if (!ok) {
      await handleAuthFailure();
      throw new ApiError(401, 'Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
    }
    res = await doFetch(path, opts, getAccessToken());
    if (res.status === 401) {
      await handleAuthFailure();
      throw new ApiError(401, 'Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
    }
  }

  if (!res.ok) {
    throw await parseError(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

/** Authenticated GET returning the raw text body (CSV report download). */
export async function requestText(path: string): Promise<string> {
  let res = await doFetch(path, {method: 'GET'}, getAccessToken());
  if (res.status === 401 && tokens?.refresh && (await refreshTokens())) {
    res = await doFetch(path, {method: 'GET'}, getAccessToken());
  }
  if (!res.ok) {
    throw await parseError(res);
  }
  return res.text();
}

export const http = {
  get: <T>(path: string, query?: Record<string, QueryValue>, opts?: RequestOptions) =>
    request<T>(path, {...opts, method: 'GET', query}),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, {...opts, method: 'POST', body: body ?? {}}),
  put: <T>(path: string, body?: unknown) => request<T>(path, {method: 'PUT', body: body ?? {}}),
  patch: <T>(path: string, body?: unknown) => request<T>(path, {method: 'PATCH', body: body ?? {}}),
  del: <T>(path: string) => request<T>(path, {method: 'DELETE'}),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    return e.message;
  }
  if (e instanceof Error) {
    return e.message;
  }
  return 'Something went wrong.';
}

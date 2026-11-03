import * as Keychain from 'react-native-keychain';
import {
  ApiError,
  clearSession,
  getAccessToken,
  getRefreshToken,
  http,
  restoreSession,
  setAuthFailureHandler,
  setSession,
} from '../src/api/client';
import {config} from '../src/config';

type Handler = (url: string, init: RequestInit) => {status: number; body?: unknown};

function jsonResponse(status: number, body?: unknown) {
  const text = body === undefined ? '' : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => (text ? JSON.parse(text) : undefined),
    text: async () => text,
  } as unknown as Response;
}

function mockFetch(handler: Handler) {
  const fn = jest.fn(async (url: string, init: RequestInit) => {
    const r = handler(url, init);
    return jsonResponse(r.status, r.body);
  });
  (global as unknown as {fetch: unknown}).fetch = fn;
  return fn;
}

const authHeader = (init: RequestInit) => (init.headers as Record<string, string>).Authorization;
const tokenResponse = (access: string, refresh: string) => ({
  access_token: access,
  refresh_token: refresh,
  token_type: 'bearer',
  expires_in: 900,
  user: {id: 1, email: 'demo@quantdesk.local', full_name: 'Demo', role: 'USER', is_active: true, created_at: '', preferences: {}},
});

describe('API client', () => {
  beforeEach(async () => {
    await clearSession();
    setAuthFailureHandler(null);
    jest.clearAllMocks();
  });

  it('attaches the bearer token and hits the /api base URL', async () => {
    await setSession({access: 'A1', refresh: 'R1'});
    const f = mockFetch(() => ({status: 200, body: {ok: true}}));
    const res = await http.get<{ok: boolean}>('/users/me', {q: 'x', empty: '', none: undefined});
    expect(res).toEqual({ok: true});
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`${config.apiBaseUrl}/api/users/me?q=x`);
    expect(authHeader(init)).toBe('Bearer A1');
  });

  it('does not attach a token for auth: false requests', async () => {
    await setSession({access: 'A1', refresh: 'R1'});
    const f = mockFetch(() => ({status: 200, body: {}}));
    await http.post('/auth/login', {email: 'a', password: 'b'}, {auth: false});
    expect(authHeader(f.mock.calls[0][1])).toBeUndefined();
  });

  it('refreshes once on 401, rotates tokens, persists them and retries', async () => {
    await setSession({access: 'OLD', refresh: 'R1'});
    const f = mockFetch((url, init) => {
      if (url.endsWith('/auth/refresh')) {
        expect(JSON.parse(init.body as string)).toEqual({refresh_token: 'R1'});
        return {status: 200, body: tokenResponse('NEW', 'R2')};
      }
      return authHeader(init) === 'Bearer NEW' ? {status: 200, body: {id: 1}} : {status: 401, body: {detail: 'expired'}};
    });
    const res = await http.get<{id: number}>('/users/me');
    expect(res).toEqual({id: 1});
    const urls = f.mock.calls.map(c => c[0]);
    expect(urls.filter(u => u.endsWith('/auth/refresh'))).toHaveLength(1);
    expect(urls).toHaveLength(3); // original, refresh, retry
    expect(getAccessToken()).toBe('NEW');
    expect(getRefreshToken()).toBe('R2');
    // rotated pair is persisted to the keychain
    await restoreSession();
    expect(getAccessToken()).toBe('NEW');
    expect(getRefreshToken()).toBe('R2');
  });

  it('single-flights concurrent refreshes', async () => {
    await setSession({access: 'OLD', refresh: 'R1'});
    const f = mockFetch((url, init) => {
      if (url.endsWith('/auth/refresh')) {
        return {status: 200, body: tokenResponse('NEW', 'R2')};
      }
      return authHeader(init) === 'Bearer NEW' ? {status: 200, body: {ok: url}} : {status: 401};
    });
    await Promise.all([http.get('/a'), http.get('/b'), http.get('/c')]);
    expect(f.mock.calls.filter(c => c[0].endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('logs out (clears tokens + calls failure handler) when refresh fails', async () => {
    await setSession({access: 'OLD', refresh: 'BAD'});
    const onFail = jest.fn();
    setAuthFailureHandler(onFail);
    const f = mockFetch(url => (url.endsWith('/auth/refresh') ? {status: 401, body: {detail: 'revoked'}} : {status: 401}));
    await expect(http.get('/users/me')).rejects.toMatchObject({status: 401, code: 'SESSION_EXPIRED'});
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    expect(Keychain.resetGenericPassword).toHaveBeenCalled();
    expect(f.mock.calls.filter(c => c[0].endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('does not loop if the retried request is still 401', async () => {
    await setSession({access: 'OLD', refresh: 'R1'});
    const onFail = jest.fn();
    setAuthFailureHandler(onFail);
    const f = mockFetch(url =>
      url.endsWith('/auth/refresh') ? {status: 200, body: tokenResponse('NEW', 'R2')} : {status: 401},
    );
    await expect(http.get('/users/me')).rejects.toBeInstanceOf(ApiError);
    expect(f).toHaveBeenCalledTimes(3);
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it('surfaces FastAPI error details', async () => {
    mockFetch(() => ({status: 400, body: {detail: 'Insufficient funds', code: 'FUNDS'}}));
    await expect(http.post('/x', {})).rejects.toMatchObject({status: 400, message: 'Insufficient funds', code: 'FUNDS'});
    mockFetch(() => ({status: 422, body: {detail: [{loc: ['body', 'quantity'], msg: 'must be > 0'}]}}));
    await expect(http.post('/x', {})).rejects.toMatchObject({message: 'quantity: must be > 0'});
  });

  it('maps network failures to a friendly ApiError', async () => {
    (global as unknown as {fetch: unknown}).fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(http.get('/x')).rejects.toMatchObject({status: 0, code: 'NETWORK'});
  });
});

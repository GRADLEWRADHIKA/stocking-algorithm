import { api, ApiError, qs } from '@/lib/api';
import { useAuth } from '@/stores/auth';

const user = { id: 1, email: 'demo@quantdesk.local', full_name: 'Demo', role: 'USER', is_active: true, created_at: '', preferences: {} };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('api client', () => {
  beforeEach(() => {
    useAuth.setState({ accessToken: 'old-access', refreshToken: 'old-refresh', user: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it('attaches the bearer token', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, { ok: true }));
    await api('/users/me');
    const headers = f.mock.calls[0][1]!.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer old-access');
  });

  it('refreshes once on 401, rotates tokens and retries the request', async () => {
    const f = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(401, { detail: 'expired' }))
      .mockResolvedValueOnce(json(200, { access_token: 'new-access', refresh_token: 'new-refresh', token_type: 'bearer', expires_in: 900, user }))
      .mockResolvedValueOnce(json(200, { id: 1 }));
    const res = await api<{ id: number }>('/users/me');
    expect(res.id).toBe(1);
    expect(f).toHaveBeenCalledTimes(3);
    expect(String(f.mock.calls[1][0])).toContain('/api/auth/refresh');
    expect((f.mock.calls[2][1]!.headers as Record<string, string>).Authorization).toBe('Bearer new-access');
    expect(useAuth.getState().refreshToken).toBe('new-refresh');
  });

  it('clears the session when refresh fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(401, { detail: 'expired' })).mockResolvedValueOnce(json(401, { detail: 'revoked' }));
    await expect(api('/users/me')).rejects.toBeInstanceOf(ApiError);
    expect(useAuth.getState().accessToken).toBeNull();
  });

  it('surfaces the server error message and FastAPI validation details', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(400, { detail: 'Insufficient virtual balance', code: 'INSUFFICIENT_FUNDS' }));
    await expect(api('/x')).rejects.toMatchObject({ status: 400, message: 'Insufficient virtual balance', code: 'INSUFFICIENT_FUNDS' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(422, { detail: [{ loc: ['body', 'quantity'], msg: 'must be > 0' }] }));
    await expect(api('/x')).rejects.toMatchObject({ status: 422, message: 'quantity: must be > 0' });
  });

  it('reports an unreachable backend clearly', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api('/x')).rejects.toMatchObject({ status: 0, code: 'NETWORK' });
  });

  it('builds query strings without empty values', () => {
    expect(qs({ a: 1, b: '', c: null, d: 'x y' })).toBe('?a=1&d=x+y');
    expect(qs({})).toBe('');
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginPage from '@/app/(auth)/login/page';
import { useAuth } from '@/stores/auth';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('next=/portfolio'),
  usePathname: () => '/login',
}));

const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('login workflow', () => {
  beforeEach(() => {
    useAuth.setState({ accessToken: null, refreshToken: null, user: null, hydrated: true });
    replace.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('validates before calling the API', async () => {
    const f = vi.spyOn(globalThis, 'fetch');
    wrap(<LoginPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
  });

  it('fills the demo account, logs in, stores tokens and follows ?next', async () => {
    const user = { id: 1, email: 'demo@quantdesk.local', full_name: 'Demo Trader', role: 'USER', is_active: true, created_at: '', preferences: {} };
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 900, user }), { status: 200 }),
    );
    wrap(<LoginPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use demo trader' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/portfolio'));
    expect(String(f.mock.calls[0][0])).toContain('/api/auth/login');
    expect(JSON.parse(String(f.mock.calls[0][1]!.body))).toEqual({ email: 'demo@quantdesk.local', password: 'Demo@12345' });
    expect(useAuth.getState().accessToken).toBe('a');
  });

  it('shows the server error on bad credentials', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ detail: 'Incorrect email or password' }), { status: 401 }));
    wrap(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'x@y.co' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password');
    expect(useAuth.getState().accessToken).toBeNull();
  });
});

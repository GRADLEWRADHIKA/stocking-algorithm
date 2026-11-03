import React from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react-native';
import {AppProviders, createQueryClient} from '../App';
import {RootNavigator} from '../src/navigation/RootNavigator';
import {useAuthStore} from '../src/store/auth';
import type {User} from '../src/api/types';

const user: User = {
  id: 1,
  email: 'demo@quantdesk.local',
  full_name: 'Demo Trader',
  role: 'USER',
  is_active: true,
  created_at: '2026-01-01T00:00:00+05:30',
  preferences: {theme: 'dark', default_timeframe: '1d', default_exchange: 'NSE', chart_config: {}},
};

function renderApp() {
  const client = createQueryClient();
  client.setDefaultOptions({queries: {retry: false, refetchInterval: false}});
  const utils = render(
    <AppProviders client={client}>
      <RootNavigator />
    </AppProviders>,
  );
  return {...utils, client};
}

describe('navigation', () => {
  beforeEach(() => {
    // Backend offline: requests fail fast (no pending timeout timers), screens show error states.
    (global as unknown as {fetch: unknown}).fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed')));
  });

  it('shows Welcome, then the login screen, when logged out', async () => {
    act(() => useAuthStore.setState({status: 'unauthenticated', user: null}));
    const {client, unmount} = renderApp();
    await waitFor(() => expect(screen.getByTestId('welcome-screen')).toBeTruthy());
    fireEvent.press(screen.getByTestId('welcome-login'));
    await waitFor(() => expect(screen.getByTestId('login-screen')).toBeTruthy());
    expect(screen.getByText('Use demo account')).toBeTruthy();
    expect(screen.queryByTestId('tab-bar')).toBeNull();
    unmount();
    client.clear();
  });

  it('renders the bottom tabs once authenticated', async () => {
    act(() => useAuthStore.setState({status: 'authenticated', user}));
    const {client, unmount} = renderApp();
    await waitFor(() => expect(screen.getByTestId('tab-bar')).toBeTruthy());
    for (const tab of ['Home', 'Markets', 'Watchlist', 'Portfolio', 'Profile']) {
      expect(screen.getByTestId(`tab-${tab}`)).toBeTruthy();
    }
    expect(screen.getByTestId('home-screen')).toBeTruthy();
    expect(screen.queryByTestId('login-screen')).toBeNull();
    unmount();
    client.clear();
  });

  it('reaches the stock explorer from the Home header search', async () => {
    act(() => useAuthStore.setState({status: 'authenticated', user}));
    const {client, unmount} = renderApp();
    await waitFor(() => expect(screen.getByTestId('open-explorer')).toBeTruthy());
    fireEvent.press(screen.getByTestId('open-explorer'));
    await waitFor(() => expect(screen.getByTestId('explorer-screen')).toBeTruthy());
    unmount();
    client.clear();
  });

  it.each([
    ['open-explorer-link', 'explorer-screen'],
    ['open-strategies', 'strategy-builder-screen'],
    ['open-backtesting', 'backtesting-screen'],
  ])('reaches %s -> %s from Profile', async (link, target) => {
    act(() => useAuthStore.setState({status: 'authenticated', user}));
    const {client, unmount} = renderApp();
    await waitFor(() => expect(screen.getByTestId('tab-Profile')).toBeTruthy());
    fireEvent.press(screen.getByTestId('tab-Profile'));
    await waitFor(() => expect(screen.getByTestId(link)).toBeTruthy());
    fireEvent.press(screen.getByTestId(link));
    await waitFor(() => expect(screen.getByTestId(target)).toBeTruthy());
    unmount();
    client.clear();
  });

  it('shows Admin only to administrators', async () => {
    act(() => useAuthStore.setState({status: 'authenticated', user}));
    const first = renderApp();
    await waitFor(() => expect(screen.getByTestId('tab-Profile')).toBeTruthy());
    fireEvent.press(screen.getByTestId('tab-Profile'));
    await waitFor(() => expect(screen.getByTestId('profile-screen')).toBeTruthy());
    expect(screen.queryByTestId('open-admin')).toBeNull();
    first.unmount();
    first.client.clear();

    act(() => useAuthStore.setState({status: 'authenticated', user: {...user, role: 'ADMIN'}}));
    const second = renderApp();
    await waitFor(() => expect(screen.getByTestId('tab-Profile')).toBeTruthy());
    fireEvent.press(screen.getByTestId('tab-Profile'));
    await waitFor(() => expect(screen.getByTestId('open-admin')).toBeTruthy());
    fireEvent.press(screen.getByTestId('open-admin'));
    await waitFor(() => expect(screen.getByTestId('admin-screen')).toBeTruthy());
    second.unmount();
    second.client.clear();
  });

  it('shows a splash while the session is being restored', () => {
    act(() => useAuthStore.setState({status: 'loading', user: null}));
    const {client, unmount} = renderApp();
    expect(screen.getByTestId('splash')).toBeTruthy();
    unmount();
    client.clear();
  });
});

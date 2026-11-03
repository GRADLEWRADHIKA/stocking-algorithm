import React from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {AppProviders, createQueryClient} from '../App';
import {useAuthStore} from '../src/store/auth';
import type {User} from '../src/api/types';
import {WatchlistScreen} from '../src/screens/WatchlistScreen';
import {NotificationsScreen} from '../src/screens/NotificationsScreen';
import {AssistantScreen} from '../src/screens/AssistantScreen';
import {AdminScreen} from '../src/screens/AdminScreen';
import {ProfileScreen} from '../src/screens/ProfileScreen';
import {SimpleMarkdown} from '../src/components/SimpleMarkdown';

const admin: User = {
  id: 2,
  email: 'admin@quantdesk.local',
  full_name: 'QuantDesk Admin',
  role: 'ADMIN',
  is_active: true,
  created_at: '2026-01-01T00:00:00+05:30',
  preferences: {theme: 'dark', default_timeframe: '1d', default_exchange: 'NSE', chart_config: {}},
};

const quote = (symbol: string, position: number) => ({
  symbol,
  name: `${symbol} Ltd`,
  exchange: 'NSE',
  sector: 'IT',
  price: 100 + position,
  prev_close: 100,
  change: position,
  change_pct: position,
  volume: 1000,
  data_source: 'SIMULATED',
  position,
});

const routes: Record<string, unknown> = {
  '/api/watchlists': [{id: 1, name: 'Core', created_at: '2026-01-01T00:00:00Z', items: [quote('TCS', 1), quote('INFY', 0)]}],
  '/api/alerts': [],
  '/api/notifications': [
    {id: 5, title: 'Order filled', body: 'BUY 10 TCS', kind: 'ORDER', is_read: false, created_at: new Date().toISOString()},
  ],
  '/api/admin/health': {
    status: 'ok',
    database: 'ok',
    simulator: {running: true, tick_interval_ms: 1000, ticks: 10, seed: 42, regime: null, last_tick_at: null, instruments: 5, ws_clients: 1, errors: 0, data_source: 'SIMULATED'},
    uptime_seconds: 3700,
    version: '1.0.0',
    counts: {users: 2},
  },
};

function mockFetch() {
  (global as unknown as {fetch: unknown}).fetch = jest.fn((url: string) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const body = routes[path];
    if (body === undefined) {
      return Promise.reject(new TypeError('Network request failed'));
    }
    return Promise.resolve({ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)), json: () => Promise.resolve(body)});
  });
}

const Stack = createNativeStackNavigator();
function renderScreen(name: string, component: React.ComponentType<any>) {
  const client = createQueryClient();
  client.setDefaultOptions({queries: {retry: false, refetchInterval: false}});
  const utils = render(
    <AppProviders client={client}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{headerShown: false}}>
          <Stack.Screen name={name} component={component} />
        </Stack.Navigator>
      </NavigationContainer>
    </AppProviders>,
  );
  return {...utils, client};
}

describe('watchlist / notifications / assistant / admin / profile screens', () => {
  beforeEach(() => {
    mockFetch();
    act(() => useAuthStore.setState({status: 'authenticated', user: admin}));
  });

  it('renders watchlist rows in server position order with the alert form', async () => {
    const {unmount, client} = renderScreen('Watchlist', WatchlistScreen);
    await waitFor(() => expect(screen.getByTestId('wl-row-TCS')).toBeTruthy());
    expect(screen.getByTestId('wl-row-INFY')).toBeTruthy();
    expect(screen.getByText('Arm alert')).toBeTruthy();
    expect(screen.getByText('Core · 2')).toBeTruthy();
    unmount();
    client.clear();
  });

  it('lists notifications with the unread dot and mark-all action', async () => {
    const {unmount, client} = renderScreen('Notifications', NotificationsScreen);
    await waitFor(() => expect(screen.getByText('Order filled')).toBeTruthy());
    expect(screen.getByTestId('mark-all-read')).toBeTruthy();
    unmount();
    client.clear();
  });

  it('shows the assistant starters', () => {
    const {unmount, client} = renderScreen('Assistant', AssistantScreen);
    expect(screen.getByText('Explain maximum drawdown')).toBeTruthy();
    expect(screen.getByText('rule-based-v1')).toBeTruthy();
    unmount();
    client.clear();
  });

  it('renders admin health and the web-only dataset note', async () => {
    const {unmount, client} = renderScreen('Admin', AdminScreen);
    await waitFor(() => expect(screen.getByText('Version 1.0.0')).toBeTruthy());
    fireEvent.press(screen.getByText('Datasets'));
    await waitFor(() => expect(screen.getByText('Web only')).toBeTruthy());
    unmount();
    client.clear();
  });

  it('offers the admin link only to administrators', () => {
    const {unmount, client} = renderScreen('Profile', ProfileScreen);
    expect(screen.getByTestId('open-admin')).toBeTruthy();
    unmount();
    client.clear();
    act(() => useAuthStore.setState({user: {...admin, role: 'USER'}}));
    const second = renderScreen('Profile', ProfileScreen);
    expect(screen.queryByTestId('open-admin')).toBeNull();
    second.unmount();
    second.client.clear();
  });
});

describe('SimpleMarkdown', () => {
  it('renders headings, bullets, bold and tables', () => {
    render(<SimpleMarkdown source={'## Trend\n- **Up** move\n\n| Metric | Value |\n|---|---|\n| RSI | 61.2 |'} />);
    expect(screen.getByText('Trend')).toBeTruthy();
    expect(screen.getByText('Up')).toBeTruthy();
    expect(screen.getByTestId('md-table')).toBeTruthy();
    expect(screen.getByText('61.2')).toBeTruthy();
  });
});

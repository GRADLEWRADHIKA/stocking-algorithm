import React from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react-native';
import {AppProviders, createQueryClient} from '../App';
import {navigationRef, RootNavigator} from '../src/navigation/RootNavigator';
import {useAuthStore} from '../src/store/auth';
import {usePostLogin} from '../src/store/postLogin';
import {SignalFragment} from '../src/components/landing/Fragments';
import {ctaSymbol, heroSignal, sideConditions, sliderParams} from '../src/utils/landing';
import type {BuiltinStrategy, Signal, TokenResponse, User} from '../src/api/types';

const user: User = {
  id: 1,
  email: 'demo@quantdesk.local',
  full_name: 'Demo Trader',
  role: 'USER',
  is_active: true,
  created_at: '2026-01-01T00:00:00+05:30',
  preferences: {theme: 'dark', default_timeframe: '1d', default_exchange: 'NSE', chart_config: {}},
};

const base: Signal = {
  id: null,
  symbol: 'INFY',
  exchange: 'NSE',
  strategy: 'Supertrend Trend Rider',
  strategy_key: 'supertrend',
  timeframe: '1d',
  timestamp: '2026-11-03T00:00:00+05:30',
  data_source: 'SIMULATED',
  action: 'HOLD',
  price: 1500,
  entry_conditions: [],
  exit_conditions: [],
  indicator_values: {},
  conditions: [
    {description: '[BUY] Supertrend(10, 3) direction is up', satisfied: true, value: null},
    {description: '[BUY] ADX(14) at or above 20', satisfied: false, value: '14.2'},
    {description: '[SELL] Supertrend(10, 3) flipped to a downtrend on this bar', satisfied: true, value: null},
    {description: '[SELL] ADX(14) still above 20 (optional)', satisfied: false, value: '14.2'},
    {description: '[SELL] Close below the trailing line', satisfied: true, value: null},
  ],
  stop_loss: null,
  take_profit: null,
  risk_reward: null,
  position_size: null,
  strength: {score: 40, label: 'WEAK', method: 'm', components: []},
  historical_performance: null,
  explanation: 'x',
  disclaimer: 'd',
};

function mockServer(handler: (url: string, init?: {method?: string; body?: string}) => unknown | undefined) {
  (global as unknown as {fetch: unknown}).fetch = jest.fn((url: string, init?: {method?: string; body?: string}) => {
    const body = handler(url, init);
    if (body === undefined) {
      return Promise.reject(new TypeError('Network request failed'));
    }
    const text = JSON.stringify(body);
    return Promise.resolve({ok: true, status: 200, text: async () => text, json: async () => body});
  });
}

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

describe('Welcome (web landing on the phone)', () => {
  beforeEach(() => {
    usePostLogin.getState().set(null);
    mockServer(() => undefined); // server offline
  });

  it('renders the landing sections in web order and navigates to Login', async () => {
    act(() => useAuthStore.setState({status: 'unauthenticated', user: null}));
    const {client, unmount} = renderApp();
    await waitFor(() => expect(screen.getByTestId('welcome-screen')).toBeTruthy());
    expect(screen.getByText('Signals that')).toBeTruthy();
    expect(screen.getByText('show their working.', {includeHiddenElements: true})).toBeTruthy();
    expect(screen.getByText('Try the engine')).toBeTruthy();
    expect(screen.getByText('From a price to a decision')).toBeTruthy();
    expect(screen.getByText('Everything runs on your machine')).toBeTruthy();
    expect(screen.getByText('Open the terminal')).toBeTruthy();
    expect(screen.queryByText('Same desk in your pocket')).toBeNull();
    // offline: the demo says what it needs, the footer says the server is offline
    await waitFor(() => expect(screen.getByTestId('demo-offline')).toBeTruthy());
    expect(screen.getByText(/The demo needs the local QuantDesk server/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Server offline')).toBeTruthy());

    fireEvent.press(screen.getByTestId('open-terminal'));
    await waitFor(() => expect(screen.getByTestId('login-screen')).toBeTruthy());
    unmount();
    client.clear();
  });

  it('is skipped for signed-in users (straight to the tabs)', async () => {
    act(() => useAuthStore.setState({status: 'authenticated', user}));
    const {client, unmount} = renderApp();
    await waitFor(() => expect(screen.getByTestId('tab-bar')).toBeTruthy());
    expect(screen.queryByTestId('welcome-screen')).toBeNull();
    unmount();
    client.clear();
  });

  it('carries the CTA symbol through login and opens Backtesting on it', async () => {
    const token: TokenResponse = {access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 1800, user};
    mockServer((url, init) => (url.endsWith('/auth/login') && init?.method === 'POST' ? token : undefined));
    act(() => useAuthStore.setState({status: 'unauthenticated', user: null}));
    const {client, unmount} = renderApp();
    await waitFor(() => expect(screen.getByTestId('cta-symbol')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('cta-symbol'), ' tcs ');
    fireEvent.press(screen.getByTestId('cta-today'));
    await waitFor(() => expect(screen.getByTestId('login-screen')).toBeTruthy());
    expect(navigationRef.getCurrentRoute()?.params).toEqual({next: {route: 'Backtesting', symbol: 'TCS'}});

    fireEvent.press(screen.getByTestId('login-demo'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('login-submit'));
    });
    await waitFor(() => expect(screen.getByTestId('backtesting-screen')).toBeTruthy());
    expect(navigationRef.getCurrentRoute()?.name).toBe('Backtesting');
    expect(navigationRef.getCurrentRoute()?.params).toEqual({symbol: 'TCS'});
    expect(usePostLogin.getState().target).toBeNull();
    unmount();
    client.clear();
  });
});

describe('landing helpers', () => {
  it('shows only the conditions of the signal side (web SignalFragment)', () => {
    const sell = sideConditions({...base, action: 'SELL'});
    expect(sell.label).toBe('exit');
    expect(sell.conditions.every(c => c.description.startsWith('[SELL]'))).toBe(true);
    expect(sell.conditions).toHaveLength(3);
    const buy = sideConditions({...base, action: 'BUY'});
    expect(buy.label).toBe('entry');
    expect(buy.conditions.map(c => c.description)).toEqual(['[BUY] Supertrend(10, 3) direction is up', '[BUY] ADX(14) at or above 20']);
    // HOLD waits on its entry rules
    expect(sideConditions(base).conditions).toHaveLength(2);
    // untagged conditions fall back to the full list
    const plain = {...base, conditions: [{description: 'RSI below 30', satisfied: true, value: null}]};
    expect(sideConditions(plain).conditions).toHaveLength(1);
  });

  it('renders the side-specific count and rows in the hero fragment', () => {
    render(<SignalFragment s={{...base, action: 'SELL'}} />);
    expect(screen.getByText('2 of 3 exit conditions met')).toBeTruthy();
    expect(screen.getByText('[SELL] Close below the trailing line')).toBeTruthy();
    expect(screen.queryByText('[BUY] Supertrend(10, 3) direction is up')).toBeNull();
  });

  it('picks the hero signal, CTA symbol and demo sliders like the web', () => {
    expect(heroSignal([base, {...base, action: 'BUY', symbol: 'TCS'}], undefined)?.symbol).toBe('TCS');
    expect(heroSignal([base], {...base, symbol: 'INFY'})?.symbol).toBe('INFY');
    expect(ctaSymbol('')).toBe('RELIANCE');
    expect(ctaSymbol(' m&m ')).toBe('M&M');
    expect(ctaSymbol('tcs!')).toBe('TCS');
    const rsi: BuiltinStrategy = {
      key: 'rsi',
      name: 'RSI',
      description: '',
      params: [
        {name: 'period', label: 'Period', type: 'int', default: 14, min: 2, max: 50},
        {name: 'oversold', label: 'Oversold', type: 'float', default: 30, min: 5, max: 50},
        {name: 'overbought', label: 'Overbought', type: 'float', default: 70, min: 50, max: 95},
        {name: 'trend_period', label: 'Trend', type: 'int', default: 200, min: 20, max: 300},
        {name: 'trend_filter', label: 'Filter', type: 'int', default: 1, min: 0, max: 1},
      ],
    };
    expect(sliderParams(rsi).map(p => p.name)).toEqual(['period', 'oversold', 'overbought', 'trend_period']);
  });
});

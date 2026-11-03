import React from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import type {PaperAccount, PaperOrder} from '../src/api/types';
import {OrderTicketForm} from '../src/components/trading/OrderTicketForm';
import {validateNewAccount} from '../src/components/trading/AccountSwitcher';
import {donutData} from '../src/components/charts/Donut';
import {useToasts} from '../src/components/Toast';
import {reportFileName} from '../src/screens/PortfolioScreen';
import {orderOutcome, orderSentence} from '../src/utils/orderValidation';
import {useAccountStore} from '../src/store/account';

const account: PaperAccount = {
  id: 7,
  name: 'Swing book',
  initial_capital: 1_000_000,
  cash_balance: 500_000,
  blocked_margin: 0,
  holdings_value: 500_000,
  equity: 1_000_000,
  realized_pnl: 0,
  unrealized_pnl: 0,
  day_pnl: 0,
  total_return_pct: 0,
  created_at: '2026-11-03T00:00:00+00:00',
  data_source: 'PAPER_TRADING',
};

const order = (o: Partial<PaperOrder>): PaperOrder => ({
  id: 9,
  account_id: 7,
  symbol: 'TCS',
  side: 'SELL',
  order_type: 'MARKET',
  quantity: 99999,
  limit_price: null,
  trigger_price: null,
  stop_loss: null,
  take_profit: null,
  parent_order_id: null,
  status: 'FILLED',
  filled_quantity: 0,
  avg_fill_price: null,
  rejection_reason: null,
  created_at: '2026-11-03T06:49:11+00:00',
  updated_at: '2026-11-03T06:49:11+00:00',
  ...o,
});

describe('order outcome', () => {
  it('treats a 201 REJECTED order as a rejection with its reason, never as success', () => {
    const out = orderOutcome(order({status: 'REJECTED', rejection_reason: 'Insufficient holdings: trying to sell 99999, available 25'}));
    expect(out.kind).toBe('rejected');
    expect(out.title).toBe('Order rejected');
    expect(out.description).toContain('Insufficient holdings');
  });

  it('describes fills like the web toast', () => {
    const out = orderOutcome(order({status: 'FILLED', side: 'BUY', quantity: 5, filled_quantity: 5, avg_fill_price: 3512.4}));
    expect(out).toEqual({kind: 'filled', title: 'Paper order filled', description: 'BUY 5 TCS @ 3,512.40'});
    expect(orderOutcome(order({status: 'OPEN', side: 'BUY', quantity: 2, limit_price: 100})).title).toBe('Paper order placed');
  });

  it('builds the confirmation sentence', () => {
    expect(
      orderSentence({side: 'BUY', quantity: 10, symbol: 'INFY', orderType: 'LIMIT', limitPrice: 1500, stopLoss: 1450, takeProfit: 1600}),
    ).toBe('BUY 10 INFY at limit 1,500.00, stop 1,450.00, target 1,600.00.');
    expect(orderSentence({side: 'SELL', quantity: 1, symbol: 'TCS', orderType: 'MARKET', limitPrice: null, stopLoss: null, takeProfit: null})).toBe(
      'SELL 1 TCS at market (simulated price + slippage).',
    );
  });
});

describe('portfolio helpers', () => {
  it('groups donut parts past five into Other', () => {
    const parts = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((label, i) => ({label, value: 10 - i}));
    const d = donutData(parts);
    expect(d).toHaveLength(6);
    expect(d[5]).toEqual({label: 'Other', value: 4 + 5});
  });

  it('validates new accounts and names the CSV like web', () => {
    expect(validateNewAccount('x', '5000')).toEqual({name: 'Name it', capital: 'Minimum ₹10,000'});
    expect(validateNewAccount('Swing book', '1000000')).toEqual({});
    expect(reportFileName('Swing Book #1')).toBe('quantdesk-paper-swing-book-1.csv');
  });
});

describe('OrderTicketForm', () => {
  afterEach(() => {
    (global as unknown as {fetch: unknown}).fetch = undefined;
  });

  it('shows the rejection reason when the engine answers 201 REJECTED', async () => {
    const rejected = order({status: 'REJECTED', rejection_reason: 'Insufficient holdings: trying to sell 99999, available 25 (short selling not allowed)'});
    const fetchMock = jest.fn((url: string, init?: {method?: string}) => {
      const post = init?.method === 'POST' && url.includes('/orders');
      const body = post ? rejected : /\/paper-trading\/accounts$/.test(url.split('?')[0]) ? [account] : [];
      return Promise.resolve({ok: true, status: post ? 201 : 200, text: () => Promise.resolve(JSON.stringify(body))});
    });
    (global as unknown as {fetch: unknown}).fetch = fetchMock;

    const client = new QueryClient({defaultOptions: {queries: {retry: false, refetchInterval: false, staleTime: Infinity}}});
    client.setQueryData(['paper', 'accounts'], [account]);
    client.setQueryData(['paper', 'positions', 7], []);
    act(() => useAccountStore.setState({accountId: 7}));
    const onDone = jest.fn();
    render(
      <SafeAreaProvider>
        <QueryClientProvider client={client}>
          <OrderTicketForm symbol="TCS" refPrice={3500} defaultSide="SELL" onDone={onDone} />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getByText('Review sell order')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('order-qty'), '99999');
    fireEvent.press(screen.getByTestId('review-order'));
    await waitFor(() => expect(screen.getByTestId('order-confirm')).toBeTruthy());
    fireEvent.press(screen.getByTestId('place-order'));
    await waitFor(() => expect(screen.getByTestId('order-rejected')).toBeTruthy());
    expect(screen.getByText(/Insufficient holdings/)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    expect(useToasts.getState().items.some(t => t.kind === 'error' && t.title === 'Order rejected')).toBe(true);
    const post = fetchMock.mock.calls.find(c => c[1]?.method === 'POST');
    expect(post?.[0]).toContain('/paper-trading/accounts/7/orders');
    client.clear();
  });
});

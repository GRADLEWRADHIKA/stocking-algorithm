import {MarketStream, useLive} from '../src/hooks/useLiveQuotes';

describe('market stream (web useMarketStream parity)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useLive.getState().reset();
  });
  afterEach(() => jest.useRealTimers());

  it('batches ticks and index values into the live store with a direction', () => {
    const s = new MarketStream(() => 'ws://x/ws/market?token=abc');
    s.handle(JSON.stringify({type: 'tick', symbol: 'TCS', price: 100, change: 1, change_pct: 1, volume: 10, time: 1}));
    expect(useLive.getState().ticks.TCS).toBeUndefined();
    jest.advanceTimersByTime(300);
    expect(useLive.getState().ticks.TCS.price).toBe(100);
    s.handle({type: 'tick', symbol: 'TCS', price: 99, change: 0, change_pct: 0, volume: 11, time: 2});
    s.handle({type: 'index', symbol: 'NIFTY50', value: 24000, change: 10, change_pct: 0.04, time: 2});
    jest.advanceTimersByTime(300);
    expect(useLive.getState().ticks.TCS.dir).toBe('down');
    expect(useLive.getState().indices.NIFTY50.value).toBe(24000);
  });

  it('routes notification messages to the handler (toast + invalidate) and ignores junk', () => {
    const s = new MarketStream(() => 'ws://x');
    const got: string[] = [];
    s.onNotification = n => got.push(n.title);
    s.handle(
      JSON.stringify({
        type: 'notification',
        notification: {id: 1, title: 'Order filled', body: 'BUY 1 TCS', kind: 'ORDER', is_read: false, created_at: ''},
      }),
    );
    s.handle('not json');
    expect(got).toEqual(['Order filled']);
  });
});

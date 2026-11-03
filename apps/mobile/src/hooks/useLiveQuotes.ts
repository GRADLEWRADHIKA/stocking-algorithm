import {useEffect, useMemo} from 'react';
import {AppState} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {create} from 'zustand';
import {getAccessToken} from '../api/client';
import type {Notification} from '../api/types';
import {toast} from '../components/Toast';
import {config} from '../config';
import {useAuthStore} from '../store/auth';

/**
 * Live simulated market feed — the mobile port of the web's useMarketStream + useLive store.
 * One WebSocket to /ws/market?token=<access> carries every stock tick, every index tick and the
 * user's notifications. Ticks are buffered and flushed into the store at most ~4x/second.
 */
export type Dir = 'up' | 'down' | 'flat';
export interface LiveTick {
  price: number;
  change: number;
  change_pct: number;
  volume: number;
  time: number;
  dir: Dir;
}
export interface LiveIndex {
  value: number;
  change: number;
  change_pct: number;
  time: number;
  dir: Dir;
}
/** Back-compat shape used by older screens. */
export interface LiveQuote {
  symbol: string;
  price: number;
  change: number;
  change_pct: number;
  volume?: number;
  time: number;
  dir?: Dir;
}
export type SocketStatus = 'idle' | 'connecting' | 'open' | 'reconnecting';

type TickMsg = {type: 'tick'; symbol: string; price: number; change: number; change_pct: number; volume: number; time: number};
type IndexMsg = {type: 'index'; symbol: string; value: number; change: number; change_pct: number; time: number};
type NotificationMsg = {type: 'notification'; notification: Notification};
export type StreamMsg = TickMsg | IndexMsg | NotificationMsg | {type: string};

interface LiveState {
  status: SocketStatus;
  ticks: Record<string, LiveTick>;
  indices: Record<string, LiveIndex>;
  setStatus: (s: SocketStatus) => void;
  apply: (batch: Array<TickMsg | IndexMsg>) => void;
  reset: () => void;
}

export const useLive = create<LiveState>(set => ({
  status: 'idle',
  ticks: {},
  indices: {},
  setStatus: status => set({status}),
  apply: batch =>
    set(s => {
      const ticks = {...s.ticks};
      const indices = {...s.indices};
      for (const m of batch) {
        if (m.type === 'tick') {
          const prev = ticks[m.symbol];
          const dir: Dir = !prev ? 'flat' : m.price > prev.price ? 'up' : m.price < prev.price ? 'down' : prev.dir;
          ticks[m.symbol] = {price: m.price, change: m.change, change_pct: m.change_pct, volume: m.volume, time: m.time, dir};
        } else {
          const prev = indices[m.symbol];
          const dir: Dir = !prev ? 'flat' : m.value > prev.value ? 'up' : m.value < prev.value ? 'down' : prev.dir;
          indices[m.symbol] = {value: m.value, change: m.change, change_pct: m.change_pct, time: m.time, dir};
        }
      }
      return {ticks, indices};
    }),
  reset: () => set({ticks: {}, indices: {}}),
}));

export type NotificationHandler = (n: Notification) => void;

/** Connection manager (exported for tests). Reconnects with capped exponential backoff. */
export class MarketStream {
  private ws: WebSocket | null = null;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: Array<TickMsg | IndexMsg> = [];
  private stopped = true;
  onNotification: NotificationHandler | null = null;

  constructor(private url: () => string) {}

  start() {
    this.stopped = false;
    this.retry = 0;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      ws.onerror = null;
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    useLive.getState().setStatus('idle');
  }

  restart() {
    this.stop();
    this.start();
  }

  /** Parses and routes one raw message (exported behaviour is unit tested). */
  handle(raw: unknown) {
    let m: StreamMsg;
    try {
      m = (typeof raw === 'string' ? JSON.parse(raw) : raw) as StreamMsg;
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') {
      return;
    }
    if (m.type === 'notification') {
      this.onNotification?.((m as NotificationMsg).notification);
      return;
    }
    if (m.type === 'tick' || m.type === 'index') {
      this.queue.push(m as TickMsg | IndexMsg);
      if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => this.flush(), 250);
      }
    }
  }

  flush() {
    this.flushTimer = null;
    const batch = this.queue;
    this.queue = [];
    if (batch.length) {
      useLive.getState().apply(batch);
    }
  }

  private connect() {
    if (this.stopped || typeof WebSocket === 'undefined') {
      return;
    }
    useLive.getState().setStatus(this.retry > 0 ? 'reconnecting' : 'connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url());
    } catch {
      this.schedule();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      useLive.getState().setStatus('open');
    };
    ws.onmessage = ev => this.handle(ev.data);
    ws.onerror = () => {
      // onclose follows
    };
    ws.onclose = () => {
      if (this.ws === ws) {
        this.ws = null;
        this.schedule();
      }
    };
  }

  private schedule() {
    if (this.stopped) {
      return;
    }
    const delay = Math.min(15_000, 500 * 2 ** this.retry++);
    useLive.getState().setStatus('reconnecting');
    this.timer = setTimeout(() => this.connect(), delay);
  }
}

export const marketStream = new MarketStream(() => {
  const token = getAccessToken();
  return `${config.wsMarketUrl}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
});

/**
 * Mount once while signed in: opens the stream, pauses it in the background, and turns
 * `notification` messages into an in-app toast + query invalidation (web parity).
 */
export function useMarketStream() {
  const qc = useQueryClient();
  const status = useAuthStore(s => s.status);
  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    marketStream.onNotification = n => {
      toast(n.title, {description: n.body});
      qc.invalidateQueries({queryKey: ['notifications']});
      if (n.kind === 'ORDER') {
        qc.invalidateQueries({queryKey: ['paper']});
      }
    };
    marketStream.start();
    const sub = AppState.addEventListener?.('change', s => {
      if (s === 'active') {
        marketStream.restart();
      } else {
        marketStream.stop();
      }
    });
    return () => {
      sub?.remove?.();
      marketStream.onNotification = null;
      marketStream.stop();
    };
  }, [status, qc]);
}

/** Live tick for one symbol (undefined until the first tick arrives). */
export function useTick(symbol: string | undefined): LiveTick | undefined {
  return useLive(s => (symbol ? s.ticks[symbol.toUpperCase()] : undefined));
}

/** Back-compat: live quotes for a set of symbols, read from the shared stream. */
export function useLiveQuotes(symbols: string[]): {quotes: Record<string, LiveQuote>; status: SocketStatus} {
  const ticks = useLive(s => s.ticks);
  const indices = useLive(s => s.indices);
  const status = useLive(s => s.status);
  const key = symbols.join(',');
  const quotes = useMemo(() => {
    const out: Record<string, LiveQuote> = {};
    for (const raw of key ? key.split(',') : []) {
      const sym = raw.toUpperCase();
      const t = ticks[sym];
      if (t) {
        out[sym] = {symbol: sym, price: t.price, change: t.change, change_pct: t.change_pct, volume: t.volume, time: t.time, dir: t.dir};
        continue;
      }
      const i = indices[sym];
      if (i) {
        out[sym] = {symbol: sym, price: i.value, change: i.change, change_pct: i.change_pct, time: i.time, dir: i.dir};
      }
    }
    return out;
  }, [key, ticks, indices]);
  return {quotes, status};
}

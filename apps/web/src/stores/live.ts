'use client';
import { create } from 'zustand';
import type { TickMessage } from '@shared/types/api';

export interface LiveTick {
  price: number;
  change: number;
  change_pct: number;
  volume: number;
  time: number;
  dir: 'up' | 'down' | 'flat';
}

interface LiveState {
  connected: boolean;
  ticks: Record<string, LiveTick>;
  indices: Record<string, { value: number; change: number; change_pct: number; time: number; dir: 'up' | 'down' | 'flat' }>;
  setConnected: (c: boolean) => void;
  applyTick: (t: TickMessage) => void;
  applyIndex: (t: { symbol: string; value: number; change: number; change_pct: number; time: number }) => void;
}

export const useLive = create<LiveState>()((set) => ({
  connected: false,
  ticks: {},
  indices: {},
  setConnected: (connected) => set({ connected }),
  applyTick: (t) =>
    set((s) => {
      const prev = s.ticks[t.symbol];
      const dir = !prev ? 'flat' : t.price > prev.price ? 'up' : t.price < prev.price ? 'down' : prev.dir;
      return { ticks: { ...s.ticks, [t.symbol]: { price: t.price, change: t.change, change_pct: t.change_pct, volume: t.volume, time: t.time, dir } } };
    }),
  applyIndex: (t) =>
    set((s) => {
      const prev = s.indices[t.symbol];
      const dir = !prev ? 'flat' : t.value > prev.value ? 'up' : t.value < prev.value ? 'down' : prev.dir;
      return { indices: { ...s.indices, [t.symbol]: { ...t, dir } } };
    }),
}));

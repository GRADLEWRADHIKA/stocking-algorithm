'use client';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { WS_URL } from '@/lib/config';
import { useLive } from '@/stores/live';
import { useAuth } from '@/stores/auth';
import type { Notification, TickMessage } from '@shared/types/api';

type Msg =
  | TickMessage
  | { type: 'index'; symbol: string; value: number; change: number; change_pct: number; time: number }
  | { type: 'notification'; notification: Notification };

/**
 * One shared WebSocket for the simulated market feed. Reconnects with capped
 * exponential backoff. Ticks are batched per animation frame so a burst of
 * 40 symbols causes one store update, not 40.
 */
export function useMarketStream() {
  const token = useAuth((s) => s.accessToken);
  const qc = useQueryClient();

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let queue: Msg[] = [];
    let frame = 0;
    const { applyTick, applyIndex, setConnected } = useLive.getState();

    const flush = () => {
      frame = 0;
      const batch = queue;
      queue = [];
      for (const m of batch) {
        if (m.type === 'tick') applyTick(m);
        else if (m.type === 'index') applyIndex(m);
      }
    };

    const connect = () => {
      const url = `${WS_URL}/ws/market${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      try {
        ws = new WebSocket(url);
      } catch {
        schedule();
        return;
      }
      ws.onopen = () => {
        retry = 0;
        setConnected(true);
      };
      ws.onmessage = (e) => {
        let m: Msg;
        try {
          m = JSON.parse(e.data as string) as Msg;
        } catch {
          return;
        }
        if (m.type === 'notification') {
          toast(m.notification.title, { description: m.notification.body });
          qc.invalidateQueries({ queryKey: ['notifications'] });
          if (m.notification.kind === 'ORDER') qc.invalidateQueries({ queryKey: ['paper'] });
          return;
        }
        queue.push(m);
        if (!frame) frame = requestAnimationFrame(flush);
      };
      ws.onclose = () => {
        setConnected(false);
        schedule();
      };
      ws.onerror = () => ws?.close();
    };

    const schedule = () => {
      if (stopped) return;
      const delay = Math.min(15000, 500 * 2 ** retry++);
      timer = setTimeout(connect, delay);
    };

    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (frame) cancelAnimationFrame(frame);
      ws?.close();
      setConnected(false);
    };
  }, [token, qc]);
}

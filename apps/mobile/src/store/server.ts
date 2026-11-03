import {create} from 'zustand';
import {loadLocalPrefs, saveLocalPrefs} from '../api/tokenStorage';
import {DEFAULT_BASE_URL, config, normalizeBaseUrl, setApiBaseUrl} from '../config';

interface ServerState {
  url: string;
  hydrate: () => Promise<void>;
  /** Persists and applies a new server address; returns the normalized URL or null when invalid. */
  setUrl: (input: string) => string | null;
  reset: () => void;
}

export const useServerStore = create<ServerState>(set => ({
  url: config.apiBaseUrl,
  hydrate: async () => {
    const prefs = await loadLocalPrefs();
    const saved = typeof prefs.serverUrl === 'string' ? normalizeBaseUrl(prefs.serverUrl) : null;
    if (saved) {
      setApiBaseUrl(saved);
      set({url: saved});
    }
  },
  setUrl: input => {
    const url = normalizeBaseUrl(input);
    if (!url) {
      return null;
    }
    setApiBaseUrl(url);
    set({url});
    saveLocalPrefs({serverUrl: url}).catch(() => undefined);
    return url;
  },
  reset: () => {
    setApiBaseUrl(DEFAULT_BASE_URL);
    set({url: DEFAULT_BASE_URL});
    saveLocalPrefs({serverUrl: null}).catch(() => undefined);
  },
}));

/** Probes GET /api/health on a candidate address without changing the active one. */
export async function probeServer(url: string, timeoutMs = 5000): Promise<{ok: boolean; message: string}> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/api/health`, {signal: ctrl.signal});
    if (!res.ok) {
      return {ok: false, message: `The server answered with HTTP ${res.status}.`};
    }
    const body = (await res.json()) as {status?: string; simulator_running?: boolean};
    return {ok: body.status === 'ok', message: body.simulator_running ? 'Connected. The market simulator is running.' : 'Connected.'};
  } catch {
    return {ok: false, message: 'No answer. Check the address, that the phone and computer share a network, and that the backend runs with --host 0.0.0.0.'};
  } finally {
    clearTimeout(t);
  }
}

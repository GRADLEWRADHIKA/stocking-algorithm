import {Platform} from 'react-native';

/**
 * Runtime configuration.
 *
 * QuantDesk is local-first: the FastAPI backend runs on your machine on port 8000.
 *  - Android emulator reaches the host machine through the alias 10.0.2.2.
 *  - iOS simulator shares the host network, so localhost works.
 *  - Physical device: set the server address in the app (Log in screen → "Server", or Profile)
 *    to your machine's LAN IP, e.g. http://192.168.1.20:8000. Start the backend with --host 0.0.0.0.
 *    The address is stored on the device; `adb reverse tcp:8000 tcp:8000` + http://localhost:8000 also works.
 *
 * No API keys of any kind are used — every price is simulated / paper traded.
 */
export const API_BASE_URL_OVERRIDE: string | null = null;

export const DEFAULT_BASE_URL = (
  API_BASE_URL_OVERRIDE ??
  Platform.select({
    android: 'http://10.0.2.2:8000',
    ios: 'http://localhost:8000',
    default: 'http://localhost:8000',
  })
).replace(/\/+$/, '');

let baseUrl = DEFAULT_BASE_URL;

/** Accepts "192.168.1.20", "192.168.1.20:8000" or a full URL; returns null when it is not a usable http(s) URL. */
export function normalizeBaseUrl(input: string): string | null {
  let v = input.trim();
  if (!v) {
    return null;
  }
  if (!/^https?:\/\//i.test(v)) {
    v = `http://${v}`;
  }
  const m = v.match(/^(https?):\/\/([^/\s:?#]+)(?::(\d{1,5}))?\/*$/i);
  if (!m) {
    return null;
  }
  const port = m[3] ?? (m[1].toLowerCase() === 'http' && !/^localhost$/i.test(m[2]) ? '8000' : undefined);
  if (port && (Number(port) < 1 || Number(port) > 65535)) {
    return null;
  }
  return `${m[1].toLowerCase()}://${m[2]}${port ? `:${port}` : ''}`;
}

/** Changes the server for every later request and WebSocket connection. */
export function setApiBaseUrl(url: string) {
  baseUrl = url.replace(/\/+$/, '');
}

export const config = {
  get apiBaseUrl() {
    return baseUrl;
  },
  get apiUrl() {
    return `${baseUrl}/api`;
  },
  get wsMarketUrl() {
    return `${baseUrl.replace(/^http/, 'ws')}/ws/market`;
  },
  requestTimeoutMs: 15000,
  demoAccount: {
    email: 'demo@quantdesk.local',
    password: 'Demo@12345',
  },
  appVersion: '1.0.0',
};

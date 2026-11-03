import {config, DEFAULT_BASE_URL, normalizeBaseUrl} from '../src/config';
import {loadLocalPrefs, saveLocalPrefs} from '../src/api/tokenStorage';
import {useServerStore} from '../src/store/server';

describe('server address', () => {
  afterEach(() => useServerStore.getState().reset());

  it('normalizes what people type', () => {
    expect(normalizeBaseUrl('192.168.1.20')).toBe('http://192.168.1.20:8000');
    expect(normalizeBaseUrl(' 192.168.1.20:9000/ ')).toBe('http://192.168.1.20:9000');
    expect(normalizeBaseUrl('http://my-pc.local:8000')).toBe('http://my-pc.local:8000');
    expect(normalizeBaseUrl('https://desk.example.com')).toBe('https://desk.example.com');
    expect(normalizeBaseUrl('localhost')).toBe('http://localhost');
  });

  it('rejects input that is not a server address', () => {
    expect(normalizeBaseUrl('')).toBeNull();
    expect(normalizeBaseUrl('ftp://1.2.3.4')).toBeNull();
    expect(normalizeBaseUrl('192.168.1.20:99999')).toBeNull();
    expect(normalizeBaseUrl('http://a b')).toBeNull();
    expect(normalizeBaseUrl('http://1.2.3.4:8000/api')).toBeNull();
  });

  it('switches every endpoint, including the WebSocket, and persists the choice', async () => {
    expect(useServerStore.getState().setUrl('10.0.0.5')).toBe('http://10.0.0.5:8000');
    expect(config.apiUrl).toBe('http://10.0.0.5:8000/api');
    expect(config.wsMarketUrl).toBe('ws://10.0.0.5:8000/ws/market');
    await new Promise(r => setTimeout(r, 0));
    expect((await loadLocalPrefs()).serverUrl).toBe('http://10.0.0.5:8000');
  });

  it('keeps other preferences when saving (theme and server live side by side)', async () => {
    await saveLocalPrefs({theme: 'light'});
    await saveLocalPrefs({serverUrl: 'http://10.0.0.9:8000'});
    expect(await loadLocalPrefs()).toMatchObject({theme: 'light', serverUrl: 'http://10.0.0.9:8000'});
  });

  it('hydrates a saved address on start and resets to the default', async () => {
    await saveLocalPrefs({serverUrl: 'http://10.0.0.7:8000'});
    await useServerStore.getState().hydrate();
    expect(config.apiBaseUrl).toBe('http://10.0.0.7:8000');
    useServerStore.getState().reset();
    expect(config.apiBaseUrl).toBe(DEFAULT_BASE_URL);
  });

  it('refuses an invalid address without changing the active one', () => {
    const before = config.apiBaseUrl;
    expect(useServerStore.getState().setUrl('not a url')).toBeNull();
    expect(config.apiBaseUrl).toBe(before);
  });
});

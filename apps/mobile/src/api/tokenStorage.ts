import * as Keychain from 'react-native-keychain';

/** JWT pair persisted in the platform secure store (Android Keystore / iOS Keychain). */
export interface StoredTokens {
  access: string;
  refresh: string;
}

const AUTH_SERVICE = 'com.quantdesk.auth';
const PREFS_SERVICE = 'com.quantdesk.prefs';

export async function loadTokens(): Promise<StoredTokens | null> {
  try {
    const res = await Keychain.getGenericPassword({service: AUTH_SERVICE});
    if (!res) {
      return null;
    }
    const parsed = JSON.parse(res.password) as Partial<StoredTokens>;
    if (typeof parsed.access === 'string' && typeof parsed.refresh === 'string') {
      return {access: parsed.access, refresh: parsed.refresh};
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  try {
    await Keychain.setGenericPassword('quantdesk', JSON.stringify(tokens), {
      service: AUTH_SERVICE,
    });
  } catch {
    // Secure storage unavailable (e.g. emulator without lock screen quirks): tokens stay in memory.
  }
}

export async function clearTokens(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({service: AUTH_SERVICE});
  } catch {
    // ignore
  }
}

/**
 * Tiny non-sensitive key/value preference store (theme etc.). Re-uses the keychain to avoid
 * pulling an extra native storage dependency into the app.
 */
export async function loadLocalPrefs(): Promise<Record<string, unknown>> {
  try {
    const res = await Keychain.getGenericPassword({service: PREFS_SERVICE});
    return res ? (JSON.parse(res.password) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Merges into the stored preferences (theme and server address live side by side). */
export async function saveLocalPrefs(prefs: Record<string, unknown>): Promise<void> {
  try {
    const current = await loadLocalPrefs();
    await Keychain.setGenericPassword('prefs', JSON.stringify({...current, ...prefs}), {
      service: PREFS_SERVICE,
    });
  } catch {
    // ignore
  }
}

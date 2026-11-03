import {create} from 'zustand';
import {loadLocalPrefs, saveLocalPrefs} from '../api/tokenStorage';

export type Mode = 'dark' | 'light';

interface ThemeState {
  mode: Mode;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Local change (persists locally; caller syncs to the server via PATCH /users/me/preferences). */
  setMode: (mode: Mode) => void;
  /** Applies the theme stored on the server profile (on login / bootstrap). */
  syncFromServer: (mode: Mode | undefined) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'dark',
  hydrated: false,
  hydrate: async () => {
    const prefs = await loadLocalPrefs();
    const mode = prefs.theme === 'light' ? 'light' : 'dark';
    set({mode, hydrated: true});
  },
  setMode: mode => {
    set({mode});
    saveLocalPrefs({theme: mode}).catch(() => undefined);
  },
  syncFromServer: mode => {
    if ((mode === 'dark' || mode === 'light') && mode !== get().mode) {
      get().setMode(mode);
    }
  },
}));

import {create} from 'zustand';
import {
  clearSession,
  getRefreshToken,
  restoreSession,
  setAuthFailureHandler,
  setSession,
  setTokenListener,
} from '../api/client';
import {api} from '../api/endpoints';
import type {TokenResponse, User} from '../api/types';
import {useThemeStore} from './theme';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

/** Hook for clearing cached server state on logout (wired to the QueryClient in App). */
let onLogout: (() => void) | null = null;
export function setLogoutHook(fn: (() => void) | null) {
  onLogout = fn;
}

export const useAuthStore = create<AuthState>((set, get) => {
  const applyTokenResponse = async (res: TokenResponse) => {
    await setSession({access: res.access_token, refresh: res.refresh_token});
    set({status: 'authenticated', user: res.user});
    useThemeStore.getState().syncFromServer(res.user.preferences?.theme);
  };

  return {
    status: 'loading',
    user: null,

    bootstrap: async () => {
      setAuthFailureHandler(() => {
        onLogout?.();
        set({status: 'unauthenticated', user: null});
      });
      setTokenListener(res => set({user: res.user}));
      const hasSession = await restoreSession();
      if (!hasSession) {
        set({status: 'unauthenticated', user: null});
        return;
      }
      try {
        const user = await api.users.me();
        set({status: 'authenticated', user});
        useThemeStore.getState().syncFromServer(user.preferences?.theme);
      } catch (e) {
        // If the backend is unreachable we still let the user in with the stored session;
        // screens show their own error states. A 401 already triggered the failure handler.
        if (get().status === 'loading') {
          set({status: 'authenticated'});
        }
      }
    },

    login: async (email, password) => {
      const res = await api.auth.login(email.trim(), password);
      await applyTokenResponse(res);
    },

    register: async (email, password, fullName) => {
      const res = await api.auth.register(email.trim(), password, fullName.trim());
      await applyTokenResponse(res);
    },

    logout: async () => {
      const refresh = getRefreshToken();
      if (refresh) {
        // Best-effort server-side revocation; never block logout on it.
        api.auth.logout(refresh).catch(() => undefined);
      }
      await clearSession();
      onLogout?.();
      set({status: 'unauthenticated', user: null});
    },

    setUser: user => set({user}),
  };
});

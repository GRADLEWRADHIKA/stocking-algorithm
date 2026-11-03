'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { TokenResponse, User } from '@shared/types/api';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  hydrated: boolean;
  setSession: (t: TokenResponse) => void;
  setUser: (u: User) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      hydrated: false,
      setSession: (t) => set({ accessToken: t.access_token, refreshToken: t.refresh_token, user: t.user }),
      setUser: (user) => set({ user }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    {
      name: 'quantdesk-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ accessToken: s.accessToken, refreshToken: s.refreshToken, user: s.user }),
      // localStorage rehydrates synchronously inside create(), before `useAuth` is assigned,
      // so defer the flag to the next tick.
      onRehydrateStorage: () => () => {
        setTimeout(() => useAuth.setState({ hydrated: true }), 0);
      },
    },
  ),
);

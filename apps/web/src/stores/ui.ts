'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  theme: 'dark' | 'light';
  sidebarCollapsed: boolean;
  activeAccountId: number | null;
  setTheme: (t: 'dark' | 'light') => void;
  toggleSidebar: () => void;
  setActiveAccount: (id: number | null) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme: 'dark',
      sidebarCollapsed: false,
      activeAccountId: null,
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setActiveAccount: (activeAccountId) => set({ activeAccountId }),
    }),
    { name: 'quantdesk-ui' },
  ),
);

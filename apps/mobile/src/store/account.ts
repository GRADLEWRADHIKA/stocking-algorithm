import {create} from 'zustand';

/** Currently selected paper-trading account (shared by Portfolio, Orders, Order ticket). */
interface AccountState {
  accountId: number | null;
  setAccountId: (id: number | null) => void;
}

export const useAccountStore = create<AccountState>(set => ({
  accountId: null,
  setAccountId: accountId => set({accountId}),
}));

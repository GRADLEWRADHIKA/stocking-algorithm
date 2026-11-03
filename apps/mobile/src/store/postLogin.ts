import {create} from 'zustand';

/** Where to go once the user has logged in (web: /login?next=/backtesting?symbol=…). */
export type PostLoginTarget = {route: 'Backtesting'; symbol: string} | {route: 'PaperTrading'} | {route: 'StrategyBuilder'};

interface PostLoginState {
  target: PostLoginTarget | null;
  set: (t: PostLoginTarget | null) => void;
}

export const usePostLogin = create<PostLoginState>(set => ({
  target: null,
  set: target => set({target}),
}));

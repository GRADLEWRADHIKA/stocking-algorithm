import type {NavigatorScreenParams} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {BottomTabScreenProps} from '@react-navigation/bottom-tabs';
import type {CompositeScreenProps} from '@react-navigation/native';
import type {OrderSide, ScreenKey, Signal} from '../api/types';
import type {PostLoginTarget} from '../store/postLogin';

export type TabParamList = {
  Home: undefined;
  Markets: undefined;
  Watchlist: undefined;
  Portfolio: undefined;
  Profile: undefined;
};

/** Same seven tabs as the web stock page. */
export type StockTab = 'overview' | 'chart' | 'technical' | 'fundamentals' | 'performance' | 'ai' | 'signals';
export type PaperTab = 'positions' | 'open' | 'executed' | 'history' | 'ledger';

export type RootStackParamList = {
  // auth (logged out): Welcome mirrors the web landing page, then Login / Register / ForgotPassword
  Welcome: undefined;
  /** `next`: where to go once signed in (web /login?next=…). */
  Login: {next?: PostLoginTarget} | undefined;
  Register: {next?: PostLoginTarget} | undefined;
  ForgotPassword: undefined;
  // app (web routes in comments)
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  StockDetail: {symbol: string; tab?: StockTab}; // /stocks/[symbol]
  Explorer: {sector?: string; screen?: ScreenKey; q?: string} | undefined; // /explorer
  Signals: {symbol?: string} | undefined; // /signals
  SignalDetail: {signal: Signal}; // full SignalCard
  StrategyBuilder: {mode?: 'screen'; editId?: number} | undefined; // /strategies
  Backtesting: {symbol?: string; strategyKey?: string; savedId?: number} | undefined; // /backtesting
  BacktestResult: {id: number};
  PaperTrading: {tab?: PaperTab} | undefined; // /paper-trading
  OrderTicket: {symbol: string; side?: OrderSide; refPrice?: number};
  Assistant: {symbol?: string; question?: string} | undefined; // /assistant
  Notifications: undefined; // topbar bell
  Alerts: {symbol?: string} | undefined; // watchlist page alerts panel
  Admin: undefined; // /admin (role ADMIN)
};

export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

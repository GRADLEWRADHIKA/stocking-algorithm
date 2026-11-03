# QuantDesk Mobile

Bare **React Native 0.79.5** (TypeScript, React Native CLI, no Expo) client for QuantDesk, a local-first
algorithmic analysis and **paper-trading** platform for a **simulated** Indian market.

> Every price in the app comes from a market simulator or a demo dataset. None of it is real NSE/BSE data.
> Every trade is a paper trade with virtual money. Nothing in the app is investment advice.

## Parity with the website

The app is built to look and work like `apps/web`: the web source is the specification.

- **Design tokens** (`src/theme/index.ts`) are the exact RGB channels of `apps/web/src/app/globals.css`
  (dark and `.light`); `__tests__/theme.test.ts` parses globals.css and fails on any drift. Chrome is
  neutral, colour lives on data, and the saffron accent is only the selection mark (sliding 1px line under
  tabs / segmented controls / bottom tabs), focus borders and the logo stroke. Primary buttons are
  ink-filled like web `variant=primary`; buy/sell are emerald/red.
- **Type**: Public Sans for text, JetBrains Mono (tabular) for every figure, the same families as the web.
- **Shared vocabulary**: the web Logo mark (react-native-svg), SourceBadge ("Simulated data", "Historical
  dataset", "Paper trading", "Demo analysis"), ActionBadge, `src/utils/fmt.ts` (a port of
  `apps/web/src/lib/format.ts`: Indian grouping, explicit signs, a dash for missing values, IST dates),
  the web empty / error / loading states and copy.
- **Motion**: price wash on tick, count-up on equity, staggered panel rise, sliding selection line, chart
  and sparkline draw-in, press-scale. Everything honours the system reduce-motion setting.
- **Features**: every web page is reachable. Bottom tabs are Home, Markets, Watchlist, Portfolio, Profile;
  the rest are stack screens linked from headers, rows and the Profile hub:

| Web route | Mobile screen |
| --- | --- |
| / (landing) | Welcome, shown before Login when logged out: hero with the four live fragments (auto-advance 4.5 s; arrows under reduce-motion), "Try the engine" live demo, "From a price to a decision", "Everything runs on your machine", "Backtest [symbol] today" (opens Backtesting on that symbol after login), footer tiles with IST clock and session status. Public endpoints only. The web "Same desk in your pocket" section is omitted (this is the app) |
| /login, /register, /forgot-password | Login (`next` param = post-login target), Register, ForgotPassword |
| /dashboard | Home (indices, breadth, sectors, session summary, movers, signals, watchlist, portfolio, signal scan, session replay) |
| /markets | Markets (live sector heat map, sector performance, most active, highest volume) |
| /explorer | Explorer (search, 8 screens, filters, sort, list/cards, pagination) |
| /stocks/[symbol] | StockDetail (Overview, Chart, Technical analysis, Fundamentals, Historical performance, AI insights, Trading signals) |
| /signals | Signals, then SignalDetail (full SignalCard) |
| /strategies | StrategyBuilder (AND/OR rule groups, Reads as, validate, evaluate, run as screen, saved + built-in) |
| /backtesting | Backtesting, then BacktestResult (full config, 8 metrics, equity/drawdown, trades, in/out of sample, compare) |
| /paper-trading | PaperTrading + OrderTicket (accounts, positions, orders, history, ledger, review step, rejections) |
| /portfolio | Portfolio (equity history, risk, statistics, allocation donuts, holdings, CSV via Share) |
| /watchlist | Watchlist (multiple lists, long-press drag to reorder, alerts) + Alerts |
| topbar bell | Notifications (live WebSocket toasts, unread badge, mark read / all) |
| /assistant | Assistant |
| /settings | Profile (settings + links hub) |
| /admin | Admin (role ADMIN only; dataset CSV upload stays web-only because there is no file-picker dependency) |

Chart layouts are saved to `PATCH /api/users/me/preferences` as `chart_config: {indicators: [{key, params,
enabled}], kind}`, the same JSON the web writes, so a layout saved on one device opens on the other.

## Stack

| Area | Library |
| --- | --- |
| Navigation | `@react-navigation/native` 7, `native-stack`, `bottom-tabs` (custom animated tab bar), `react-native-screens`, `react-native-safe-area-context` |
| Animation / gestures | `react-native-reanimated` 3.18 (Babel plugin configured), `react-native-gesture-handler` 2.25 |
| Charts | Hand-rolled SVG on `react-native-svg` 15: candlesticks, line/area, volume, indicator sub-panels, donut, sparklines |
| Server state | `@tanstack/react-query` 5 |
| Client state | `zustand` 5 (auth, theme, selected paper account) |
| Secure storage | `react-native-keychain` 10 (JWT pair plus the local theme preference) |
| Icons | `lucide-react-native` |
| Fonts | Public Sans + JetBrains Mono (SIL OFL 1.1), static TTFs in `assets/fonts`, linked with `npx react-native-asset` |
| Tests | Jest 29 and `@testing-library/react-native` 13 |

## Prerequisites

- Node 18 or later (developed on Node 22) and npm
- **Android:** JDK 17–21, Android SDK (API 35) with an emulator. Set `ANDROID_HOME`, for example
  `C:\Users\<you>\AppData\Local\Android\Sdk`
- **iOS (macOS only):** Xcode 15 or later, CocoaPods (`gem install cocoapods` or `bundle install`)
- The QuantDesk FastAPI backend running locally on port **8000**. REST is served under `/api` and the
  WebSocket under `/ws/market`.

## Install

```bash
cd apps/mobile
npm install
```

## Backend URL

The base URL is set in `src/config.ts`:

| Target | Default |
| --- | --- |
| Android emulator | `http://10.0.2.2:8000` (the emulator's alias for the host machine) |
| iOS simulator | `http://localhost:8000` |
| Physical device | Set `API_BASE_URL_OVERRIDE` to your machine's LAN IP, for example `http://192.168.1.20:8000`. On Android you can instead run `adb reverse tcp:8000 tcp:8000` and use `http://localhost:8000`. |

The app needs no API keys. Plain-HTTP (cleartext) traffic to local hosts is allowed as follows:

- **Android:** `android/app/src/main/res/xml/network_security_config.xml` allows cleartext only to
  `10.0.2.2`, `10.0.3.2`, `localhost` and `127.0.0.1`. The debug build overrides this file
  (`src/debug/res/xml/…`) to allow cleartext everywhere, so Metro and LAN backends work during development.
- **iOS:** the template's `NSAllowsLocalNetworking` setting covers `localhost`.

**Demo login:** `demo@quantdesk.local` / `Demo@12345`. The login screen has a **Use demo account** button
that fills these in.

## Run on Android

```bash
# terminal 1: Metro
npm start
# terminal 2: build, install and launch on the running emulator
npm run android
```

## Run on iOS (macOS)

```bash
cd ios && bundle install && bundle exec pod install && cd ..
npm start
npm run ios
```

The app's display name is **QuantDesk**. The native module and registered component name is
`QuantDeskMobile`.

## Quality checks

```bash
npx tsc --noEmit          # type-check (strict)
npm test                  # Jest, 16 suites: tokens vs globals.css, formatting, SignalCard, strategy rules,
                          # Supertrend segments, chart_config round-trip, watchlist reorder, navigation,
                          # live stream, paper trading, screens, API client
npx react-native config   # shows "assets": ["./assets/fonts"]
# prove the JS bundles without a Gradle build:
npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output %TEMP%/qd.bundle --assets-dest %TEMP%/qd-assets
```

### Fonts

`assets/fonts` holds the static TTFs with their OFL licences: Public Sans Regular/Medium/SemiBold/Bold from
the upstream `uswds/public-sans` repository (google/fonts only ships the variable font) and JetBrains Mono
Regular/Medium/SemiBold from `JetBrains/JetBrainsMono`. `react-native.config.js` declares the folder and
`npx react-native-asset` copied them to `android/app/src/main/assets/fonts` and into the Xcode project and
`Info.plist` `UIAppFonts`. Each weight is its own family name (`PublicSans-SemiBold`,
`JetBrainsMono-Medium`, ...) because Android resolves custom fonts by file name; `fontFor()` in
`src/theme` picks the family and never combines it with `fontWeight`. Set `CUSTOM_FONTS = false` there to
fall back to system fonts.

## Project layout

```
src/
  api/          types.ts (copy of shared/types/api.ts), client.ts (fetch + JWT + single-flight refresh,
                ApiError.errors[]), tokenStorage.ts, endpoints.ts (every REST route incl. admin), hooks.ts
  components/   Txt, Button, Badge/SourceBadge/ActionBadge, Tabs/Segmented (sliding line), Panel/KV/Stat,
                PriceText/FlashPrice, AnimatedNumber, Skeleton, States, Sheet, SelectField, TextField,
                Toast, Logo, SignalCard, SimpleMarkdown, charts/ (CandleChart, LineChart, Sparkline, Donut,
                DrawPath), analysis/ (ChartWorkspace, IndicatorPicker), market/, strategy/, backtest/,
                trading/ (OrderTicketForm, AccountSwitcher, WatchButton), watchlist/ (DraggableList, Alerts)
  hooks/        useLiveQuotes (useLive store + MarketStream), useReduceMotion, useDebounced
  navigation/   RootNavigator, TabBar, types (route to web page map)
  screens/      see the table above
  store/        auth, theme, account (zustand)
  theme/        web tokens, fonts, type scale
  utils/        fmt (web format port), rules (web rules.ts port + Reads-as sentence), supertrend,
                chartConfig, reorder, backtestForm, orderValidation, format (legacy helpers)
```

### API contract

`src/api/types.ts` is a verbatim copy of `shared/types/api.ts` with a header naming the source and the
backend behaviours the contract does not spell out: the indicator catalog includes `roc`, `hv` and
`supertrend` (`value` and `direction` = +1/-1); there are 9 built-in strategies; validation failures carry
`errors[]`; create endpoints return 201; a refused order is 201 with `status: REJECTED` and a
`rejection_reason`, which the order ticket shows as a rejection, never as success.

### Auth flow

- The access and refresh tokens are stored in the Keychain/Keystore. On launch the session is restored
  and checked with `GET /api/users/me`.
- A 401 triggers one shared `POST /api/auth/refresh`; the rotated pair is saved and the request retried
  once. If the refresh fails the app returns to the login screen.
- Login has "Use demo account" and "Use admin" fill buttons like the web. Forgot password shows the
  `dev_reset_token` returned when the backend runs with `ENV=development`.

### Live data

`useMarketStream()` (mounted once while signed in) opens one `/ws/market?token=<access>` connection, like
the web. Every stock tick and index tick goes into the `useLive` store (buffered, flushed every 250 ms,
with an up/down direction for the price wash), and `{type:'notification'}` messages raise an in-app toast
and refresh notifications (and paper orders for order notifications). It reconnects with capped
exponential backoff and pauses in the background.

## Known limitations

- No Gradle or Xcode build was run. The JS bundle, type-check and tests were verified.
- The price chart shows the most recent bars that fit the screen; there is no pan / pinch-zoom like the
  web's lightweight-charts. A touch crosshair drives the OHLC legend.
- Dates (session replay, backtest from/to) are typed as YYYY-MM-DD with quick chips; no native date
  picker dependency was added.
- Dataset CSV validate/import is web-only (no file-picker dependency); the Admin screen says so and lists
  past imports.
- The portfolio CSV report is shared as text through the system share sheet rather than saved as a file.

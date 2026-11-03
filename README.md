# QuantDesk

Algorithmic stock analysis, backtesting and paper trading for Indian equities (NSE/BSE), as a web terminal,
an Android/iOS app and a Python quant engine. **Everything runs locally.** It needs no third-party API keys,
LLM provider, broker account or internet connection at runtime.

> Prices are **simulated** (deterministic, seeded) or come from **historical CSV datasets you import**.
> They are never real-time NSE/BSE quotes, and every screen labels its source. Trading is **paper only**.
> Nothing in this software is investment advice.

| Part | Path | Stack |
| --- | --- | --- |
| Web terminal | `apps/web` | Next.js 15, TypeScript, Tailwind, Radix, Framer Motion, Lightweight Charts, TanStack Query, Zustand, RHF + Zod |
| Mobile app | `apps/mobile` | Bare React Native 0.79 CLI (no Expo), React Navigation, Reanimated, react-native-svg |
| Backend + quant engine | `backend` | FastAPI, SQLAlchemy 2, Alembic, Pydantic 2, NumPy, Pandas, SciPy, scikit-learn |
| API contract | `shared/types/api.ts` | Single source of truth for both clients |

Architecture notes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start (no Docker, no database setup)

Needs Python 3.11 and Node 22. The backend uses a local SQLite file by default and seeds itself on first start.

**1. Backend** (terminal 1, from `backend/`):

```bash
python -m venv .venv
```
```bash
.venv/Scripts/python -m pip install -r requirements.txt
```
```bash
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

On macOS/Linux use `.venv/bin/python`. API docs: http://localhost:8000/docs

**2. Web** (terminal 2, from `apps/web/`):

```bash
npm install
```
```bash
npm run dev
```

Open http://localhost:3000 and use **Use demo trader** on the login page.

| Account | Email | Password |
| --- | --- | --- |
| Demo trader | `demo@quantdesk.local` | `Demo@12345` |
| Administrator | `admin@quantdesk.local` | `Admin@12345` |

These are local development accounts created by the seed script. Change or remove them before deploying anywhere.

## Configuration

Copy `.env.example` to `.env` only if you need to change something. Every setting is application-owned:
`DATABASE_URL`, `SECRET_KEY`, `ENV`, `ACCESS_TOKEN_MINUTES`, `REFRESH_TOKEN_DAYS`, `CORS_ORIGINS`,
`LOCAL_DATA_DIRECTORY`, `SIMULATOR_SEED`, `SIMULATOR_TICK_MS` and the rate limits.

- Leave `DATABASE_URL` unset for SQLite (`backend/quantdesk.db`). The example file points at PostgreSQL,
  so copying it unchanged requires a running Postgres.
- Without `SECRET_KEY` a random development key is generated on each start, which logs everyone out on restart.
- Web: `apps/web/.env.example` (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`).

## PostgreSQL

With Docker:

```bash
docker compose up -d postgres
```

Or install PostgreSQL 16 locally and create a `quantdesk` user and database. Then set
`DATABASE_URL=postgresql+psycopg://quantdesk:quantdesk@localhost:5432/quantdesk` and run, from `backend/`:

```bash
.venv/Scripts/python -m alembic upgrade head
```
```bash
.venv/Scripts/python -m app.scripts.seed
```

### Everything in Docker

```bash
docker compose up --build
```

Starts Postgres, the backend on :8000 and the web app on :3000. The compose files are written but have not been
run on this machine yet (no Docker daemon was available).

## Data

Run these from `backend/`.

Regenerate the simulated market (51 stocks, 5 indices, 3 years of daily bars and 5 sessions of 1-minute bars).
`--reset` wipes the database, including users, paper trades and backtests:

```bash
.venv/Scripts/python -m app.scripts.seed --reset --seed 42
```

Validate, then import, a historical CSV (`timestamp,open,high,low,close,volume,symbol,exchange`):

```bash
.venv/Scripts/python -m app.scripts.import_dataset ../datasets/historical/sample_ohlcv.csv --validate-only
```
```bash
.venv/Scripts/python -m app.scripts.import_dataset ../datasets/historical/sample_ohlcv.csv
```

Admins can also upload CSVs in the web app under **Admin → Datasets**. `datasets/historical/sample_ohlcv.csv`
is synthetic test data for trying the importer. Imported rows are labelled *Historical dataset*.

## Mobile

See [apps/mobile/README.md](apps/mobile/README.md). In short, from `apps/mobile/`:

```bash
npm install
```
```bash
npm start
```
```bash
npm run android
```

For iOS on macOS, first run `cd ios && bundle exec pod install`, then `npm run ios`. The Android emulator
reaches the backend at `http://10.0.2.2:8000`, the iOS simulator at `http://localhost:8000`.

### Demo APK on a real phone

A ready-built APK is in [`releases/QuantDesk-1.0.0.apk`](releases/QuantDesk-1.0.0.apk) (ARM phones, Android 7+).

1. On the computer, start the backend so other devices on the Wi-Fi can reach it (from `backend/`):

   ```bash
   .venv/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

   Allow Python through the Windows firewall for **private** networks when asked. Find the computer's IP with `ipconfig`
   (the IPv4 address of the Wi-Fi adapter, for example `192.168.1.20`).
2. Copy the APK to the phone and open it; Android asks once to allow installs from that source.
3. In the app, tap **Server · … Change** (on the Log in screen, the Welcome footer or Profile), enter `192.168.1.20:8000`,
   tap **Test connection**, then **Save**. Log in with the demo account.

The phone and the computer must be on the same network. With a USB cable you can instead run
`adb reverse tcp:8000 tcp:8000` and use `localhost:8000` as the server.

This demo APK is signed with the React Native **debug key**, which is fine for installing directly on phones but not for the
Play Store. To publish, create your own keystore and set it under `signingConfigs.release` in `apps/mobile/android/app/build.gradle`
(see the React Native "Publishing to Google Play Store" guide). Rebuild with, from `apps/mobile/android`:

```bash
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
```

The APK is written to `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.

## Tests

| Suite | Command | Last result |
| --- | --- | --- |
| Backend (indicators, strategies, signals, backtester, paper trading, auth, API, assistant, data edge cases) | `cd backend && .venv/Scripts/python -m pytest` | 120 passed |
| Web (formatting, validation, API client and token refresh, components, login flow) | `cd apps/web && npm test` | 29 passed |
| Web type check and production build | `cd apps/web && npm run typecheck && npm run build` | passing |
| Mobile (navigation, screens, welcome, server address, API client, rules, charts, order validation) | `cd apps/mobile && npm test` | 128 passed |

## What is in the product

- **Market dashboard**: indices, breadth, sector performance, movers, a rule-written session summary, a
  portfolio snapshot, latest signals and session replay by date.
- **Explorer**: search, sector, price, volume and market-cap filters, plus screens for gainers, losers,
  momentum, breakouts, MA crossover, high volatility, oversold and overbought.
- **Analysis terminal**: candlestick, line and area charts from 1 minute to 1 month. Indicators: SMA, EMA,
  Bollinger Bands, VWAP, RSI, MACD, Stochastic, ADX, ATR, OBV and volume SMA, with adjustable parameters and a
  saved chart layout. Tabs for technicals, fundamentals, performance, AI insights and signals.
- **Quant engine**: nine strategies (EMA crossover, RSI with trend filter, MACD, Bollinger mean reversion,
  VWAP, momentum, breakout with false-breakout filter, trend following with ADX, Supertrend with ADX filter). Every signal has its
  conditions, ATR-based stop and target, risk/reward, position size, a deterministic strength score
  (not a probability) and its historical hit rate.
- **Strategy builder**: no-code AND/OR rules, validated and evaluated by a safe rule engine (no code
  execution). You can evaluate, screen, save, duplicate and backtest.
- **Backtester**: next-bar-open fills, brokerage, charges and slippage, stop-loss and target, buy-and-hold
  benchmark, Sharpe, Sortino, drawdown, profit factor, out-of-sample split and multi-strategy comparison.
- **Paper trading**: market and limit orders, attached stop-loss and target orders, cancel, positions,
  ledger, realised/unrealised/day P&L.
- **Portfolio**: allocation, equity history, risk (volatility, beta, VaR) and a CSV report.
- **Watchlists and alerts**: multiple lists, drag to reorder, and price, % change, RSI and MA-cross alerts,
  delivered as in-app notifications over WebSocket.
- **AI assistant**: local and rule-based. It answers about trends, indicators, comparisons, signals,
  strategy risk, your last backtest and the market regime, and separates observations from interpretations.
- **Admin**: health, simulator controls (seed, speed, forced regime), dataset import, users, instruments,
  jobs, configuration and the audit log.

## Known limitations

- Fundamentals are generated demo values, clearly labelled. No company filings are included.
- When today is a trading day, stored daily history ends at the previous session and today is the live
  simulated session.
- Rate limiting is in-memory per process.
- The mobile app has no custom strategy builder and reorders watchlists with buttons, not drag.
- Native Android/iOS builds and the Docker images have not been built on this machine yet.

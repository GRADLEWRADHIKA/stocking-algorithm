# QuantDesk architecture

QuantDesk is a local-first algorithmic analysis and paper-trading platform for Indian equities (NSE/BSE).
Everything runs on the developer's machine. There are no third-party API keys, no LLM providers, no broker
connections and no runtime internet dependency.

## Repository layout

```
stock-platform (this repo)
├── apps/
│   ├── web/        Next.js 15 App Router, TypeScript, Tailwind, Radix/shadcn-style UI, Framer Motion,
│   │               TradingView Lightweight Charts, TanStack Query, Zustand, React Hook Form + Zod
│   └── mobile/     Bare React Native CLI (no Expo), React Navigation, Reanimated, react-native-svg
├── backend/        FastAPI, SQLAlchemy 2, Alembic, Pydantic 2, NumPy/Pandas/SciPy/scikit-learn
│   └── app/
│       ├── api/            REST routers per domain (+ /ws/market WebSocket)
│       ├── core/           settings, security (bcrypt, JWT), DB session, errors, rate limiting
│       ├── models/         SQLAlchemy models (Postgres + SQLite portable)
│       ├── schemas/        Pydantic request/response models mirroring shared/types/api.ts
│       ├── market_data/    provider interface, historical, simulator, replay, validation, cache
│       ├── indicators/     SMA EMA RSI MACD BB VWAP ATR ADX Stoch OBV volume SMA, S/R, trend
│       ├── strategies/     8 built-in strategies + safe rule engine for the builder
│       ├── backtesting/    event-driven engine, costs, slippage, metrics, out-of-sample split
│       ├── paper_trading/  orders, fills, positions, cash ledger
│       ├── ai_assistant/   provider interface + rule-based provider
│       ├── ml/             optional scikit-learn experiments (walk-forward)
│       └── websocket/      simulated market streaming
├── shared/types/api.ts     the API contract, shared by web and mobile
├── datasets/{historical,simulated,processed}
└── docs/
```

## Data flow

```
             ┌───────────── seed (deterministic, SIMULATOR_SEED) ─────────────┐
             ▼                                                               │
  SimulatedMarketDataService ──► market_candles (1m, 1d) ◄── CSV import ◄── DataValidationService
             │                         │
   live tick loop (1 s)          HistoricalDataService ── resample 5m…4h, 1w, 1M (session-aware)
             │                         │
   /ws/market  ◄── quotes ───► REST /api/market, /api/stocks, /api/indicators
                                       │
                         IndicatorCalculationService (causal, cached)
                                       │
        ┌──────────────┬───────────────┼────────────────┬────────────────┐
   strategies     rule engine      backtester      paper trading     assistant
   (signals)      (builder)        (next-bar fills) (orders/ledger)   (rule-based)
```

## Honesty rules enforced in code

- Every market payload carries `data_source` (`SIMULATED`, `HISTORICAL_DATASET`, `PAPER_TRADING`,
  `DEMO_ANALYSIS`). The UI renders a source badge wherever prices or trades appear, and a
  "Simulated feed" label on the ticker tape.
- Indicators and strategies are strictly causal; a backtest signal on bar *t* fills at the open of *t+1*.
- Signal strength is a deterministic weighted score of condition margins. It is shown separately from
  historical win rate, and neither is presented as a probability of profit.
- The assistant only reports values it computed from local data and states when data is missing.

## Web design system

"Data terminal" direction: deep charcoal ground, panels one tone step lighter, colour reserved for data
(emerald up, red down) and a single saffron accent used only as the 1px selection line. Figures use
JetBrains Mono tabular digits; text uses Public Sans. Motion is functional: the selection line slides
between tabs (shared layout), prices wash green/red on tick, balances count up, charts draw in, panels
rise in sequence on first paint, and every move respects `prefers-reduced-motion`.

## Extension points (not implemented, by design)

- `MarketDataProvider` — add a licensed live/broker feed later.
- `AssistantProvider` — plug in a local LLM (e.g. via llama.cpp) without changing the API.
- Paper trading `ExecutionModel` — swap in a different fill model.

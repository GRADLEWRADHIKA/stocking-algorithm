# QuantDesk backend (FastAPI)

Local-first analysis & paper-trading API. **All market data is SIMULATED** (deterministic, seed 42) or
user-imported (`HISTORICAL_DATASET`); every payload carries `data_source`. No external services, keys or LLMs.
API contract: `shared/types/api.ts`. OpenAPI docs: http://localhost:8000/docs

## Commands (Windows, from `backend/`)

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt

# run (first start on an empty SQLite DB migrates + auto-seeds in a few seconds)
.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000

# seed / reseed explicitly
.\.venv\Scripts\python -m app.scripts.seed            # idempotent
.\.venv\Scripts\python -m app.scripts.seed --reset    # drop + rebuild everything
.\.venv\Scripts\python -m app.scripts.seed --reset --seed 7

# migrations (PostgreSQL: set DATABASE_URL first)
.\.venv\Scripts\python -m alembic upgrade head
.\.venv\Scripts\python -m alembic revision --autogenerate -m "change"

# import a dataset (timestamp,open,high,low,close,volume,symbol,exchange)
.\.venv\Scripts\python -m app.scripts.import_dataset ..\datasets\historical\sample_ohlcv.csv
.\.venv\Scripts\python -m app.scripts.import_dataset file.csv --validate-only

# tests
.\.venv\Scripts\python -m pytest
```

Demo users: `demo@quantdesk.local / Demo@12345` (USER), `admin@quantdesk.local / Admin@12345` (ADMIN).

## Notes
* Database: `DATABASE_URL` (PostgreSQL via psycopg 3). Unset or `sqlite...` -> `backend/quantdesk.db`.
* Stored timeframes are `1d` and `1m` (last 5 sessions); 5m/15m/30m/1h/4h/1w/1M are resampled
  session-aware on the fly. Daily history ends at the last completed session before the live simulated
  session (today when today is an NSE trading day); the live session ticks every `SIMULATOR_TICK_MS`
  (one simulated minute per tick) on top of the last stored close and feeds both REST quotes and `/ws/market`.
* Indices (NIFTY50, SENSEX, NIFTYBANK, NIFTYIT, NIFTYMIDCAP) are cap-weighted aggregates of simulated
  constituents, rebased to plausible levels — not official index values.
* VWAP: session-anchored for intraday bars; rolling 20-bar typical-price VWAP on daily and higher.
* Backtests: signal on bar close, fill at next bar open, adverse slippage, capped brokerage + costs,
  SL/TP intrabar (stop first if both), Sharpe with rf=0 and sqrt(bars/year).
* `datasets/historical/sample_ohlcv.csv` is synthetic test data for the import pipeline.

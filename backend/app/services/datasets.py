"""Dataset import pipeline: validate CSV -> upsert instruments -> replace candles (HISTORICAL_DATASET)."""
from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.db import get_engine
from app.market_data.live import live_market
from app.market_data.provider import market_data
from app.market_data.validation import validate_csv
from app.models import DatasetImport, MarketCandle, Stock
from app.repositories.stocks import bulk_insert_candles, get_or_create_exchange, registry
from app.services.audit import audit


def _known_symbols() -> set[str]:
    return {s.symbol for s in registry.all(include_inactive=True, instrument_type=None)}


def validate_dataset(db: Session, content: bytes, filename: str, user_id: int | None) -> dict:
    res = validate_csv(content, filename, _known_symbols())
    rep = res.report()
    db.add(DatasetImport(user_id=user_id, filename=filename, status="VALIDATED" if res.is_valid else "INVALID",
                         rows=res.rows, valid_rows=res.valid_rows, imported_rows=0, duplicates_removed=res.duplicates_removed,
                         symbols=res.symbols, report=rep))
    db.commit()
    return rep


def import_dataset(db: Session, content: bytes, filename: str, user_id: int | None, ip: str | None = None) -> dict:
    res = validate_csv(content, filename, _known_symbols())
    rep = res.report()
    imported = 0
    if res.structural_error or res.clean is None or res.clean.empty:
        rep["imported_rows"] = 0
        db.add(DatasetImport(user_id=user_id, filename=filename, status="FAILED", rows=res.rows, valid_rows=res.valid_rows,
                             imported_rows=0, duplicates_removed=res.duplicates_removed, symbols=res.symbols, report=rep))
        audit(db, "dataset.import", user_id=user_id, ip=ip, success=False, details={"filename": filename})
        db.commit()
        return rep
    clean = res.clean
    touched: list[int] = []
    for (sym, exch), g in clean.groupby(["symbol", "exchange"]):
        ex = get_or_create_exchange(db, exch)
        st = db.execute(select(Stock).where(Stock.symbol == sym, Stock.exchange_id == ex.id)).unique().scalar_one_or_none()
        if st is None:
            st = Stock(symbol=sym, name=sym, exchange_id=ex.id, sector="Unclassified", instrument_type="EQUITY",
                       data_source="HISTORICAL_DATASET", fundamentals_source="HISTORICAL_DATASET", is_active=True,
                       description=f"{sym}: instrument created from imported dataset '{filename}'.", sim_params={})
            db.add(st)
            db.flush()
        elif st.instrument_type == "INDEX":
            rep["warnings"].append({"row": None, "message": f"{sym} is an index instrument; rows skipped"})
            continue
        elif st.data_source == "SIMULATED":
            rep["warnings"].append({"row": None, "message": f"{sym} was a simulated instrument; its simulated candles were "
                                                             "replaced by the imported HISTORICAL_DATASET data"})
            db.execute(delete(MarketCandle).where(MarketCandle.stock_id == st.id))
            st.data_source = "HISTORICAL_DATASET"
            st.fundamentals_source = "HISTORICAL_DATASET"
            # simulated fundamentals no longer describe this instrument: clear them rather than mislabel
            st.pe_ratio = st.pb_ratio = st.eps = st.dividend_yield = st.book_value = st.market_cap = None
            live_market.remove(sym)
        for tf, gg in g.groupby("timeframe"):
            ts_list = gg["time"].astype(int).tolist()
            for k in range(0, len(ts_list), 500):
                db.execute(delete(MarketCandle).where(MarketCandle.stock_id == st.id, MarketCandle.timeframe == tf,
                                                      MarketCandle.ts.in_(ts_list[k:k + 500])))
        touched.append(st.id)
        db.flush()
        db.commit()
        with get_engine().begin() as conn:
            for tf, gg in g.groupby("timeframe"):
                imported += bulk_insert_candles(conn, st.id, tf, gg[["time", "open", "high", "low", "close", "volume"]],
                                                "HISTORICAL_DATASET")
    rep["imported_rows"] = imported
    db.add(DatasetImport(user_id=user_id, filename=filename, status="IMPORTED", rows=res.rows, valid_rows=res.valid_rows,
                         imported_rows=imported, duplicates_removed=res.duplicates_removed, symbols=res.symbols, report=rep))
    audit(db, "dataset.import", user_id=user_id, ip=ip, details={"filename": filename, "imported_rows": imported})
    db.commit()
    registry.invalidate()
    for sid in touched:
        market_data.invalidate(sid)
    return rep


def list_imports(db: Session, limit: int = 100) -> list[dict]:
    rows = db.execute(select(DatasetImport).order_by(DatasetImport.created_at.desc()).limit(limit)).scalars().all()
    return [{"id": r.id, "filename": r.filename, "status": r.status, "rows": r.rows, "valid_rows": r.valid_rows,
             "imported_rows": r.imported_rows, "duplicates_removed": r.duplicates_removed, "symbols": r.symbols,
             "created_at": r.created_at.isoformat(), "report": r.report} for r in rows]

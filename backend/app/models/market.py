from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import Money, TimestampMixin, UTCDateTime


class Exchange(Base):
    __tablename__ = "exchanges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(8), unique=True, nullable=False)  # NSE / BSE
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    timezone: Mapped[str] = mapped_column(String(40), nullable=False, default="Asia/Kolkata")
    session_open: Mapped[str] = mapped_column(String(5), nullable=False, default="09:15")
    session_close: Mapped[str] = mapped_column(String(5), nullable=False, default="15:30")


class Stock(TimestampMixin, Base):
    """Tradable instrument. Indices are stored as instruments with instrument_type='INDEX'."""

    __tablename__ = "stocks"
    __table_args__ = (
        UniqueConstraint("symbol", "exchange_id", name="uq_stocks_symbol_exchange"),
        Index("ix_stocks_sector", "sector"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    exchange_id: Mapped[int] = mapped_column(ForeignKey("exchanges.id"), nullable=False)
    instrument_type: Mapped[str] = mapped_column(String(10), nullable=False, default="EQUITY")
    sector: Mapped[str] = mapped_column(String(64), nullable=False, default="Unclassified")
    industry: Mapped[str | None] = mapped_column(String(100), nullable=True)
    isin: Mapped[str | None] = mapped_column(String(12), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    market_cap: Mapped[Decimal | None] = mapped_column(Numeric(20, 2), nullable=True)  # INR crore
    shares_outstanding: Mapped[float | None] = mapped_column(Float, nullable=True)
    pe_ratio: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    pb_ratio: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    eps: Mapped[Decimal | None] = mapped_column(Money, nullable=True)
    dividend_yield: Mapped[Decimal | None] = mapped_column(Numeric(8, 4), nullable=True)
    book_value: Mapped[Decimal | None] = mapped_column(Money, nullable=True)
    face_value: Mapped[Decimal | None] = mapped_column(Money, nullable=True)
    fundamentals_source: Mapped[str] = mapped_column(String(24), nullable=False, default="SIMULATED")
    data_source: Mapped[str] = mapped_column(String(24), nullable=False, default="SIMULATED")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # simulator parameters (only meaningful for simulated instruments)
    sim_params: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    exchange: Mapped[Exchange] = relationship(lazy="joined")


class IndexConstituent(Base):
    __tablename__ = "index_constituents"
    __table_args__ = (UniqueConstraint("index_id", "stock_id", name="uq_index_constituent"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    index_id: Mapped[int] = mapped_column(ForeignKey("stocks.id", ondelete="CASCADE"), nullable=False)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stocks.id", ondelete="CASCADE"), nullable=False)
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)  # cap weight at rebase


class MarketCandle(Base):
    """OHLCV bar. ts = bar open time as UNIX epoch seconds (UTC). Stored timeframes: '1m' and '1d'."""

    __tablename__ = "market_candles"
    __table_args__ = (
        UniqueConstraint("stock_id", "timeframe", "ts", name="uq_candle_stock_tf_ts"),
        Index("ix_candles_stock_tf_ts", "stock_id", "timeframe", "ts"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stocks.id", ondelete="CASCADE"), nullable=False)
    timeframe: Mapped[str] = mapped_column(String(4), nullable=False)
    ts: Mapped[int] = mapped_column(BigInteger, nullable=False)
    open: Mapped[Decimal] = mapped_column(Money, nullable=False)
    high: Mapped[Decimal] = mapped_column(Money, nullable=False)
    low: Mapped[Decimal] = mapped_column(Money, nullable=False)
    close: Mapped[Decimal] = mapped_column(Money, nullable=False)
    volume: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    data_source: Mapped[str] = mapped_column(String(24), nullable=False)


class TechnicalIndicator(Base):
    """Cached latest indicator snapshot per instrument/timeframe (written by scans)."""

    __tablename__ = "technical_indicators"
    __table_args__ = (UniqueConstraint("stock_id", "timeframe", name="uq_ti_stock_tf"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stocks.id", ondelete="CASCADE"), nullable=False)
    timeframe: Mapped[str] = mapped_column(String(4), nullable=False)
    ts: Mapped[int] = mapped_column(BigInteger, nullable=False)
    values: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    computed_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)

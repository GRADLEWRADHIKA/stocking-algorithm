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
from app.models.base import Money, TimestampMixin, UTCDateTime, utcnow
from app.models.market import Stock


# ------------------------------------------------------------------ watchlists
class Watchlist(TimestampMixin, Base):
    __tablename__ = "watchlists"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_watchlist_user_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    items: Mapped[list["WatchlistItem"]] = relationship(
        back_populates="watchlist", cascade="all, delete-orphan", order_by="WatchlistItem.position"
    )


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"
    __table_args__ = (UniqueConstraint("watchlist_id", "stock_id", name="uq_watchlist_item"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    watchlist_id: Mapped[int] = mapped_column(ForeignKey("watchlists.id", ondelete="CASCADE"), nullable=False)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stocks.id", ondelete="CASCADE"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    added_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)

    watchlist: Mapped[Watchlist] = relationship(back_populates="items")
    stock: Mapped[Stock] = relationship(lazy="joined")


# ------------------------------------------------------------------ strategies & signals
class Strategy(TimestampMixin, Base):
    __tablename__ = "strategies"
    __table_args__ = (Index("ix_strategies_user", "user_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    definition: Mapped[dict] = mapped_column(JSON, nullable=False)
    conditions: Mapped[list["StrategyCondition"]] = relationship(
        back_populates="strategy", cascade="all, delete-orphan", order_by="StrategyCondition.position"
    )


class StrategyCondition(Base):
    """Normalized mirror of StrategyDefinition rules (one row per condition)."""

    __tablename__ = "strategy_conditions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    strategy_id: Mapped[int] = mapped_column(ForeignKey("strategies.id", ondelete="CASCADE"), nullable=False, index=True)
    group_type: Mapped[str] = mapped_column(String(8), nullable=False)  # ENTRY / EXIT
    group_logic: Mapped[str] = mapped_column(String(3), nullable=False)  # AND / OR
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    left_operand: Mapped[dict] = mapped_column(JSON, nullable=False)
    operator: Mapped[str] = mapped_column(String(16), nullable=False)
    right_operand: Mapped[dict] = mapped_column(JSON, nullable=False)

    strategy: Mapped[Strategy] = relationship(back_populates="conditions")


class TradingSignal(Base):
    __tablename__ = "trading_signals"
    __table_args__ = (
        Index("ix_signals_created", "created_at"),
        Index("ix_signals_stock_strategy", "stock_id", "strategy_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stocks.id", ondelete="CASCADE"), nullable=False)
    strategy_key: Mapped[str] = mapped_column(String(40), nullable=False)
    timeframe: Mapped[str] = mapped_column(String(4), nullable=False)
    bar_ts: Mapped[int] = mapped_column(BigInteger, nullable=False)
    action: Mapped[str] = mapped_column(String(4), nullable=False)
    price: Mapped[Decimal] = mapped_column(Money, nullable=False)
    strength_score: Mapped[float] = mapped_column(Float, nullable=False)
    data_source: Mapped[str] = mapped_column(String(24), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)  # full Signal document
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)

    stock: Mapped[Stock] = relationship(lazy="joined")


# ------------------------------------------------------------------ backtests
class BacktestRun(Base):
    __tablename__ = "backtest_runs"
    __table_args__ = (Index("ix_backtests_user_created", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stocks.id", ondelete="CASCADE"), nullable=False)
    strategy_name: Mapped[str] = mapped_column(String(160), nullable=False)
    timeframe: Mapped[str] = mapped_column(String(4), nullable=False)
    config: Mapped[dict] = mapped_column(JSON, nullable=False)
    data_source: Mapped[str] = mapped_column(String(24), nullable=False)
    bars: Mapped[int] = mapped_column(Integer, nullable=False)
    period_start: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    period_end: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    metrics: Mapped[dict] = mapped_column(JSON, nullable=False)
    in_sample: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    out_of_sample: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    equity_curve: Mapped[list] = mapped_column(JSON, nullable=False)
    drawdown_curve: Mapped[list] = mapped_column(JSON, nullable=False)
    assumptions: Mapped[list] = mapped_column(JSON, nullable=False)
    total_return_pct: Mapped[float] = mapped_column(Float, nullable=False)
    max_drawdown_pct: Mapped[float] = mapped_column(Float, nullable=False)
    sharpe_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    num_trades: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)

    stock: Mapped[Stock] = relationship(lazy="joined")
    trades: Mapped[list["BacktestTrade"]] = relationship(
        back_populates="run", cascade="all, delete-orphan", order_by="BacktestTrade.entry_time"
    )


class BacktestTrade(Base):
    __tablename__ = "backtest_trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("backtest_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    entry_time: Mapped[int] = mapped_column(BigInteger, nullable=False)
    exit_time: Mapped[int] = mapped_column(BigInteger, nullable=False)
    side: Mapped[str] = mapped_column(String(5), nullable=False, default="LONG")
    entry_price: Mapped[Decimal] = mapped_column(Money, nullable=False)
    exit_price: Mapped[Decimal] = mapped_column(Money, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    pnl: Mapped[Decimal] = mapped_column(Money, nullable=False)
    pnl_pct: Mapped[float] = mapped_column(Float, nullable=False)
    costs: Mapped[Decimal] = mapped_column(Money, nullable=False)
    bars_held: Mapped[int] = mapped_column(Integer, nullable=False)
    exit_reason: Mapped[str] = mapped_column(String(16), nullable=False)

    run: Mapped[BacktestRun] = relationship(back_populates="trades")


# ------------------------------------------------------------------ paper trading
class PaperAccount(TimestampMixin, Base):
    __tablename__ = "paper_accounts"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_paper_account_user_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    initial_capital: Mapped[Decimal] = mapped_column(Money, nullable=False)
    cash_balance: Mapped[Decimal] = mapped_column(Money, nullable=False)
    blocked_margin: Mapped[Decimal] = mapped_column(Money, nullable=False, default=Decimal("0"))
    realized_pnl: Mapped[Decimal] = mapped_column(Money, nullable=False, default=Decimal("0"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class PaperOrder(TimestampMixin, Base):
    __tablename__ = "paper_orders"
    __table_args__ = (Index("ix_paper_orders_account_status", "account_id", "status"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("paper_accounts.id", ondelete="CASCADE"), nullable=False)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stocks.id"), nullable=False)
    side: Mapped[str] = mapped_column(String(4), nullable=False)
    order_type: Mapped[str] = mapped_column(String(12), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    limit_price: Mapped[Decimal | None] = mapped_column(Money, nullable=True)
    trigger_price: Mapped[Decimal | None] = mapped_column(Money, nullable=True)
    stop_loss: Mapped[Decimal | None] = mapped_column(Money, nullable=True)
    take_profit: Mapped[Decimal | None] = mapped_column(Money, nullable=True)
    parent_order_id: Mapped[int | None] = mapped_column(ForeignKey("paper_orders.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="PENDING")
    filled_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    avg_fill_price: Mapped[Decimal | None] = mapped_column(Money, nullable=True)
    fees: Mapped[Decimal] = mapped_column(Money, nullable=False, default=Decimal("0"))
    blocked_amount: Mapped[Decimal] = mapped_column(Money, nullable=False, default=Decimal("0"))
    realized_pnl: Mapped[Decimal | None] = mapped_column(Money, nullable=True)
    holding_seconds: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    filled_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)

    stock: Mapped[Stock] = relationship(lazy="joined")


class PaperPosition(TimestampMixin, Base):
    __tablename__ = "paper_positions"
    __table_args__ = (UniqueConstraint("account_id", "stock_id", name="uq_position_account_stock"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("paper_accounts.id", ondelete="CASCADE"), nullable=False)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stocks.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    avg_price: Mapped[Decimal] = mapped_column(Money, nullable=False, default=Decimal("0"))  # cost basis incl. buy fees
    realized_pnl: Mapped[Decimal] = mapped_column(Money, nullable=False, default=Decimal("0"))
    opened_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)

    stock: Mapped[Stock] = relationship(lazy="joined")


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (Index("ix_transactions_account_created", "account_id", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("paper_accounts.id", ondelete="CASCADE"), nullable=False)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("paper_orders.id", ondelete="SET NULL"), nullable=True)
    type: Mapped[str] = mapped_column(String(8), nullable=False)  # DEPOSIT BUY SELL FEES
    stock_id: Mapped[int | None] = mapped_column(ForeignKey("stocks.id"), nullable=True)
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price: Mapped[Decimal | None] = mapped_column(Money, nullable=True)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Money, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)

    stock: Mapped[Stock | None] = relationship(lazy="joined")


# ------------------------------------------------------------------ alerts & notifications
class Alert(TimestampMixin, Base):
    __tablename__ = "alerts"
    __table_args__ = (Index("ix_alerts_active", "is_active"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stocks.id", ondelete="CASCADE"), nullable=False)
    alert_type: Mapped[str] = mapped_column(String(20), nullable=False)
    threshold: Mapped[Decimal | None] = mapped_column(Money, nullable=True)
    params: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    triggered_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    state: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)  # e.g. last relation for cross alerts

    stock: Mapped[Stock] = relationship(lazy="joined")


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_read", "user_id", "is_read"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)


__all__ = [
    "Watchlist", "WatchlistItem", "Strategy", "StrategyCondition", "TradingSignal", "BacktestRun",
    "BacktestTrade", "PaperAccount", "PaperOrder", "PaperPosition", "Transaction", "Alert", "Notification",
    "Numeric",
]

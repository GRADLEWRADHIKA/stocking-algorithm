"""NSE trading calendar: sessions 09:15-15:30 Asia/Kolkata (UTC+05:30, no DST), weekdays minus holidays."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from app.market_data.holidays import is_holiday

IST = timezone(timedelta(hours=5, minutes=30), name="IST")
SESSION_OPEN = time(9, 15)
SESSION_CLOSE = time(15, 30)
PRE_OPEN = time(9, 0)
SESSION_MINUTES = 375  # 09:15 -> 15:30


def is_trading_day(d: date) -> bool:
    return d.weekday() < 5 and not is_holiday(d)


def trading_days(start: date, end: date) -> list[date]:
    out = []
    d = start
    while d <= end:
        if is_trading_day(d):
            out.append(d)
        d += timedelta(days=1)
    return out


def last_trading_day_on_or_before(d: date) -> date:
    while not is_trading_day(d):
        d -= timedelta(days=1)
    return d


def previous_trading_day(d: date) -> date:
    return last_trading_day_on_or_before(d - timedelta(days=1))


def next_trading_day(d: date) -> date:
    d += timedelta(days=1)
    while not is_trading_day(d):
        d += timedelta(days=1)
    return d


def session_open_dt(d: date) -> datetime:
    return datetime.combine(d, SESSION_OPEN, tzinfo=IST)


def session_close_dt(d: date) -> datetime:
    return datetime.combine(d, SESSION_CLOSE, tzinfo=IST)


def session_open_ts(d: date) -> int:
    return int(session_open_dt(d).timestamp())


def daily_bar_ts(d: date) -> int:
    """Daily bars are stamped at the session open (09:15 IST) of their trading day."""
    return session_open_ts(d)


def ts_to_ist(ts: int) -> datetime:
    return datetime.fromtimestamp(ts, tz=IST)


def ts_to_session_date(ts: int) -> date:
    return ts_to_ist(ts).date()


def now_ist() -> datetime:
    return datetime.now(tz=IST)


def session_state(now: datetime | None = None) -> str:
    """'OPEN' | 'CLOSED' | 'PRE_OPEN' based on the real wall clock in IST."""
    now = (now or now_ist()).astimezone(IST)
    if not is_trading_day(now.date()):
        return "CLOSED"
    t = now.time()
    if PRE_OPEN <= t < SESSION_OPEN:
        return "PRE_OPEN"
    if SESSION_OPEN <= t < SESSION_CLOSE:
        return "OPEN"
    return "CLOSED"


def market_today(override: str | None = None) -> date:
    if override:
        return date.fromisoformat(override)
    return now_ist().date()


def history_and_live_dates(today: date) -> tuple[date, date]:
    """Return (history_end, live_session_date).

    Stored daily history ends at the last *completed* trading session strictly before the live
    simulated session. The live session is today when today is a trading day, otherwise the next
    trading day (prices for it are simulated ticks layered on top of the last stored close).
    """
    if is_trading_day(today):
        return previous_trading_day(today), today
    return last_trading_day_on_or_before(today), next_trading_day(today)
